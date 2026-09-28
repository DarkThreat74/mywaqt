import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/quran/match/[id]/ready { round } — the rendezvous point.
 * Each player marks ready for the current round; when BOTH have, startedAt is
 * stamped and the verse is revealed to both via /state. Idempotent per round.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-ready", ip, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  let body: { round?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const round = body.round;
  if (!Number.isInteger(round) || round! < 1 || round! > 20) {
    return NextResponse.json({ error: "Invalid round." }, { status: 400 });
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

  // Ready only counts for the earliest unresolved round — pre-readying
  // future rounds would let one side blitz through before the other's
  // screen ever shows the ayah.
  const [next] = await db
    .select({ round: schema.quranMatchRounds.round })
    .from(schema.quranMatchRounds)
    .where(and(eq(schema.quranMatchRounds.matchId, id), isNull(schema.quranMatchRounds.resolvedAt)))
    .orderBy(asc(schema.quranMatchRounds.round))
    .limit(1);
  if (next?.round !== round) {
    return NextResponse.json({ error: "Not the current round." }, { status: 409 });
  }

  await db
    .update(schema.quranMatchRounds)
    .set(meIsCreator ? { creatorReadyAt: new Date() } : { opponentReadyAt: new Date() })
    .where(
      and(
        eq(schema.quranMatchRounds.matchId, id),
        eq(schema.quranMatchRounds.round, round!),
        isNull(schema.quranMatchRounds.resolvedAt),
      ),
    );

  // If both are now ready and the round hasn't started, start it.
  const [r] = await db
    .select()
    .from(schema.quranMatchRounds)
    .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, round!)))
    .limit(1);
  if (r && !r.startedAt && r.creatorReadyAt && r.opponentReadyAt) {
    await db
      .update(schema.quranMatchRounds)
      .set({ startedAt: new Date() })
      .where(and(eq(schema.quranMatchRounds.matchId, id), eq(schema.quranMatchRounds.round, round!)));
  }

  return NextResponse.json({ ok: true });
}
