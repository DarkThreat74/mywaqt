import { eq, and, or } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { sendPrayerPush } from "@/lib/notifications/push";

/** Verify the pair are accepted friends (either direction). */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.prayerFriends.id })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.status, "accepted"),
        or(
          and(eq(schema.prayerFriends.userId, a), eq(schema.prayerFriends.friendId, b)),
          and(eq(schema.prayerFriends.userId, b), eq(schema.prayerFriends.friendId, a)),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

/** Best-effort push to every subscription a user has — never throws. */
export async function notifyUser(userId: string, title: string, body: string, url: string) {
  try {
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));
    for (const sub of subs) {
      await sendPrayerPush(sub, JSON.stringify({ title, body, url }));
    }
  } catch { /* push is best-effort */ }
}
