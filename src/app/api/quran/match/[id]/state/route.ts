import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

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

  // Lazy timeout: round started >90s and one side still hasn't answered.
  for (const r of rounds) {
    if (r.resolvedAt || !r.startedAt) continue;
    const cDone = r.creatorCorrect !== null;
    const oDone = r.opponentCorrect !== null;
    if (cDone && oDone) continue;
    if (now - r.startedAt.getTime() > ROUND_TIMEOUT_MS && (cDone || oDone)) {
      // The side that answered wins if correct, else draw.
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
  if (status === "active" && (decided || allResolved)) {
    status = "done";
    const winnerId = wins.creator > wins.opponent ? m.creatorId : wins.opponent > wins.creator ? m.opponentId : null;
    updates.push(
      db.update(schema.quranMatches)
        .set({ status: "done", winnerId, endedAt: new Date() })
        .where(eq(schema.quranMatches.id, id)),
    );
    m.winnerId = winnerId;
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

  return NextResponse.json({
    status,
    difficulty: m.difficulty,
    totalRounds: m.rounds,
    seed: m.seed, // drives identical option sets on both clients
    role: meIsCreator ? "creator" : "opponent",
    opponentName: opp?.firstName || opp?.displayName || "Opponent",
    myWins: meIsCreator ? wins.creator : wins.opponent,
    oppWins: meIsCreator ? wins.opponent : wins.creator,
    winnerId: m.winnerId,
    youWin: status === "done" ? m.winnerId === session.userId : null,
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
