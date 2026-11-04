import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Upsert a set: { sessionId, slug, setIndex, weight, reps, done }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId, slug, setIndex, weight, reps, rir, setType, variation, side, loggedAt, restAfterSec, pain, techniqueFlag, isPartial, done } = await request.json() as { sessionId?: string; slug?: string; setIndex?: number; weight?: string | number | null; reps?: number | null; rir?: number | null; setType?: string; variation?: string | null; side?: string | null; loggedAt?: string; restAfterSec?: number | null; pain?: number | null; techniqueFlag?: string | null; isPartial?: boolean; done?: boolean };
    if (!sessionId || !slug || !Number.isInteger(setIndex)) {
      return NextResponse.json({ error: "sessionId, slug, setIndex required." }, { status: 400 });
    }
    const [sess] = await db.select().from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, sessionId!), eq(schema.workoutSessions.userId, session.userId))).limit(1);
    if (!sess) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const loggedDate = loggedAt && !Number.isNaN(Date.parse(loggedAt)) ? new Date(loggedAt) : undefined;
    const shared = {
      weight: weight == null ? null : String(weight).slice(0, 20),
      reps: Number.isInteger(reps) ? reps : null,
      rir: Number.isInteger(rir) ? rir : null,
      setType: ["warmup","working","failure"].includes(setType||"") ? setType : "working",
      variation: typeof variation === "string" && variation ? variation.slice(0, 30) : null,
      side: ["left", "right", "both"].includes(side || "") ? side : (variation === "hand:left" ? "left" : variation === "hand:right" ? "right" : variation === "hand:both" ? "both" : null),
      restAfterSec: typeof restAfterSec === "number" && Number.isInteger(restAfterSec) && restAfterSec >= 0 && restAfterSec <= 3600 ? restAfterSec : null,
      pain: typeof pain === "number" && Number.isInteger(pain) && pain >= 0 && pain <= 10 ? pain : null,
      techniqueFlag: typeof techniqueFlag === "string" ? techniqueFlag.slice(0, 40) : null,
      isPartial: Boolean(isPartial),
      done: Boolean(done),
    };
    await db.insert(schema.workoutSets).values({
      sessionId: sessionId!, slug: String(slug), setIndex: setIndex!,
      ...shared,
      ...(loggedDate ? { loggedAt: loggedDate } : {}),
    }).onConflictDoUpdate({
      target: [schema.workoutSets.sessionId, schema.workoutSets.slug, schema.workoutSets.setIndex],
      set: { ...shared, ...(loggedDate ? { loggedAt: loggedDate } : {}) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) { logError(e, { route: "workout/sets POST" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const slug = searchParams.get("slug");
    const setIndex = Number(searchParams.get("setIndex"));
    if (!sessionId || !slug || !Number.isInteger(setIndex)) {
      return NextResponse.json({ error: "sessionId, slug, setIndex required." }, { status: 400 });
    }
    const [owned] = await db.select({ id: schema.workoutSessions.id })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.id, sessionId), eq(schema.workoutSessions.userId, session.userId)))
      .limit(1);
    if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await db.delete(schema.workoutSets).where(and(
      eq(schema.workoutSets.sessionId, sessionId),
      eq(schema.workoutSets.slug, slug),
      eq(schema.workoutSets.setIndex, setIndex),
    ));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError(e, { route: "workout/sets DELETE" });
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
