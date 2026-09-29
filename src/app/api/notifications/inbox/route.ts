import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, gt, lt, isNull, inArray, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { INVITE_TTL_MS } from "@/lib/quran-match";
import { FRIEND_REQUEST_TTL_MS } from "@/lib/friend-requests";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/inbox — everything the toast tray + bell cares about:
 * unacknowledged notification rows, live friend requests, live match invites,
 * and the caller's active match (for the return-to-match pill).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit("notif-inbox", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const now = Date.now();

  const [notifs, friendReqs, invites, actives] = await Promise.all([
    db
      .select()
      .from(schema.appNotifications)
      .where(
        and(
          eq(schema.appNotifications.userId, session.userId),
          isNull(schema.appNotifications.acknowledgedAt),
        ),
      )
      .orderBy(desc(schema.appNotifications.createdAt))
      .limit(20),

    // Pending friend requests addressed to me — snoozed ones stay hidden
    // until dismissedUntil passes; last 2h of life the snooze option is
    // withheld client-side.
    db
      .select({
        id: schema.prayerFriends.id,
        createdAt: schema.prayerFriends.createdAt,
        name: schema.users.firstName,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.prayerFriends)
      .innerJoin(schema.users, eq(schema.users.id, schema.prayerFriends.userId))
      .where(
        and(
          eq(schema.prayerFriends.friendId, session.userId),
          eq(schema.prayerFriends.status, "pending"),
          gt(schema.prayerFriends.createdAt, new Date(now - FRIEND_REQUEST_TTL_MS)),
          or(
            isNull(schema.prayerFriends.dismissedUntil),
            lt(schema.prayerFriends.dismissedUntil, new Date()),
          ),
        ),
      )
      .orderBy(desc(schema.prayerFriends.createdAt))
      .limit(10),

    db
      .select({
        id: schema.quranMatches.id,
        creatorId: schema.quranMatches.creatorId,
        game: schema.quranMatches.game,
        difficulty: schema.quranMatches.difficulty,
        rounds: schema.quranMatches.rounds,
        createdAt: schema.quranMatches.createdAt,
      })
      .from(schema.quranMatches)
      .where(
        and(
          eq(schema.quranMatches.opponentId, session.userId),
          eq(schema.quranMatches.status, "pending"),
          gt(schema.quranMatches.createdAt, new Date(now - INVITE_TTL_MS)),
        ),
      )
      .limit(5),

    // Any match I'm a participant in that's still running — for the pill.
    db
      .select({
        id: schema.quranMatches.id,
        creatorId: schema.quranMatches.creatorId,
        opponentId: schema.quranMatches.opponentId,
        game: schema.quranMatches.game,
        startedAt: schema.quranMatches.startedAt,
      })
      .from(schema.quranMatches)
      .where(
        and(
          or(
            eq(schema.quranMatches.creatorId, session.userId),
            eq(schema.quranMatches.opponentId, session.userId),
          ),
          eq(schema.quranMatches.status, "active"),
        ),
      )
      .limit(1),
  ]);

  // Names for invite creators + active-match opponents in one batch.
  const otherIds = new Set<string>();
  for (const i of invites) otherIds.add(i.creatorId);
  for (const a of actives) otherIds.add(a.creatorId === session.userId ? a.opponentId : a.creatorId);
  const names = otherIds.size
    ? await db
        .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(inArray(schema.users.id, [...otherIds]))
    : [];
  const nameOf = new Map(names.map((u) => [u.id, u.firstName || u.displayName || "A friend"]));

  const active = actives[0] ?? null;

  return NextResponse.json({
    notifications: notifs.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    friendRequests: friendReqs.map((r) => ({
      id: r.id,
      name: r.name || r.displayName || "Someone",
      avatarUrl: r.avatarUrl,
      createdAt: r.createdAt.toISOString(),
      expiresAt: new Date(r.createdAt.getTime() + FRIEND_REQUEST_TTL_MS).toISOString(),
    })),
    gameInvites: invites.map((r) => ({
      id: r.id,
      from: nameOf.get(r.creatorId) ?? "A friend",
      game: r.game,
      difficulty: r.difficulty,
      rounds: r.rounds,
      expiresAt: new Date(r.createdAt.getTime() + INVITE_TTL_MS).toISOString(),
    })),
    activeMatch: active
      ? {
          id: active.id,
          game: active.game,
          opponentName: nameOf.get(active.creatorId === session.userId ? active.opponentId : active.creatorId) ?? "Opponent",
        }
      : null,
  });
}
