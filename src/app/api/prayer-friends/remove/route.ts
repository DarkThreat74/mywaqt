import { NextRequest, NextResponse } from "next/server";
import { eq, and, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimitAsync } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// DELETE /api/prayer-friends/remove?friendId=UUID — remove a prayer friend (both directions)
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!await checkRateLimitAsync("prayer-friend-remove", ip, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const friendId = searchParams.get("friendId");

  if (!friendId) {
    return NextResponse.json({ error: "Missing friendId." }, { status: 400 });
  }

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(friendId)) {
    return NextResponse.json({ error: "Invalid friendId." }, { status: 400 });
  }

  // Remove both directions — you unfriend them, they unfriend you.
  // returning() tells us whether a friendship actually existed — without it
  // anyone could spam "Friend removed" notifications to arbitrary user IDs.
  const removed = await db
    .delete(schema.prayerFriends)
    .where(
      or(
        and(
          eq(schema.prayerFriends.userId, session.userId),
          eq(schema.prayerFriends.friendId, friendId),
        ),
        and(
          eq(schema.prayerFriends.userId, friendId),
          eq(schema.prayerFriends.friendId, session.userId),
        ),
      ),
    )
    .returning({ userId: schema.prayerFriends.userId });

  if (removed.length === 0) {
    return NextResponse.json({ ok: true, removed: false });
  }

  // Both sides stay in sync: the removed friend is unlocked and told.
  const [me] = await db
    .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  await db.insert(schema.appNotifications).values({
    userId: friendId,
    type: "friend_removed",
    title: "Friend removed",
    body: `You are no longer friends with ${me?.firstName || me?.displayName || "a friend"}.`,
  });

  return NextResponse.json({ ok: true });
}
