import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { rankDelta, rankFor, nextRank, TIMED_LIMIT_MS, MERCY_FLOOR, MERCY_TRIGGER } from "@/lib/quran-rank";
import { recordRatingEvent } from "@/lib/quran-match";

export const dynamic = "force-dynamic";

/**
 * Mutashabih feeds the SAME ladder as AyaTrace (quran_ratings) — one
 * collective rank across both games. Mode weights: "How many times?" pays
 * full delta like an AyaTrace answer; the multi-pick modes pay 3/4.
 */
const MODE_WEIGHT: Record<string, number> = { count: 1, homes: 0.75, ending: 0.75 };

function payload(r: { rating: number; played: number; correct: number; streak: number; bestStreak: number; lossStreak?: number } | undefined, delta?: number) {
  const rating = r?.rating ?? 0;
  const rank = rankFor(rating);
  const next = nextRank(rating);
  return {
    rating,
    delta: delta ?? 0,
    played: r?.played ?? 0,
    correct: r?.correct ?? 0,
    streak: r?.streak ?? 0,
    bestStreak: r?.bestStreak ?? 0,
    lossStreak: r?.lossStreak ?? 0,
    rank: { id: rank.id, en: rank.en, ar: rank.ar, min: rank.min, timed: rank.timed },
    nextRank: next ? { id: next.id, en: next.en, ar: next.ar, min: next.min } : null,
    timedLimitMs: rank.timed ? TIMED_LIMIT_MS : null,
  };
}

// GET /api/mutashabihat/rating — the shared ranked standing.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("muta-rating", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const [row] = await db
    .select()
    .from(schema.quranRatings)
    .where(eq(schema.quranRatings.userId, session.userId))
    .limit(1);
  return NextResponse.json(payload(row));
}

// POST /api/mutashabihat/rating — record one answer on the shared ladder.
// Same honor-system contract as AyaTrace: the client reports correct/ms/mode,
// the delta math is server-side so ratings can't be forged upward.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("muta-rating", getClientIp(request.headers), 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { correct?: boolean; ms?: number; mode?: string; verseIdx?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.correct !== "boolean" || typeof body.ms !== "number" || !Number.isFinite(body.ms)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const ms = Math.max(0, Math.min(Math.round(body.ms), TIMED_LIMIT_MS));
  const verseIdx = typeof body.verseIdx === "number" && Number.isInteger(body.verseIdx) && body.verseIdx >= 0 && body.verseIdx < 1000000
    ? body.verseIdx
    : null;
  // Unknown/absent mode → the lighter weight; the client always sends one,
  // this just refuses full weight to hand-rolled requests.
  const weight = MODE_WEIGHT[body.mode ?? ""] ?? 0.75;

  const [row] = await db
    .select()
    .from(schema.quranRatings)
    .where(eq(schema.quranRatings.userId, session.userId))
    .limit(1);

  const prevRank = rankFor(row?.rating ?? 0);
  const lossStreak = body.correct ? 0 : (row?.lossStreak ?? 0) + 1;
  // Weighted: correct scales toward 0, wrong scales toward 0 too — the
  // lighter modes risk less AND pay less.
  let delta = body.correct
    ? Math.round(rankDelta(true, ms) * weight)
    : Math.ceil(rankDelta(false, ms) * weight); // negative → ceil = smaller loss
  if (!body.correct && lossStreak >= MERCY_TRIGGER) delta = Math.max(delta, MERCY_FLOOR);
  // Atomic upsert — a plain select+update loses deltas when two answers
  // land concurrently (double-tap, PWA + browser tab both open).
  const [next] = await db
    .insert(schema.quranRatings)
    .values({
      userId: session.userId,
      rating: Math.max(0, delta),
      played: 1,
      correct: body.correct ? 1 : 0,
      streak: body.correct ? 1 : 0,
      bestStreak: body.correct ? 1 : 0,
      lossStreak,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.quranRatings.userId,
      set: {
        rating: sql`greatest(0, ${schema.quranRatings.rating} + ${delta})`,
        played: sql`${schema.quranRatings.played} + 1`,
        correct: sql`${schema.quranRatings.correct} + ${body.correct ? 1 : 0}`,
        streak: sql`case when ${body.correct} then ${schema.quranRatings.streak} + 1 else 0 end`,
        bestStreak: sql`greatest(${schema.quranRatings.bestStreak}, case when ${body.correct} then ${schema.quranRatings.streak} + 1 else 0 end)`,
        lossStreak: sql`case when ${body.correct} then 0 else ${schema.quranRatings.lossStreak} + 1 end`,
        updatedAt: new Date(),
      },
    })
    .returning();
  const rating = next.rating;

  await recordRatingEvent({
    userId: session.userId,
    game: "mutashabih",
    source: "solo",
    delta,
    ratingAfter: rating,
    verseIdx: verseIdx ?? undefined,
    mode: body.mode ?? undefined,
    correct: body.correct,
    ms,
  });

  const newRank = rankFor(rating);
  return NextResponse.json({
    ...payload(next, delta),
    rankedUp: newRank.id !== prevRank.id ? { id: newRank.id, en: newRank.en, ar: newRank.ar } : null,
    rankedDown: delta < 0 && newRank.id !== prevRank.id ? { id: newRank.id, en: newRank.en, ar: newRank.ar } : null,
  });
}
