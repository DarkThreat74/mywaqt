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
        setType: schema.workoutSets.setType,
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
    const bySlug = new Map<string, { points: { at: string; e1: number }[]; last: { w: number; r: number; rir: number | null; at: string } | null; sessions: number; tonnage: number; best: number }>();
    let totalTonnage = 0;
    for (const row of rows) {
      if (!row.done) continue;
      const w = parseFloat(row.weight || "");
      const r = row.reps || 0;
      if (!w || !r) continue;
      const e = bySlug.get(row.slug) || { points: [], last: null, sessions: 0, tonnage: 0, best: 0 };
      const val = e1rm(w, r);
      if (!e.points.find((p) => p.at === row.at.toISOString())) {
        e.points.push({ at: row.at.toISOString(), e1: val });
      } else {
        const p = e.points.find((p) => p.at === row.at.toISOString())!;
        if (val > p.e1) p.e1 = val;
      }
      if (!e.last) e.last = { w, r, rir: row.rir, at: row.at.toISOString() };
      e.sessions++;
      e.tonnage += w * r;
      if (val > e.best) e.best = val;
      totalTonnage += w * r;
      bySlug.set(row.slug, e);
    }
    // sessions-between: count distinct sessions overall for context
    const sessCount = new Set(rows.map((r) => r.sessionId)).size;
    const out = [...bySlug.entries()].map(([slug, v]) => ({
      slug,
      points: v.points.reverse(), // oldest → newest
      last: v.last,
      sets: v.sessions,
      bestE1: Math.round(v.best * 10) / 10,
      firstE1: v.points.length ? Math.round(v.points[0].e1 * 10) / 10 : null,
      lastE1: v.points.length ? Math.round(v.points[v.points.length - 1].e1 * 10) / 10 : null,
      gainPct: v.points.length >= 2 && v.points[0].e1 > 0
        ? Math.round(((v.points[v.points.length - 1].e1 - v.points[0].e1) / v.points[0].e1) * 1000) / 10
        : null,
    }));

    // ── Muscle-growth model ──
    // Effective set = done, not a warmup, loaded — weighted by proximity to
    // failure (RIR). Weekly effective sets per muscle vs RP volume landmarks
    // + e1RM slope over the window = the growth signal.
    const { EXERCISES } = await import("@/lib/workout/exercises");
    const muscleOf = new Map(EXERCISES.map((e) => [e.slug, e.muscle]));
    const LANDMARKS: Record<string, [number, number]> = {
      chest: [8, 16], upper_chest: [6, 12], lower_chest: [4, 10], lats: [10, 18], mid_back: [8, 14],
      rear_delts: [6, 12], erectors: [4, 8], front_delts: [3, 8], side_delts: [8, 16],
      upper_traps: [4, 8], lower_traps: [3, 8], biceps: [8, 14], triceps: [6, 14],
      forearms: [4, 10], grip: [2, 6], fingers: [2, 6], neck: [4, 8], quads: [8, 14],
      hamstrings: [6, 12], glutes: [6, 12], glute_med: [4, 10], gastroc: [6, 12], soleus: [6, 12],
      upper_abs: [4, 10], lower_abs: [4, 10], abs: [4, 10], obliques: [4, 10],
    };
    const rirWeight = (rir: number | null, t: string) => {
      if (t === "failure") return 1;
      if (t === "warmup") return 0;
      if (rir === null) return 0.75;
      return rir <= 1 ? 1 : rir === 2 ? 0.8 : rir === 3 ? 0.5 : 0.25;
    };
    const weekMs = 7 * 86400000;
    const nowMs = Date.now();
    const effWeek = new Map<string, number>();
    for (const row of rows) {
      if (!row.done || row.weight === undefined) continue;
      const w = parseFloat(row.weight || "");
      if (!w || !row.reps) continue;
      const muscle = muscleOf.get(row.slug);
      if (!muscle) continue;
      const age = nowMs - row.at.getTime();
      const weight = rirWeight(row.rir, row.setType || "working");
      if (age <= weekMs) effWeek.set(muscle, (effWeek.get(muscle) || 0) + weight);
    }
    // e1RM slope per muscle (best point per week, linear over ≤8wks)
    const musclePoints = new Map<string, { t: number; e: number }[]>();
    for (const { slug, points } of out) {
      const muscle = muscleOf.get(slug);
      if (!muscle) continue;
      const arr = musclePoints.get(muscle) || [];
      arr.push(...points.map((p) => ({ t: new Date(p.at).getTime(), e: p.e1 })));
      musclePoints.set(muscle, arr);
    }
    const lastTrained = new Map<string, number>();
    for (const row of rows) {
      const muscle = muscleOf.get(row.slug);
      if (!muscle) continue;
      const t = row.at.getTime();
      if (!lastTrained.get(muscle) || t > lastTrained.get(muscle)!) lastTrained.set(muscle, t);
    }
    const muscles = [...new Set([...effWeek.keys(), ...musclePoints.keys()])].map((muscle) => {
      const pts = (musclePoints.get(muscle) || []).sort((a, b) => a.t - b.t);
      let slope = 0;
      if (pts.length >= 2) {
        const span = Math.max((pts[pts.length - 1].t - pts[0].t) / weekMs, 1);
        const half = Math.max(Math.floor(pts.length / 2), 1);
        const first = pts.slice(0, half).reduce((s, p) => s + p.e, 0) / half;
        const lastAvg = pts.slice(-half).reduce((s, p) => s + p.e, 0) / half;
        slope = first > 0 ? ((lastAvg - first) / first) * 100 / span : 0;
      }
      const eff = effWeek.get(muscle) || 0;
      const [lo, hi] = LANDMARKS[muscle] || [4, 10];
      const status =
        eff < lo * 0.5 ? "under" :
        eff < lo ? "low" :
        eff > hi ? "over" :
        slope > 0.3 ? "growing" :
        slope > -0.3 ? "maintaining" : "stalling";
      // Fitbod-style freshness: ~48-72h to recover → % recovered
      const hoursSince = lastTrained.get(muscle) ? (nowMs - lastTrained.get(muscle)!) / 3600000 : Infinity;
      const freshness = Math.min(Math.round((hoursSince / 72) * 100), 100);
      return { muscle, effSetsWeek: Math.round(eff * 10) / 10, landmark: [lo, hi], slopePct: Math.round(slope * 10) / 10, status, freshness };
    });
    return NextResponse.json({ progress: out, totalSessions: sessCount, muscles, totalTonnage: Math.round(totalTonnage) });
  } catch (e) { logError(e, { route: "workout/progress GET" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
