import { NextRequest, NextResponse } from "next/server";
import { eq, and, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST /api/prayer-friends/block — block a user (also removes any friendship)
// Body: { userId: string }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-friend-block", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { userId: blockedId } = body;
  if (!blockedId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(blockedId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
  }
  if (blockedId === session.userId) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }

  // Insert block (idempotent via unique index)
  await db
    .insert(schema.prayerBlocks)
    .values({
      userId: session.userId,
      blockedUserId: blockedId,
    })
    .onConflictDoNothing();

  // Remove any friendship in both directions
  await db
    .delete(schema.prayerFriends)
    .where(
      or(
        and(eq(schema.prayerFriends.userId, session.userId), eq(schema.prayerFriends.friendId, blockedId)),
        and(eq(schema.prayerFriends.userId, blockedId), eq(schema.prayerFriends.friendId, session.userId)),
      ),
    );

  return NextResponse.json({ ok: true });
}

// DELETE /api/prayer-friends/block?userId=... — unblock a user
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("prayer-friend-unblock", getClientIp(request.headers), 10, 900000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const blockedId = searchParams.get("userId");
  if (!blockedId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  await db
    .delete(schema.prayerBlocks)
    .where(
      and(
        eq(schema.prayerBlocks.userId, session.userId),
        eq(schema.prayerBlocks.blockedUserId, blockedId),
      ),
    );

  return NextResponse.json({ ok: true });
}
