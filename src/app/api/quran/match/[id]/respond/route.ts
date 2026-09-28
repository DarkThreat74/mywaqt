import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { notifyUser } from "@/lib/quran-match";

export const dynamic = "force-dynamic";

// POST /api/quran/match/[id]/respond — accept or decline a challenge.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("quran-match-respond", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid match." }, { status: 400 });

  let body: { accept?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.accept !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const [updated] = await db
    .update(schema.quranMatches)
    .set(
      body.accept
        ? { status: "active", startedAt: new Date() }
        : { status: "declined", endedAt: new Date() },
    )
    .where(
      and(
        eq(schema.quranMatches.id, id),
        eq(schema.quranMatches.opponentId, session.userId), // only the challenged may respond
        eq(schema.quranMatches.status, "pending"),
      ),
    )
    .returning({ creatorId: schema.quranMatches.creatorId });

  if (!updated) {
    return NextResponse.json({ error: "No pending match for you." }, { status: 404 });
  }

  if (body.accept) {
    const [me] = await db
      .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);
    const name = me?.firstName || me?.displayName || "Your opponent";
    await notifyUser(updated.creatorId, "Challenge accepted", `${name} accepted — your match is on.`, `/quran?match=${id}`);
  }

  return NextResponse.json({ ok: true });
}
