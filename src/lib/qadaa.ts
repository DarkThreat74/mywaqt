import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { todayInTimezone } from "@/lib/prayer/checkin";

/**
 * Advance the "unlogged misses" waterline to today in the user's timezone.
 * Called whenever the user deliberately engages — logging a prayer or
 * updating the qadaa ledger — which acknowledges everything up to now, so
 * the nudge counter restarts from the current salah.
 *
 * Monotonic via GREATEST — a backdated/offline-replayed write can never
 * rewind the waterline. Upserts so users without a ledger row still get
 * their waterline stamped (GREATEST treats a NULL waterline correctly).
 */
export async function acknowledgeQadaaWaterline(userId: string): Promise<void> {
  const [settings] = await db
    .select({ timezone: schema.prayerSettings.timezone })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, userId))
    .limit(1);
  const today = todayInTimezone(settings?.timezone);
  await db
    .insert(schema.qadaaLedger)
    .values({ userId, unloggedSeenThrough: today })
    .onConflictDoUpdate({
      target: schema.qadaaLedger.userId,
      set: {
        unloggedSeenThrough: sql`GREATEST(${schema.qadaaLedger.unloggedSeenThrough}, ${today})`,
      },
    });
}
