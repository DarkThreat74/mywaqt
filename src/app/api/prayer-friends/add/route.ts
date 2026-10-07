import { NextRequest, NextResponse } from "next/server";
import { eq, and, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { sendPrayerPush } from "@/lib/notifications/push";
import { FRIEND_REQUEST_TTL_MS } from "@/lib/friend-requests";

export const dynamic = "force-dynamic";

// Re-send cooldown: must wait 7 days after rejection before re-sending
const RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Max pending outgoing requests
const MAX_PENDING_OUTGOING = 20;
// Max accepted friends — bounds the friends payload and per-user fan-out
const MAX_FRIENDS = 100;

// Helper: send push notification to a user
async function notifyUser(userId: string, title: string, body: string) {
  try {
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));
    for (const sub of subs) {
      await sendPrayerPush(sub, JSON.stringify({ title, body, url: "/prayer" }));
    }
  } catch {
    // Push is best-effort
  }
}

// POST /api/prayer-friends/add — send a friend request by prayer code
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-friend-add", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { code } = body as { code?: string };
  if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  // Find the friend by their prayer code
  const [friendUser] = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      displayName: schema.users.displayName,
    })
    .from(schema.users)
    .where(eq(schema.users.prayerCode, code))
    .limit(1);

  if (!friendUser) {
    return NextResponse.json({ error: "No user found with that code." }, { status: 404 });
  }

  if (friendUser.id === session.userId) {
    return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });
  }

  // ── Activation gate (both directions) — friends are opt-in. A user is
  // active when prayer_settings.friends_active is set OR they already have a
  // friendship row (existing users grandfathered, and the flag flips lazily). ──
  const [mySettings, myFriendRow, friendSettings, friendRow] = await Promise.all([
    db.select({ friendsActive: schema.prayerSettings.friendsActive })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId)).limit(1),
    db.select({ id: schema.prayerFriends.id })
      .from(schema.prayerFriends)
      .where(or(eq(schema.prayerFriends.userId, session.userId), eq(schema.prayerFriends.friendId, session.userId))).limit(1),
    db.select({ friendsActive: schema.prayerSettings.friendsActive })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, friendUser.id)).limit(1),
    db.select({ id: schema.prayerFriends.id })
      .from(schema.prayerFriends)
      .where(or(eq(schema.prayerFriends.userId, friendUser.id), eq(schema.prayerFriends.friendId, friendUser.id))).limit(1),
  ]);

  if (!(mySettings[0]?.friendsActive ?? false) && myFriendRow.length === 0) {
    return NextResponse.json({ error: "Activate friends in the Friends tab first." }, { status: 403 });
  }
  if (!(friendSettings[0]?.friendsActive ?? false) && friendRow.length === 0) {
    return NextResponse.json({ error: "They haven't activated friends yet." }, { status: 403 });
  }

  // ── Block check: either side may have blocked the other ──
  const [block] = await db
    .select({ id: schema.prayerBlocks.id })
    .from(schema.prayerBlocks)
    .where(
      or(
        and(eq(schema.prayerBlocks.userId, session.userId), eq(schema.prayerBlocks.blockedUserId, friendUser.id)),
        and(eq(schema.prayerBlocks.userId, friendUser.id), eq(schema.prayerBlocks.blockedUserId, session.userId)),
      ),
    )
    .limit(1);

  if (block) {
    // Don't reveal who blocked whom — generic message
    return NextResponse.json({ error: "Unable to send request to this user." }, { status: 403 });
  }

  // Check if a request already exists in either direction
  const [existing] = await db
    .select({
      id: schema.prayerFriends.id,
      status: schema.prayerFriends.status,
      userId: schema.prayerFriends.userId,
      friendId: schema.prayerFriends.friendId,
      respondedAt: schema.prayerFriends.respondedAt,
      createdAt: schema.prayerFriends.createdAt,
    })
    .from(schema.prayerFriends)
    .where(
      or(
        and(
          eq(schema.prayerFriends.userId, session.userId),
          eq(schema.prayerFriends.friendId, friendUser.id),
        ),
        and(
          eq(schema.prayerFriends.userId, friendUser.id),
          eq(schema.prayerFriends.friendId, session.userId),
        ),
      ),
    )
    .limit(1);

  if (existing) {
    // A pending request older than 72h is dead — flip it to expired so it
    // can be re-sent below instead of blocking with "already sent" forever.
    if (
      existing.status === "pending" &&
      Date.now() - new Date(existing.createdAt).getTime() > FRIEND_REQUEST_TTL_MS
    ) {
      await db
        .update(schema.prayerFriends)
        .set({ status: "expired", respondedAt: new Date() })
        .where(eq(schema.prayerFriends.id, existing.id));
      existing.status = "expired";
    }
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends." }, { status: 409 });
    }
    if (existing.status === "pending") {
      // If the OTHER person sent the request to ME, auto-accept
      if (existing.userId === friendUser.id && existing.friendId === session.userId) {
        await db
          .update(schema.prayerFriends)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(eq(schema.prayerFriends.id, existing.id));
        // Insert the reverse row
        await db
          .insert(schema.prayerFriends)
          .values({
            userId: session.userId,
            friendId: friendUser.id,
            status: "accepted",
            respondedAt: new Date(),
          })
          .onConflictDoNothing();
        return NextResponse.json({ ok: true, friend: { id: friendUser.id, firstName: friendUser.firstName, displayName: friendUser.displayName } });
      }
      return NextResponse.json({ error: "Friend request already sent." }, { status: 409 });
    }
    // Expired request sent BY me — re-send on the same row, no cooldown
    // (it lapsed; nobody declined). createdAt resets or it re-expires instantly.
    if (existing.status === "expired" && existing.userId === session.userId) {
      await db
        .update(schema.prayerFriends)
        .set({ status: "pending", respondedAt: null, createdAt: new Date() })
        .where(eq(schema.prayerFriends.id, existing.id));

      const [requester] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const requesterName = requester?.firstName || requester?.displayName || "Someone";
      await notifyUser(friendUser.id, "New friend request", `${requesterName} wants to connect with you on Waqt. Tap to accept or reject.`);

      return NextResponse.json({ ok: true, pending: true, message: "Friend request sent." });
    }
    // An expired request in THEIR direction doesn't block a fresh one —
    // fall through to the plain insert below (different unique-key row).

    if (existing.status === "rejected") {
      // Cooldown: enforce 7-day wait before re-sending
      if (existing.respondedAt) {
        const elapsed = Date.now() - new Date(existing.respondedAt).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          const daysLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
          return NextResponse.json(
            { error: `Please wait ${daysLeft} more day(s) before sending another request.` },
            { status: 429 },
          );
        }
      }

      // Only the original sender can re-send (not the rejecter)
      if (existing.userId !== session.userId) {
        return NextResponse.json({ error: "Unable to re-send this request." }, { status: 403 });
      }

      // Re-send: update to pending, reset respondedAt AND createdAt —
      // without a fresh createdAt the 72h expiry would kill it instantly.
      await db
        .update(schema.prayerFriends)
        .set({ status: "pending", respondedAt: null, createdAt: new Date() })
        .where(eq(schema.prayerFriends.id, existing.id));

      // Send push notification on re-send (was missing before)
      const [requester] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const requesterName = requester?.firstName || requester?.displayName || "Someone";
      await notifyUser(friendUser.id, "New friend request", `${requesterName} wants to connect with you on Waqt. Tap to accept or reject.`);

      return NextResponse.json({ ok: true, pending: true, message: "Friend request sent." });
    }
  }

  // ── Cap on accepted friends ──
  const acceptedCount = await db
    .select({ id: schema.prayerFriends.id })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.userId, session.userId),
        eq(schema.prayerFriends.status, "accepted"),
      ),
    );
  if (acceptedCount.length >= MAX_FRIENDS) {
    return NextResponse.json(
      { error: `You've reached the ${MAX_FRIENDS}-friend limit. Remove a friend first.` },
      { status: 429 },
    );
  }

  // ── Cap on pending outgoing requests ──
  const pendingCount = await db
    .select({ id: schema.prayerFriends.id })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.userId, session.userId),
        eq(schema.prayerFriends.status, "pending"),
      ),
    );
  if (pendingCount.length >= MAX_PENDING_OUTGOING) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_PENDING_OUTGOING} pending friend requests. Wait for some to be accepted or rejected.` },
      { status: 429 },
    );
  }

  // Create a pending friend request (one row — the target must accept)
  await db
    .insert(schema.prayerFriends)
    .values({
      userId: session.userId,
      friendId: friendUser.id,
      status: "pending",
    })
    .onConflictDoNothing();

  // Send push notification to the target user
  try {
    const [requester] = await db
      .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    const requesterName = requester?.firstName || requester?.displayName || "Someone";
    await notifyUser(friendUser.id, "New friend request", `${requesterName} wants to connect with you on Waqt. Tap to accept or reject.`);
  } catch {
    // Push notification is best-effort
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    message: "Friend request sent. They'll need to accept it.",
    friend: {
      id: friendUser.id,
      firstName: friendUser.firstName,
      displayName: friendUser.displayName,
    },
  });
}
