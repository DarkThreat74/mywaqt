import { eq, and, lt, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/** Friend requests die 72h after they're sent — enforced lazily on read/write. */
export const FRIEND_REQUEST_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Mark stale pending rows as expired. Call before reading pending lists so
 * receivers never see dead requests, and before respond/add so stale rows
 * can't be acted on or block re-sending. Fire-and-forget safe.
 */
export async function expireStaleFriendRequests() {
  await db
    .update(schema.prayerFriends)
    .set({ status: "expired", respondedAt: new Date() })
    .where(
      and(
        eq(schema.prayerFriends.status, "pending"),
        lt(schema.prayerFriends.createdAt, new Date(Date.now() - FRIEND_REQUEST_TTL_MS)),
      ),
    );
}

/** Names for a set of user ids — firstName || displayName fallback. */
export async function namesFor(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  return new Map(rows.map((u) => [u.id, u.firstName || u.displayName || "Someone"]));
}
