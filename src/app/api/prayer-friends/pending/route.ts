import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/prayer-friends/pending — list pending friend requests for the current user
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("pf-pending", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Find pending requests addressed to me (I am the friendId)
  const requests = await db
    .select({
      id: schema.prayerFriends.id,
      createdAt: schema.prayerFriends.createdAt,
      requesterId: schema.prayerFriends.userId,
      requesterFirstName: schema.users.firstName,
      requesterDisplayName: schema.users.displayName,
    })
    .from(schema.prayerFriends)
    .innerJoin(schema.users, eq(schema.prayerFriends.userId, schema.users.id))
    .where(
      and(
        eq(schema.prayerFriends.friendId, session.userId),
        eq(schema.prayerFriends.status, "pending"),
      ),
    )
    .orderBy(desc(schema.prayerFriends.createdAt));

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      requester: {
        id: r.requesterId,
        firstName: r.requesterFirstName,
        displayName: r.requesterDisplayName,
      },
    })),
  });
}
