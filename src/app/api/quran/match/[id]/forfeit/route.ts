import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { MATCH_WIN_PTS } from "@/lib/quran-rank";
import { recordRatingEvent } from "@/lib/quran-match";

export const dynamic = "force-dynamic";

const QUIT_PENALTY = -5;

/**
 * POST /api/quran/match/[id]/forfeit — surrender an active match.
 *
 * Rules:
 * - Fewer than 2 rounds resolved → the match is ABORTED. The quitter loses
 *   5 points, the opponent gains nothing.
 * - 2+ rounds resolved → FORFEIT. The quitter loses 5 points; the opponent
 *   wins and gains a proportional share of the match prize — their round
 *   wins out of the rounds resolved decides the share.
 * Rating changes apply to Elite matches only, same as normal settle.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("quran-match-forfeit", getClientIp(request.headers), 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  const [m] = await db.select().from(schema.quranMatches).where(eq(schema.quranMatches.id, id)).limit(1);
  if (!m || (m.creatorId !== session.userId && m.opponentId !== session.userId)) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  if (m.status !== "active") {
    return NextResponse.json({ error: "Match isn't active." }, { status: 409 });
  }

  const meIsCreator = m.creatorId === session.userId;
  const otherId = meIsCreator ? m.opponentId : m.creatorId;

  const rounds = await db
    .select()
    .from(schema.quranMatchRounds)
    .where(eq(schema.quranMatchRounds.matchId, id));
  const resolved = rounds.filter((r) => r.resolvedAt);
  const otherWins = resolved.filter((r) => r.winnerId === otherId).length;

  const aborted = resolved.length < 2;
  const endReason = aborted ? "aborted" : "forfeited";

  // Winner's proportional prize: share of the full match stake scaled by the
  // fraction of the schedule actually played AND weighted by their wins.
  const playedFraction = resolved.length / m.rounds;
  const winFraction = resolved.length > 0 ? otherWins / resolved.length : 0;
  const winnerGain = aborted ? 0 : Math.max(1, Math.round(MATCH_WIN_PTS * playedFraction * winFraction));

  const deltas = m.difficulty === "elite"
    ? { loser: QUIT_PENALTY, winner: winnerGain }
    : { loser: 0, winner: 0 }; // unranked matches carry no stakes

  const [meRows, otherRows] = await Promise.all([
    db.select({ firstName: schema.users.firstName, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, session.userId)).limit(1),
    db.select({ firstName: schema.users.firstName, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, otherId)).limit(1),
  ]);
  const me = meRows[0];
  const other = otherRows[0];

  // Pre-change ratings for the history log's rating_after.
  const ratingRows = await db
    .select({ userId: schema.quranRatings.userId, rating: schema.quranRatings.rating })
    .from(schema.quranRatings)
    .where(inArray(schema.quranRatings.userId, [session.userId, otherId]));
  const ratingOf = (uid: string) => ratingRows.find((r) => r.userId === uid)?.rating ?? 0;

  const [settled] = await db
    .update(schema.quranMatches)
    .set({
      status: "done",
      winnerId: otherId,
      endReason,
      forfeitedBy: session.userId,
      endedAt: new Date(),
      rated: true,
    })
    .where(and(eq(schema.quranMatches.id, id), eq(schema.quranMatches.status, "active")))
    .returning({ id: schema.quranMatches.id });
  // The match settled elsewhere between our SELECT and this UPDATE
  // (normal completion or a racing surrender) — writing ratings/events
  // now would double-apply deltas.
  if (!settled) {
    return NextResponse.json({ error: "Match already ended." }, { status: 409 });
  }

  if (deltas.loser !== 0) {
    await db
      .insert(schema.quranRatings)
      .values({ userId: session.userId, rating: Math.max(0, deltas.loser), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.quranRatings.userId,
        set: { rating: sql`greatest(0, ${schema.quranRatings.rating} + ${deltas.loser})`, updatedAt: new Date() },
      });
  }
  if (deltas.winner !== 0) {
    await db
      .insert(schema.quranRatings)
      .values({ userId: otherId, rating: deltas.winner, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.quranRatings.userId,
        set: { rating: sql`${schema.quranRatings.rating} + ${deltas.winner}`, updatedAt: new Date() },
      });
  }
  if (deltas.loser !== 0 || deltas.winner !== 0) {
    const source = aborted ? "abort" : "forfeit";
    await Promise.all([
      deltas.loser !== 0 &&
        recordRatingEvent({ userId: session.userId, matchId: id, game: m.game, source, delta: deltas.loser, ratingAfter: Math.max(0, ratingOf(session.userId) + deltas.loser) }),
      deltas.winner !== 0 &&
        recordRatingEvent({ userId: otherId, matchId: id, game: m.game, source, delta: deltas.winner, ratingAfter: Math.max(0, ratingOf(otherId) + deltas.winner) }),
    ]);
  }

  // Tell the opponent — their screen and toast both settle.
  const myName = me?.firstName || me?.displayName || "Your opponent";
  const otherName = other?.firstName || other?.displayName || "your opponent";
  await db.insert(schema.appNotifications).values({
    userId: otherId,
    type: "match_ended",
    title: aborted ? "Match aborted" : "Match won by forfeit",
    body: aborted
      ? `${myName} left before round 2 finished — no rating change for you.`
      : `${myName} surrendered — you take the win${deltas.winner ? ` (+${deltas.winner} pts)` : ""}.`,
  });

  return NextResponse.json({ ok: true, endReason, deltas, opponentName: otherName });
}
