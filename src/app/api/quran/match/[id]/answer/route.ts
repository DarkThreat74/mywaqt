import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/quran/match/[id]/answer { round, correct, ms } — stamps my answer.
 * `ms` is self-reported (time from seeing the ayah to answering) — it's a
 * friends game; the 120s clamp + server timestamps bound the honesty window.
 * When both have answered, the winner resolves atomically here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-answer", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  let body: { round?: number; correct?: boolean; ms?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { round, correct } = body;
  const ms = Math.max(0, Math.min(Math.round(body.ms ?? 0), 120_000));
  if (!Number.isInteger(round) || round! < 1 || round! > 20 || typeof correct !== "boolean") {
    return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
  }

  const [m] = await db
    .select()
    .from(schema.quranMatches)
    .where(eq(schema.quranMatches.id, id))
    .limit(1);
  if (!m || m.status !== "active") {
    return NextResponse.json({ error: "Match not active." }, { status: 409 });
  }
  const meIsCreator = m.creatorId === session.userId;
  if (!meIsCreator && m.opponentId !== session.userId) {
    return NextResponse.json({ error: "Not your match." }, { status: 403 });
  }

  const [r] = await db
    .select()
    .from(schema.quranMatchRounds)
    .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, round!)))
    .limit(1);
  if (!r || !r.startedAt || r.resolvedAt) {
    return NextResponse.json({ error: "Round not open." }, { status: 409 });
  }

  // Conditional stamp — an already-answered column refuses overwrite.
  const myCol = meIsCreator ? schema.quranMatchRounds.creatorCorrect : schema.quranMatchRounds.opponentCorrect;
  const [updated] = await db
    .update(schema.quranMatchRounds)
    .set(
      meIsCreator
        ? { creatorCorrect: correct, creatorMs: ms }
        : { opponentCorrect: correct, opponentMs: ms },
    )
    .where(
      and(
        eq(schema.quranMatchRounds.matchId, id),
        eq(schema.quranMatchRounds.round, round!),
        isNull(myCol),
      ),
    )
    .returning({ round: schema.quranMatchRounds.round });
  if (!updated) {
    return NextResponse.json({ error: "Already answered." }, { status: 409 });
  }

  // Resolve as soon as the outcome is known: both answered, OR anyone
  // answered correctly — first correct takes the round, so the loser
  // still thinking shouldn't stall the match (90s felt like a hang).
  const theirsDone = meIsCreator ? r.opponentCorrect !== null : r.creatorCorrect !== null;
  if (theirsDone || correct) {
    const cOk = meIsCreator ? correct : r.creatorCorrect === true;
    const oOk = meIsCreator ? r.opponentCorrect === true : correct;
    const cMs = meIsCreator ? ms : r.creatorMs;
    const oMs = meIsCreator ? r.opponentMs : ms;
    let winner: string | null = null;
    if (cOk && !oOk) winner = m.creatorId;
    else if (oOk && !cOk) winner = m.opponentId;
    else if (cOk && oOk) winner = (cMs ?? 1e9) <= (oMs ?? 1e9) ? m.creatorId : m.opponentId;
    await db
      .update(schema.quranMatchRounds)
      .set({ winnerId: winner, resolvedAt: new Date() })
      .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, round!)));
  }

  return NextResponse.json({ ok: true });
}
