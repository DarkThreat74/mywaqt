import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

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
      s.endedAt = new Date(s.startedAt.getTime() + 30 * 60000); // approx real end
      await db.update(schema.workoutSessions).set({ endedAt: s.endedAt }).where(eq(schema.workoutSessions.id, s.id));
    }
  }
  const sessionIds = sessions.map((s) => s.id);
  const completed = sessionIds.length
    ? await db.select({
        sessionId: schema.workoutSets.sessionId,
        slug: schema.workoutSets.slug,
      }).from(schema.workoutSets)
        .where(and(inArray(schema.workoutSets.sessionId, sessionIds), eq(schema.workoutSets.done, true)))
    : [];
  const bySession = new Map<string, Map<string, number>>();
  for (const set of completed) {
    const exercises = bySession.get(set.sessionId) || new Map<string, number>();
    exercises.set(set.slug, (exercises.get(set.slug) || 0) + 1);
    bySession.set(set.sessionId, exercises);
  }
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      completedExercises: [...(bySession.get(s.id) || new Map())].map(([slug, setCount]) => ({ slug, setCount })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { dayId, dayName } = await request.json() as { dayId?: string; dayName?: string };
    if (!dayId || !dayName) return NextResponse.json({ error: "dayId + dayName required." }, { status: 400 });
    // Reuse an unfinished session for the same day — a crash/refresh resumes it.
    const [open] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, session.userId), eq(schema.workoutSessions.dayId, dayId!)))
      .orderBy(desc(schema.workoutSessions.startedAt)).limit(1);
    if (open && !open.endedAt) {
      const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.sessionId, open.id));
      return NextResponse.json({ session: open, sets, resumed: true });
    }
    const [sess] = await db.insert(schema.workoutSessions).values({
      userId: session.userId, dayId, dayName: String(dayName).slice(0, 60),
    }).returning();
    return NextResponse.json({ session: sess, sets: [] }, { status: 201 });
  } catch (e) { logError(e, { route: "workout/sessions POST" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, end, endAt } = await request.json() as { id?: string; end?: boolean; endAt?: string };
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    const endDate = endAt && !Number.isNaN(Date.parse(endAt)) ? new Date(endAt) : new Date();
    await db.update(schema.workoutSessions)
      .set(end ? { endedAt: endDate } : {})
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
