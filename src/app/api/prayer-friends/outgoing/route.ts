import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { expireStaleFriendRequests, namesFor } from "@/lib/friend-requests";

export const dynamic = "force-dynamic";

// GET /api/prayer-friends/outgoing — requests I've sent, newest first, with
// their current status (pending | accepted | rejected | expired). Stale
// pending rows are flipped to expired before reading so the list is accurate.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit("pf-outgoing", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  await expireStaleFriendRequests();

  const rows = await db
    .select({
      id: schema.prayerFriends.id,
      friendId: schema.prayerFriends.friendId,
      status: schema.prayerFriends.status,
      createdAt: schema.prayerFriends.createdAt,
      respondedAt: schema.prayerFriends.respondedAt,
    })
    .from(schema.prayerFriends)
    .where(eq(schema.prayerFriends.userId, session.userId))
    .orderBy(desc(schema.prayerFriends.createdAt))
    .limit(50);

  // Latest request per recipient — resends create history, show only the
  // current state of each relationship.
  const seen = new Set<string>();
  const latest = rows.filter((r) => !seen.has(r.friendId) && seen.add(r.friendId));
  const names = await namesFor(latest.map((r) => r.friendId));

  return NextResponse.json({
    requests: latest.map((r) => ({
      id: r.id,
      name: names.get(r.friendId) ?? "Someone",
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null,
    })),
  });
}
