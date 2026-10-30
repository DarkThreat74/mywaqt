import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// e1RM via Epley: w * (1 + r/30); bodyweight/no-weight rows excluded.
const e1rm = (w: number, r: number) => r > 1 ? w * (1 + r / 30) : w;

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .select({
        slug: schema.workoutSets.slug,
        weight: schema.workoutSets.weight,
        reps: schema.workoutSets.reps,
        rir: schema.workoutSets.rir,
        done: schema.workoutSets.done,
        at: schema.workoutSessions.startedAt,
        sessionId: schema.workoutSessions.id,
        dayId: schema.workoutSessions.dayId,
      })
      .from(schema.workoutSets)
      .innerJoin(schema.workoutSessions, eq(schema.workoutSets.sessionId, schema.workoutSessions.id))
      .where(and(eq(schema.workoutSessions.userId, session.userId), isNotNull(schema.workoutSessions.endedAt)))
      .orderBy(desc(schema.workoutSessions.startedAt));
    // Group per slug → history points (best e1RM per session) + last-session detail
    const bySlug = new Map<string, { points: { at: string; e1: number }[]; last: { w: number; r: number; rir: number | null; at: string } | null; sessions: number }>();
    for (const row of rows) {
      if (!row.done) continue;
      const w = parseFloat(row.weight || "");
      const r = row.reps || 0;
      if (!w || !r) continue;
      const e = bySlug.get(row.slug) || { points: [], last: null, sessions: 0 };
      const val = e1rm(w, r);
      if (!e.points.find((p) => p.at === row.at.toISOString())) {
        e.points.push({ at: row.at.toISOString(), e1: val });
      } else {
        const p = e.points.find((p) => p.at === row.at.toISOString())!;
        if (val > p.e1) p.e1 = val;
      }
      if (!e.last) e.last = { w, r, rir: row.rir, at: row.at.toISOString() };
      e.sessions++;
      bySlug.set(row.slug, e);
    }
    // sessions-between: count distinct sessions overall for context
    const sessCount = new Set(rows.map((r) => r.sessionId)).size;
    const out = [...bySlug.entries()].map(([slug, v]) => ({
      slug,
      points: v.points.reverse(), // oldest → newest
      last: v.last,
      sets: v.sessions,
    }));
    return NextResponse.json({ progress: out, totalSessions: sessCount });
  } catch (e) { logError(e, { route: "workout/progress GET" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
