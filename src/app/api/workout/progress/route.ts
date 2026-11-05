import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logError } from "@/lib/logError";
import { estimateE1rm, recommendLoadKg } from "@/lib/workout/recommend";
import { buildAlgorithmSignals, forecastGrowth } from "@/lib/workout/forecast";
import { isUnilateralExercise } from "@/lib/workout/exercises";

export const dynamic = "force-dynamic";

// e1RM via Epley: w * (1 + r/30); bodyweight/no-weight rows excluded.
const e1rm = estimateE1rm;

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
        variation: schema.workoutSets.variation,
        side: schema.workoutSets.side,
        restAfterSec: schema.workoutSets.restAfterSec,
        pain: schema.workoutSets.pain,
        done: schema.workoutSets.done,
        at: schema.workoutSessions.startedAt,
        loggedAt: schema.workoutSets.loggedAt,
        sessionId: schema.workoutSessions.id,
        dayId: schema.workoutSessions.dayId,
        exerciseOrder: schema.workoutSessions.exerciseOrder,
      })
      .from(schema.workoutSets)
      .innerJoin(schema.workoutSessions, eq(schema.workoutSets.sessionId, schema.workoutSessions.id))
      .where(and(eq(schema.workoutSessions.userId, session.userId), isNotNull(schema.workoutSessions.endedAt)))
      .orderBy(desc(schema.workoutSessions.startedAt));
    const nowMs = Date.now();
    // Group per slug → history points (best e1RM per session) + last-session detail
    const bySlug = new Map<string, { points: { at: string; e1: number; pos?: number }[]; last: { w: number; r: number; rir: number | null; at: string; pos?: number } | null; sessions: number; tonnage: number; best: number; positions: number[] }>();
    const limbBySlug = new Map<string, Map<"left" | "right" | "both", { best: number; first: number; last: number; points: number[] }>>();
    // Exercise position per session — same-day order from workout_day_exercises
    // sortOrder. A set logged as exercise #3 can't fairly compare to exercise #1.
    const dayIds = [...new Set(rows.map((r) => r.dayId).filter(Boolean))] as string[];
    const posMap = new Map<string, number>(); // "dayId:slug" -> sortOrder
    if (dayIds.length) {
      const dex = await db.select().from(schema.workoutDayExercises)
        .where(inArray(schema.workoutDayExercises.dayId, dayIds));
      for (const dx of dex) posMap.set(`${dx.dayId}:${dx.slug}`, dx.sortOrder);
    }
    const sessionDay = new Map(rows.map((r) => [r.sessionId, r.dayId]));
    const sessionOrder = new Map(rows.map((r) => [r.sessionId, r.exerciseOrder as Record<string, number> | null]));
    let totalTonnage = 0;
    for (const row of rows) {
      if (!row.done) continue;
      const w = parseFloat(row.weight || "");
      const r = row.reps || 0;
      if (!w || !r) continue;
      const e = bySlug.get(row.slug) || { points: [], last: null, sessions: 0, tonnage: 0, best: 0, positions: [] };
      const validE1 = r <= 12;
      const val = validE1 ? e1rm(w, r) : w;
      const hand = row.side === "left" || row.variation === "hand:left" ? "left"
        : row.side === "right" || row.variation === "hand:right" ? "right"
          : row.side === "both" || row.variation === "hand:both" ? "both" : null;
      // Legacy sets logged before side tracking on unilateral exercises were
      // done one arm at a time — credit each limb so per-arm history exists.
      const hands: Array<"left" | "right" | "both"> = hand
        ? [hand]
        : isUnilateralExercise(row.slug) ? ["left", "right"] : [];
      if (hands.length && validE1) {
        const limbs = limbBySlug.get(row.slug) || new Map();
        for (const h of hands) {
          const limb = limbs.get(h) || { best: 0, first: val, last: val, points: [] };
          limb.best = Math.max(limb.best, val);
          limb.last = val;
          limb.points.push(val);
          limbs.set(h, limb);
        }
        limbBySlug.set(row.slug, limbs);
      }
      const snapshotPos = sessionOrder.get(row.sessionId)?.[row.slug];
      const pos = snapshotPos ?? posMap.get(`${sessionDay.get(row.sessionId)}:${row.slug}`);
      if (pos !== undefined && !e.positions.includes(pos)) e.positions.push(pos);
      if (validE1 && !e.points.find((p) => p.at === row.loggedAt.toISOString())) {
        e.points.push({ at: row.loggedAt.toISOString(), e1: val, pos });
      } else if (validE1) {
        const p = e.points.find((p) => p.at === row.loggedAt.toISOString())!;
        if (val > p.e1) p.e1 = val;
      }
      // "last" = latest session's best set — prefer working/failure over
      // warmups so the "try X" hint suggests a real working weight.
      if (!e.last || row.setType !== "warmup") {
        if (!e.last) e.last = { w, r, rir: row.rir, at: row.loggedAt.toISOString(), pos };
        else if (row.setType !== "warmup" && (r > 12 || val > e1rm(e.last.w, e.last.r))) e.last = { w, r, rir: row.rir, at: row.loggedAt.toISOString(), pos };
      }
      e.sessions++;
      e.tonnage += w * r;
      if (validE1 && val > e.best) e.best = val;
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
      // Exercise-order context — last logged position in the workout and the
      // typical position, so "35lb preacher then 20lb bayesian" reads as
      // fatigue-from-order, not regression.
      lastPos: v.last?.pos ?? null,
      posMode: v.positions.length
        ? v.positions.sort((a, b) => a - b)[0] // earliest slot it usually runs
        : null,
      // Conservative next-load recommendation. RIR 3+ means hold; RIR 2
      // earns a small jump; RIR 0-1 earns a larger jump only when the set
      // was not already a late-session fatigue-affected effort.
      recommendedKg: v.last ? Math.round(recommendLoadKg(v.last.w, v.last.rir, v.last.pos ?? 0).kg * 10) / 10 : null,
      recommendationReason: v.last ? recommendLoadKg(v.last.w, v.last.rir, v.last.pos ?? 0).reason : null,
      limbs: Object.fromEntries([...((limbBySlug.get(slug) || new Map()).entries())].map(([hand, l]) => [hand, {
        bestE1: Math.round(l.best * 10) / 10,
        // Rows arrive newest-first; reverse the observed points for growth.
        firstE1: Math.round((l.points[l.points.length - 1] || l.first) * 10) / 10,
        lastE1: Math.round((l.points[0] || l.last) * 10) / 10,
        gainPct: (l.points[l.points.length - 1] || l.first) > 0
          ? Math.round((((l.points[0] || l.last) - (l.points[l.points.length - 1] || l.first)) / (l.points[l.points.length - 1] || l.first)) * 1000) / 10
          : null,
      }])),
      // Detraining model — strength holds ~4wk, then fades ~5%/wk of past-peak,
      // floored at 70% (muscle memory: myonuclei persist, regaining is fast).
      daysSince: v.last ? Math.round((nowMs - new Date(v.last.at).getTime()) / 86400000) : null,
      retained: v.last
        ? Math.max(0.7, 1 - 0.05 * Math.max(0, (nowMs - new Date(v.last.at).getTime()) / 604800000 - 4))
        : 1,
      gainPct: v.points.length >= 2 && v.points[0].e1 > 0
        ? Math.round(((v.points[v.points.length - 1].e1 - v.points[0].e1) / v.points[0].e1) * 1000) / 10
        : null,
      growthForecast: forecastGrowth(v.points),
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
    // Weekly volume trend — last 7d vs prior 7d (Hevy-style stat).
    let tonWeek = 0, tonPrevWeek = 0;
    let failureSets = 0, weightedSets = 0, restTotal = 0, restCount = 0, painSets = 0;
    for (const row of rows) {
      if (!row.done) continue;
      const w = parseFloat(row.weight || "");
      if (!w || !row.reps) continue;
      const age = nowMs - row.at.getTime();
      const vol = w * row.reps;
      weightedSets++;
      if (row.setType === "failure") failureSets++;
      if (row.restAfterSec != null) { restTotal += row.restAfterSec; restCount++; }
      if (row.pain != null && row.pain >= 5) painSets++;
      if (age <= weekMs) tonWeek += vol;
      else if (age <= 2 * weekMs) tonPrevWeek += vol;
    }
    return NextResponse.json({
      progress: out, totalSessions: sessCount, muscles, totalTonnage: Math.round(totalTonnage),
      tonWeek: Math.round(tonWeek), tonPrevWeek: Math.round(tonPrevWeek),
      // ACWR-style flag — >30% weekly load jump is the documented injury-risk line
      volumeSpike: tonPrevWeek > 0 && tonWeek > tonPrevWeek * 1.3,
      algorithmSignals: buildAlgorithmSignals({
        sessions: sessCount,
        sets: weightedSets,
        tonnage: totalTonnage,
        weeklyTonnage: tonWeek,
        previousWeeklyTonnage: tonPrevWeek,
        averageRir: null,
        failureRate: weightedSets ? failureSets / weightedSets : null,
        averageRestSec: restCount ? restTotal / restCount : null,
        latestBodyweightKg: null,
        bodyweightChangeKg: null,
        sleepHours: null,
        soreness: null,
        energy: null,
        painRate: weightedSets ? painSets / weightedSets : null,
      }),
    });
  } catch (e) { logError(e, { route: "workout/progress GET" }); return NextResponse.json({ error: "Server error." }, { status: 500 }); }
}
