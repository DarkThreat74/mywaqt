import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";

const POSITIVE_STATUSES = ["prayed", "assumed_prayed", "excused"] as const;

function prevDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Called after a positive check-in (inside next/server after()). Counts the
 * user's positive logs for the date; if all 5 are positive, records the
 * completion once and fans out:
 *  - shared streak update for each accepted friend who also completed `date`
 *  - opt-in push to friends who enabled completion notifications
 * Must never throw back to the request.
 */
export async function recordDayCompletion(userId: string, date: string): Promise<void> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.prayerLog)
      .where(
        and(
          eq(schema.prayerLog.userId, userId),
          eq(schema.prayerLog.date, date),
          inArray(schema.prayerLog.status, [...POSITIVE_STATUSES]),
        ),
      );
    if (count < 5) return;

    // First completion only — the unique PK dedupes retries/double-taps.
    const inserted = await db
      .insert(schema.prayerDayCompletions)
      .values({ userId, date })
      .onConflictDoNothing()
      .returning({ userId: schema.prayerDayCompletions.userId });
    if (inserted.length === 0) return;

    await fanOutDayCompletion(userId, date);
  } catch (err) {
    logError(err, { fn: "recordDayCompletion", userId, date });
  }
}

async function fanOutDayCompletion(userId: string, date: string): Promise<void> {
  // Accepted friends (me → them), bounded by the 100-friend cap.
  const friendships = await db
    .select({ friendId: schema.prayerFriends.friendId })
    .from(schema.prayerFriends)
    .where(and(eq(schema.prayerFriends.userId, userId), eq(schema.prayerFriends.status, "accepted")))
    .limit(100);
  if (friendships.length === 0) return;

  const friendIds = friendships.map((f) => f.friendId);
  const yesterday = prevDate(date);

  // Friends who also completed this same date → shared streak increments.
  const completedFriends = await db
    .select({ userId: schema.prayerDayCompletions.userId })
    .from(schema.prayerDayCompletions)
    .where(and(eq(schema.prayerDayCompletions.date, date), inArray(schema.prayerDayCompletions.userId, friendIds)));

  await Promise.all(
    completedFriends.map(({ userId: friendId }) => {
      const [low, high] = userId < friendId ? [userId, friendId] : [friendId, userId];
      return db
        .insert(schema.prayerFriendStreaks)
        .values({ userLowId: low, userHighId: high, streak: 1, bestStreak: 1, lastDate: date, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.prayerFriendStreaks.userLowId, schema.prayerFriendStreaks.userHighId],
          set: {
            // Continue only if the last matched date was yesterday; a gap
            // restarts at 1. Matching the same date twice never double-counts.
            streak: sql`CASE WHEN ${schema.prayerFriendStreaks.lastDate} = ${yesterday}
              THEN ${schema.prayerFriendStreaks.streak} + 1
              WHEN ${schema.prayerFriendStreaks.lastDate} = ${date}
              THEN ${schema.prayerFriendStreaks.streak}
              ELSE 1 END`,
            bestStreak: sql`GREATEST(${schema.prayerFriendStreaks.bestStreak},
              CASE WHEN ${schema.prayerFriendStreaks.lastDate} = ${yesterday}
                THEN ${schema.prayerFriendStreaks.streak} + 1
                WHEN ${schema.prayerFriendStreaks.lastDate} = ${date}
                THEN ${schema.prayerFriendStreaks.streak}
                ELSE 1 END)`,
            lastDate: sql`GREATEST(${schema.prayerFriendStreaks.lastDate}, ${date})`,
            updatedAt: new Date(),
          },
        });
    }),
  );

  // Opt-in completion pushes. The completing user must share today's status —
  // otherwise the push itself would leak private data.
  const [mySettings] = await db
    .select({ shares: schema.prayerSettings.friendsSeeTodayStatus })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, userId))
    .limit(1);
  if (!mySettings?.shares) return;

  const optedIn = await db
    .select({ userId: schema.prayerSettings.userId })
    .from(schema.prayerSettings)
    .where(and(eq(schema.prayerSettings.friendsNotifyComplete, true), inArray(schema.prayerSettings.userId, friendIds)));
  if (optedIn.length === 0) return;

  const optedIds = optedIn.map((r) => r.userId);
  const [me] = await db
    .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const senderName = me?.firstName || me?.displayName || "A friend";

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(inArray(schema.pushSubscriptions.userId, optedIds));

  const expiredIds: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      const result = await sendPrayerPush(sub, JSON.stringify({
        title: "Prayer buddy",
        body: `${senderName} completed all 5 prayers today.`,
        url: "/prayer?tab=friends",
      }), {
        // Collapse per sender — only the latest completion shows, and expire
        // after 6h so yesterday's news never arrives.
        topic: `friend-complete-${userId}`,
        ttl: 6 * 60 * 60,
      });
      if (result.expired) expiredIds.push(sub.id);
    }),
  );
  if (expiredIds.length > 0) {
    await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, expiredIds));
  }
}
