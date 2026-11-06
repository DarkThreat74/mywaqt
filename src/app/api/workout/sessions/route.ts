import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { isValidUUID } from "@/lib/validation";
import { recommendLoadKg, estimateE1rm } from "@/lib/workout/recommend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const [sess] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id!), eq(schema.workoutSessions.userId, session.userId))).limit(1);
    if (!sess) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const sets = await db.select().from(schema.workoutSets)
      .where(eq(schema.workoutSets.sessionId, id)).orderBy(asc(schema.workoutSets.slug), asc(schema.workoutSets.setIndex));
    return NextResponse.json({ session: sess, sets });
  }
  const lastFor = request.nextUrl.searchParams.get("lastFor");
  if (lastFor) {
    // Strong-style: the previous COMPLETED session for this profile + its sets,
    // so the client can pre-fill last time's weight/reps.
    const sessions = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, session.userId), eq(schema.workoutSessions.dayId, lastFor)))
      .orderBy(desc(schema.workoutSessions.startedAt)).limit(10);
    const prev = sessions.find((s) => s.endedAt);
    if (!prev) return NextResponse.json({ sets: [] });
    const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.sessionId, prev.id));
    return NextResponse.json({ sets, sessionId: prev.id });
  }
  const sessions = await db.select().from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.userId, session.userId))
    .orderBy(desc(schema.workoutSessions.startedAt)).limit(50);
  // Abandoned sessions: >30min old, still open → purge if empty, else end at
  // the last logged set's time (the session's real duration).
  for (const s of sessions.filter((x) => !x.endedAt && Date.now() - x.startedAt.getTime() > 30 * 60000)) {
    const doneSets = await db.select().from(schema.workoutSets)
      .where(and(eq(schema.workoutSets.sessionId, s.id), eq(schema.workoutSets.done, true)));
    if (!doneSets.length) {
      await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.id, s.id));
      sessions.splice(sessions.indexOf(s), 1);
    } else {
      const lastLoggedAt = doneSets.reduce((latest, set) => {
        const at = set.loggedAt?.getTime() ?? s.startedAt.getTime();
        return Math.max(latest, at);
      }, s.startedAt.getTime());
      s.endedAt = new Date(Math.max(s.startedAt.getTime(), Math.min(lastLoggedAt, Date.now())));
      await db.update(schema.workoutSessions).set({ endedAt: s.endedAt }).where(eq(schema.workoutSessions.id, s.id));
    }
  }
  const sessionIds = sessions.map((s) => s.id);
  const completed = sessionIds.length
      ? await db.select({
        sessionId: schema.workoutSets.sessionId,
        slug: schema.workoutSets.slug,
        weight: schema.workoutSets.weight,
        reps: schema.workoutSets.reps,
        rir: schema.workoutSets.rir,
      }).from(schema.workoutSets)
        .where(and(inArray(schema.workoutSets.sessionId, sessionIds), eq(schema.workoutSets.done, true)))
    : [];
  const bySession = new Map<string, Map<string, { setCount: number; recommendedWeightKg: number }>>();
  for (const set of completed) {
    const weight = Number.parseFloat(set.weight || "");
    if (!(weight > 0) || !(set.reps && set.reps > 0)) continue;
    const exercises = bySession.get(set.sessionId) || new Map<string, { setCount: number; recommendedWeightKg: number }>();
    const previous = exercises.get(set.slug) || { setCount: 0, recommendedWeightKg: 0 };
    const recommendation = recommendLoadKg(weight, set.rir);
    previous.setCount += 1;
    previous.recommendedWeightKg = Math.max(previous.recommendedWeightKg, recommendation.kg);
    exercises.set(set.slug, previous);
    bySession.set(set.sessionId, exercises);
  }
  // PR detection: for each session (oldest→newest), an exercise counts as a PR
  // when its best e1RM beats every prior session's best for that slug.
  const bestSoFar = new Map<string, number>();
  const prMap = new Map<string, Set<string>>(); // sessionId -> pr slugs
  const sessionBestE1 = new Map<string, Map<string, number>>();
  for (const set of completed) {
    const w = Number.parseFloat(set.weight || "");
    if (!(w > 0) || !(set.reps && set.reps > 0) || set.reps > 12) continue;
    const e1 = estimateE1rm(w, Math.min(12, set.reps + (set.rir ?? 0)));
    const m = sessionBestE1.get(set.sessionId) || new Map<string, number>();
    m.set(set.slug, Math.max(m.get(set.slug) || 0, e1));
    sessionBestE1.set(set.sessionId, m);
  }
  for (const s of [...sessions].reverse()) {
    const m = sessionBestE1.get(s.id);
    if (!m) continue;
    for (const [slug, e1] of m) {
      // The endpoint intentionally returns only the latest 50 sessions. Do
      // not call the oldest visible session a PR when its older history is
      // outside this window; there is no baseline to prove that.
      if (bestSoFar.has(slug) && e1 > bestSoFar.get(slug)! * 1.005) {
        const prs = prMap.get(s.id) || new Set<string>();
        prs.add(slug);
        prMap.set(s.id, prs);
      }
      bestSoFar.set(slug, Math.max(bestSoFar.get(slug) || 0, e1));
    }
  }
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      completedExercises: [...(bySession.get(s.id) || new Map())].map(([slug, summary]) => ({
        slug,
        setCount: summary.setCount,
        recommendedWeightKg: Math.round(summary.recommendedWeightKg * 10) / 10,
        pr: prMap.get(s.id)?.has(slug) ?? false,
      })),
    })),
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { dayId, dayName, clientId, exerciseOrder, readiness, startedAt } = await request.json() as { dayId?: string; dayName?: string; clientId?: string; exerciseOrder?: Record<string, number>; readiness?: { sleepHours?: number; energy?: number; soreness?: number; stress?: number }; startedAt?: string };
    if (!dayId || !dayName) return NextResponse.json({ error: "dayId + dayName required." }, { status: 400 });
    // Reuse an unfinished session for the same day — a crash/refresh resumes it.
    const [open] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, session.userId), eq(schema.workoutSessions.dayId, dayId!)))
      .orderBy(desc(schema.workoutSessions.startedAt)).limit(1);
    if (open && !open.endedAt) {
      const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.sessionId, open.id));
      const stale = Date.now() - open.startedAt.getTime() > 30 * 60000;
      const hasCompletedSets = sets.some((set) => set.done);
      if (!stale || hasCompletedSets) {
        return NextResponse.json({ session: open, sets, resumed: true });
      }
      // Empty abandoned sessions must not trap the next workout into resuming
      // a dead timer forever.
      await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.id, open.id));
    }
    const [sess] = await db.insert(schema.workoutSessions).values({
      ...(clientId && isValidUUID(clientId) ? { id: clientId } : {}),
      userId: session.userId, dayId, dayName: String(dayName).slice(0, 60),
      exerciseOrder: exerciseOrder && typeof exerciseOrder === "object" ? exerciseOrder : null,
      readiness: readiness && typeof readiness === "object" ? readiness : null,
      ...(startedAt && !Number.isNaN(Date.parse(startedAt)) ? { startedAt: new Date(startedAt) } : {}),
    }).returning();
    return NextResponse.json({ session: sess, sets: [] }, { status: 201 });
  } catch (e) {
    logError(e, { route: "workout/sessions POST" });
    const message = e instanceof Error ? e.message : "";
    if (/column .* does not exist|relation .* does not exist/i.test(message)) {
      return NextResponse.json({ error: "Workout database migration 0099 is not applied on this deployment.", code: "WORKOUT_MIGRATION_REQUIRED" }, { status: 500 });
    }
    return NextResponse.json({ error: "Workout session could not be created.", code: "WORKOUT_SESSION_CREATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, end, endAt, readiness, exerciseOrder, startedAt } = await request.json() as { id?: string; end?: boolean; endAt?: string; readiness?: { sleepHours?: number; energy?: number; soreness?: number; stress?: number }; exerciseOrder?: Record<string, number>; startedAt?: string };
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    const endDate = endAt && !Number.isNaN(Date.parse(endAt)) ? new Date(endAt) : new Date();
    const [owned] = await db.select({ id: schema.workoutSessions.id })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, session.userId)))
      .limit(1);
    if (!owned) return NextResponse.json({ error: "Workout session not found." }, { status: 404 });
    await db.update(schema.workoutSessions)
      .set({
        ...(end ? { endedAt: endDate, endedReason: "completed" } : {}),
        ...(readiness && typeof readiness === "object" ? { readiness } : {}),
        ...(exerciseOrder && typeof exerciseOrder === "object" ? { exerciseOrder } : {}),
        ...(startedAt && !Number.isNaN(Date.parse(startedAt)) ? { startedAt: new Date(startedAt) } : {}),
      })
      .where(and(eq(schema.workoutSessions.id, id!), eq(schema.workoutSessions.userId, session.userId)));
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sessions PATCH" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    // sets cascade on session delete — deleting the row removes its sets too
    await db.delete(schema.workoutSessions).where(and(eq(schema.workoutSessions.id, id), eq(schema.workoutSessions.userId, session.userId)));
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sessions DELETE" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
