import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { notifyUser } from "@/lib/quran-match";

export const dynamic = "force-dynamic";

// POST /api/quran/match/[id]/cancel — creator withdraws a pending challenge.
// The status='pending' predicate makes cancel vs accept race-safe: whichever
// update lands first wins, the loser sees no row and reports stale state.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-cancel", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  const [updated] = await db
    .update(schema.quranMatches)
    .set({ status: "cancelled", endedAt: new Date() })
    .where(
      and(
        eq(schema.quranMatches.id, id),
        eq(schema.quranMatches.creatorId, session.userId), // only the challenger can cancel
        eq(schema.quranMatches.status, "pending"),
      ),
    )
    .returning({ opponentId: schema.quranMatches.opponentId, game: schema.quranMatches.game });

  if (!updated) {
    return NextResponse.json({ error: "This challenge is already resolved." }, { status: 409 });
  }

  // The opponent's invite card is derived from pending rows, so it disappears
  // on their next inbox poll. A push tells them not to bother tapping a stale
  // notification that may still sit in their OS tray.
  const [me] = await db
    .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  const name = me?.firstName || me?.displayName || "Your friend";
  const base = updated.game === "mutashabih" ? "/mutashabihat" : "/quran";
  await notifyUser(updated.opponentId, "Challenge withdrawn", `${name} withdrew their challenge.`, base);

  return NextResponse.json({ ok: true });
}
