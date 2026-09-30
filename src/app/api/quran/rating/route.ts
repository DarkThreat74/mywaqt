import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { rankDelta, rankFor, nextRank, TIMED_LIMIT_MS, MERCY_FLOOR, MERCY_TRIGGER } from "@/lib/quran-rank";
import { recordRatingEvent } from "@/lib/quran-match";

export const dynamic = "force-dynamic";

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

// GET /api/quran/rating — my Elite ranked standing.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("quran-rating", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const [row] = await db
    .select()
    .from(schema.quranRatings)
    .where(eq(schema.quranRatings.userId, session.userId))
    .limit(1);
  return NextResponse.json(payload(row));
}

// POST /api/quran/rating — record one Elite answer. ms is clamped; answers
// are self-reported (honor system, same contract as 1v1) but the delta math
// is server-side so ratings can't be forged upward.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("quran-rating", getClientIp(request.headers), 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { correct?: boolean; ms?: number; verseIdx?: number };
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

  const [row] = await db
    .select()
    .from(schema.quranRatings)
    .where(eq(schema.quranRatings.userId, session.userId))
    .limit(1);

  const prevRank = rankFor(row?.rating ?? 0);
  const lossStreak = body.correct ? 0 : (row?.lossStreak ?? 0) + 1;
  let delta = rankDelta(body.correct, ms);
  // Mercy rule — 4+ consecutive wrong answers cap the loss at −2 until one
  // lands right. Keeps a rough patch from erasing a climb.
  if (!body.correct && lossStreak >= MERCY_TRIGGER) delta = Math.max(delta, MERCY_FLOOR);
  // Atomic upsert — a plain select+update loses deltas when two answers
  // land concurrently (double-tap, PWA + browser tab both open). All
  // counters fold in SQL; RETURNING gives the true post-write values so
  // the event log's ratingAfter matches the row.
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
    game: "trace",
    source: "solo",
    delta,
    ratingAfter: rating,
    verseIdx: verseIdx ?? undefined,
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
