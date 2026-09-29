import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { pickMatchVerses } from "@/lib/content/quran-server";
import { pickMatchFamilies } from "@/lib/content/mutashabihat-server";
import { areFriends, notifyUser, INVITE_TTL_MS, expireStaleMatches } from "@/lib/quran-match";
import { rankIndex, rankFor } from "@/lib/quran-rank";
import { isValidUUID } from "@/lib/validation";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

const VALID_DIFFS = new Set(["easy", "medium", "advanced", "elite"]);
const FRAG_DIFFS = new Set(["medium", "elite"]);

// POST /api/quran/match — challenge a friend. Generates the seeded round list
// at creation so the state endpoint can reveal each verse only when due.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-create", ip, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { opponentId?: string; difficulty?: string; rounds?: number; game?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { opponentId } = body;
  // Mutashabih matches are always ranked-Elite (one shared ladder); AyaTrace
  // keeps casual difficulties.
  const game = body.game === "mutashabih" ? "mutashabih" : "trace";
  const difficulty = game === "mutashabih" ? "elite" : body.difficulty;
  const rounds = body.rounds ?? 5;
  if (!opponentId || !isValidUUID(opponentId) || !difficulty || !VALID_DIFFS.has(difficulty)) {
    return NextResponse.json({ error: "Invalid match settings." }, { status: 400 });
  }
  if (![3, 5, 7, 10].includes(rounds)) {
    return NextResponse.json({ error: "Rounds must be 3, 5, 7 or 10." }, { status: 400 });
  }
  if (opponentId === session.userId) {
    return NextResponse.json({ error: "You can't challenge yourself." }, { status: 400 });
  }
  if (!(await areFriends(session.userId, opponentId))) {
    return NextResponse.json({ error: "You can only challenge friends." }, { status: 403 });
  }

  // Ranked matches (Elite) stay within one tier — your rank or the ones
  // directly above/below. Casual difficulties are open to any friend.
  if (difficulty === "elite") {
    const rows = await db
      .select({ userId: schema.quranRatings.userId, rating: schema.quranRatings.rating })
      .from(schema.quranRatings)
      .where(inArray(schema.quranRatings.userId, [session.userId, opponentId]));
    const myRank = rankIndex(rows.find((r) => r.userId === session.userId)?.rating ?? 0);
    const oppRank = rankIndex(rows.find((r) => r.userId === opponentId)?.rating ?? 0);
    if (Math.abs(myRank - oppRank) > 1) {
      const oppTier = rankFor(rows.find((r) => r.userId === opponentId)?.rating ?? 0).en;
      return NextResponse.json(
        { error: `Ranked matches stay within one tier — ${oppTier} is too far from yours. Try a casual difficulty.` },
        { status: 403 },
      );
    }
  }

  // Close abandoned actives first so they can't block a rematch.
  await expireStaleMatches();

  // One live match per pair — a stale pending one is reused instead of piling up.
  const [live] = await db
    .select({ id: schema.quranMatches.id })
    .from(schema.quranMatches)
    .where(
      and(
        eq(schema.quranMatches.game, game),
        or(
          and(eq(schema.quranMatches.creatorId, session.userId), eq(schema.quranMatches.opponentId, opponentId)),
          and(eq(schema.quranMatches.creatorId, opponentId), eq(schema.quranMatches.opponentId, session.userId)),
        ),
        // Pending counts only while the 5min invite window is open; an
        // unanswered challenge past that is expired and mustn't block a new one.
        or(
          and(
            eq(schema.quranMatches.status, "pending"),
            gt(schema.quranMatches.createdAt, new Date(Date.now() - INVITE_TTL_MS)),
          ),
          and(
            eq(schema.quranMatches.status, "active"),
            gt(schema.quranMatches.createdAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
          ),
        ),
      ),
    )
    .limit(1);
  if (live) {
    return NextResponse.json({ matchId: live.id, reused: true });
  }

  const seed = crypto.randomInt(1, 2 ** 31);
  // verseIdx column doubles as the family index for mutashabih matches.
  const roundIdxs = game === "mutashabih"
    ? pickMatchFamilies(seed, rounds)
    : pickMatchVerses(seed, rounds, FRAG_DIFFS.has(difficulty) ? "unique" : "full");
  if (roundIdxs.length < rounds) {
    return NextResponse.json({ error: "Couldn't build a match — try again." }, { status: 500 });
  }

  const [match] = await db
    .insert(schema.quranMatches)
    .values({ creatorId: session.userId, opponentId, game, difficulty, rounds, seed })
    .returning({ id: schema.quranMatches.id });
  await db.insert(schema.quranMatchRounds).values(
    roundIdxs.map((verseIdx, i) => ({ matchId: match.id, round: i + 1, verseIdx })),
  );

  const [me] = await db
    .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  const name = me?.firstName || me?.displayName || "A friend";
  const gameName = game === "mutashabih" ? "Mutashabih" : "AyaTrace";
  await notifyUser(
    opponentId,
    gameName,
    `${name} challenged you — ${difficulty} · best of ${rounds}. Open Waqt to play.`,
    `${game === "mutashabih" ? "/mutashabihat" : "/quran"}?match=${match.id}`,
  );

  return NextResponse.json({ matchId: match.id });
}
