import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { sendPrayerPush } from "@/lib/notifications/push";

export const dynamic = "force-dynamic";

// POST /api/prayer-friends/respond — accept or reject a friend request
// Body: { requestId: string, action: "accept" | "reject" }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-friend-respond", ip, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { requestId, action } = body as { requestId?: string; action?: string };

  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json({ error: "Missing request ID." }, { status: 400 });
  }

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action. Use 'accept' or 'reject'." }, { status: 400 });
  }

  // Find the pending request — must be addressed to the current user
  const [friendReq] = await db
    .select({
      id: schema.prayerFriends.id,
      userId: schema.prayerFriends.userId,
      friendId: schema.prayerFriends.friendId,
      status: schema.prayerFriends.status,
    })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.id, requestId),
        eq(schema.prayerFriends.friendId, session.userId),
      ),
    )
    .limit(1);

  if (!friendReq) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (friendReq.status !== "pending") {
    return NextResponse.json({ error: `Request already ${friendReq.status}.` }, { status: 409 });
  }

  if (action === "accept") {
    // Cap accepted friends at 100 for both parties — bounds fan-out
    const [myCount, theirCount] = await Promise.all([
      db
        .select({ id: schema.prayerFriends.id })
        .from(schema.prayerFriends)
        .where(and(eq(schema.prayerFriends.userId, session.userId), eq(schema.prayerFriends.status, "accepted"))),
      db
        .select({ id: schema.prayerFriends.id })
        .from(schema.prayerFriends)
        .where(and(eq(schema.prayerFriends.userId, friendReq.userId), eq(schema.prayerFriends.status, "accepted"))),
    ]);
    if (myCount.length >= 100 || theirCount.length >= 100) {
      return NextResponse.json(
        { error: "One of you has reached the 100-friend limit." },
        { status: 429 },
      );
    }

    // Update the request to accepted
    await db
      .update(schema.prayerFriends)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(schema.prayerFriends.id, requestId));

    // Insert the reverse row (friend → me) so both sides can see each other
    await db
      .insert(schema.prayerFriends)
      .values({
        userId: session.userId,
        friendId: friendReq.userId,
        status: "accepted",
        respondedAt: new Date(),
      })
      .onConflictDoNothing();

    // Notify the original requester that their request was accepted
    try {
      const [accepter] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);

      const accepterName = accepter?.firstName || accepter?.displayName || "Someone";
      const subs = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.userId, friendReq.userId));

      for (const sub of subs) {
        await sendPrayerPush(sub, JSON.stringify({
          title: "Friend request accepted",
          body: `${accepterName} accepted your friend request on Waqt!`,
          url: "/prayer",
        }));
      }
    } catch {
      // Push is best-effort
    }

    return NextResponse.json({ ok: true, status: "accepted" });
  } else {
    // Reject — mark as rejected
    await db
      .update(schema.prayerFriends)
      .set({ status: "rejected", respondedAt: new Date() })
      .where(eq(schema.prayerFriends.id, requestId));

    return NextResponse.json({ ok: true, status: "rejected" });
  }
}
