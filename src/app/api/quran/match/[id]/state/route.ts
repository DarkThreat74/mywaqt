import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { getCorpus } from "@/lib/content/quran-server";
import { SURAHS, plausibleOptions, mulberry32 } from "@/lib/content/quran";
import { INVITE_TTL_MS } from "@/lib/quran-match";
import { matchMode } from "@/lib/mutashabih";
import { matchTarget } from "@/lib/content/mutashabihat-server";
import { MATCH_WIN_PTS, MATCH_LOSS_PTS, MATCH_DRAW_PTS } from "@/lib/quran-rank";

export const dynamic = "force-dynamic";

const ROUND_TIMEOUT_MS = 90 * 1000;

/** Resolve a round once both answered (or one timed out). Correct+faster wins;
 *  both wrong / nobody correct → draw (winnerId stays null). */
function resolveWinner(r: {
  creatorCorrect: boolean | null; creatorMs: number | null;
  opponentCorrect: boolean | null; opponentMs: number | null;
  creatorId: string; opponentId: string;
}): string | null {
  const cOk = r.creatorCorrect === true;
  const oOk = r.opponentCorrect === true;
  if (cOk && !oOk) return r.creatorId;
  if (oOk && !cOk) return r.opponentId;
  if (cOk && oOk) return (r.creatorMs ?? 1e9) <= (r.opponentMs ?? 1e9) ? r.creatorId : r.opponentId;
  return null;
}

/**
 * GET /api/quran/match/[id]/state — the whole match heartbeat (~1.2s polls).
 * Lazily resolves timeouts and match completion so no sweeper job is needed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-state", ip, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  const [m] = await db
    .select()
    .from(schema.quranMatches)
    .where(eq(schema.quranMatches.id, id))
    .limit(1);
  if (!m || (m.creatorId !== session.userId && m.opponentId !== session.userId)) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const meIsCreator = m.creatorId === session.userId;
  const rounds = await db
    .select()
    .from(schema.quranMatchRounds)
    .where(eq(schema.quranMatchRounds.matchId, id))
    .orderBy(asc(schema.quranMatchRounds.round));

  const now = Date.now();
  const updates: Promise<unknown>[] = [];

  // Lazy resolution — no sweeper job needed. Started rounds resolve 90s
  // after start regardless of who answered (ghost = draw). Unstarted
  // rounds resolve 120s after the previous round/match start, so a
  // player who never readies can't stall the match forever.
  let refTime = m.startedAt?.getTime() ?? now;
  for (const r of rounds) {
    if (r.resolvedAt) { refTime = r.resolvedAt.getTime(); continue; }
    if (!r.startedAt) {
      if (now - refTime > 120_000) {
        updates.push(
          db.update(schema.quranMatchRounds)
            .set({ resolvedAt: new Date() })
            .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, r.round))),
        );
        r.resolvedAt = new Date();
        refTime = now;
      }
      continue;
    }
    const cDone = r.creatorCorrect !== null;
    const oDone = r.opponentCorrect !== null;
    const timedOut = now - r.startedAt.getTime() > ROUND_TIMEOUT_MS;
    // Resolve when both answered — covers the race where two answers
    // landed between each other's SELECT, leaving nobody to resolve —
    // or when the 90s window elapsed. Both-wrong / both-ghost = draw.
    if ((cDone && oDone) || timedOut) {
      const winner = resolveWinner({
        creatorCorrect: r.creatorCorrect ?? false, creatorMs: r.creatorMs,
        opponentCorrect: r.opponentCorrect ?? false, opponentMs: r.opponentMs,
        creatorId: m.creatorId, opponentId: m.opponentId,
      });
      updates.push(
        db.update(schema.quranMatchRounds)
          .set({ winnerId: winner, resolvedAt: new Date() })
          .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, r.round))),
      );
      r.winnerId = winner;
      r.resolvedAt = new Date();
    }
  }

  // Match end: all rounds resolved (or early majority on wins).
  const wins = { creator: 0, opponent: 0, draws: 0 };
  for (const r of rounds) {
    if (!r.resolvedAt) continue;
    if (r.winnerId === m.creatorId) wins.creator++;
    else if (r.winnerId === m.opponentId) wins.opponent++;
    else wins.draws++;
  }
  const majority = Math.floor(m.rounds / 2) + 1;
  const decided = wins.creator >= majority || wins.opponent >= majority;
  const allResolved = rounds.every((r) => r.resolvedAt);
  let status = m.status;
  // Pending challenges live 5 minutes — expire lazily so no sweeper needed.
  if (status === "pending" && now - m.createdAt.getTime() > INVITE_TTL_MS) {
    status = "expired";
    updates.push(
      db.update(schema.quranMatches)
        .set({ status: "expired", endedAt: new Date() })
        .where(and(eq(schema.quranMatches.id, id), eq(schema.quranMatches.status, "pending"))),
    );
  }
  if (status === "active" && (decided || allResolved)) {
    status = "done";
    const winnerId = wins.creator > wins.opponent ? m.creatorId : wins.opponent > wins.creator ? m.opponentId : null;
    updates.push(
      db.update(schema.quranMatches)
        .set({ status: "done", winnerId, endedAt: new Date(), rated: true })
        .where(eq(schema.quranMatches.id, id)),
    );
    m.winnerId = winnerId;

    // Ranked settle — Elite only, once per match (rated flag backstops the
    // lazy path). Winner +triple base, loser −small, draw neutral.
    if (m.difficulty === "elite" && !m.rated) {
      for (const uid of [m.creatorId, m.opponentId]) {
        const delta = winnerId === null ? MATCH_DRAW_PTS : uid === winnerId ? MATCH_WIN_PTS : MATCH_LOSS_PTS;
        if (delta === 0) continue;
        updates.push(
          db.insert(schema.quranRatings)
            .values({ userId: uid, rating: Math.max(0, delta), updatedAt: new Date() })
            .onConflictDoUpdate({
              target: schema.quranRatings.userId,
              set: { rating: sql`greatest(0, ${schema.quranRatings.rating} + ${delta})`, updatedAt: new Date() },
            }),
        );
      }
    }
  }
  if (updates.length) await Promise.all(updates);

  const current = rounds.find((r) => !r.resolvedAt) ?? null;

  // Opponent display name — one lookup per poll is fine at this cadence.
  const oppId = meIsCreator ? m.opponentId : m.creatorId;
  const [opp] = await db
    .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, oppId))
    .limit(1);

  // Option sets for ≤6-option difficulties are computed HERE, seeded by
  // match seed + round — never expose the seed: pickMatchVerses is
  // deterministic, so a leaked seed reveals every upcoming ayah's answer.
  // (Mutashabih rounds need no server options — the family itself carries them.)
  let options: number[] | null = null;
  if (current?.startedAt && m.game !== "mutashabih") {
    const optCount = m.difficulty === "easy" ? 4 : m.difficulty === "medium" ? 6 : 114;
    if (optCount <= 6) {
      const verse = getCorpus().verses[current.verseIdx];
      const rand = mulberry32(m.seed * 31 + current.round);
      options = plausibleOptions(SURAHS[verse.s - 1], optCount, rand).map((s) => s.n);
    }
  }

  // Mutashabih rounds: the mode cycles deterministically, and ending-mode
  // needs a shared target instance (which surah is being asked about).
  const roundMode = m.game === "mutashabih" && current ? matchMode(current.round) : null;
  const target = current?.startedAt && roundMode === "ending"
    ? matchTarget(m.seed, current.round, current.verseIdx)
    : null;

  return NextResponse.json({
    status,
    game: m.game,
    difficulty: m.difficulty,
    totalRounds: m.rounds,
    role: meIsCreator ? "creator" : "opponent",
    opponentName: opp?.firstName || opp?.displayName || "Opponent",
    myWins: meIsCreator ? wins.creator : wins.opponent,
    oppWins: meIsCreator ? wins.opponent : wins.creator,
    roundsPlayed: rounds.filter((r) => r.resolvedAt).length,
    winnerId: m.winnerId,
    youWin: status === "done" ? m.winnerId === session.userId : null,
    // Ranked stake for the done screen — Elite matches pay +48/−6 (draw 0).
    ratingDelta: status === "done" && m.difficulty === "elite"
      ? m.winnerId === null ? MATCH_DRAW_PTS : m.winnerId === session.userId ? MATCH_WIN_PTS : MATCH_LOSS_PTS
      : null,
    inviteExpiresAt: status === "pending"
      ? new Date(m.createdAt.getTime() + INVITE_TTL_MS).toISOString()
      : null,
    round: current
      ? {
          n: current.round,
          verseIdx: current.startedAt ? current.verseIdx : null, // hidden until both ready
          started: !!current.startedAt,
          startedAt: current.startedAt?.toISOString() ?? null,
          meReady: !!(meIsCreator ? current.creatorReadyAt : current.opponentReadyAt),
          oppReady: !!(meIsCreator ? current.opponentReadyAt : current.creatorReadyAt),
          meAnswered: (meIsCreator ? current.creatorCorrect : current.opponentCorrect) !== null,
          oppAnswered: (meIsCreator ? current.opponentCorrect : current.creatorCorrect) !== null,
          options,
          mode: roundMode,
          target,
        }
      : null,
    // Last resolved round's reveal — winner + both times for the scoreboard pause.
    lastResult: (() => {
      const resolved = rounds.filter((r) => r.resolvedAt);
      const r = resolved[resolved.length - 1];
      if (!r) return null;
      return {
        n: r.round,
        won: r.winnerId === null ? null : r.winnerId === session.userId,
        winnerId: r.winnerId,
        verseIdx: r.verseIdx,
        meMs: meIsCreator ? r.creatorMs : r.opponentMs,
        oppMs: meIsCreator ? r.opponentMs : r.creatorMs,
        meCorrect: meIsCreator ? r.creatorCorrect : r.opponentCorrect,
        oppCorrect: meIsCreator ? r.opponentCorrect : r.creatorCorrect,
      };
    })(),
  });
}
