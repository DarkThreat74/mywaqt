import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Advance the "unlogged misses" waterline to now. Called whenever the user
 * deliberately engages — logging a prayer or updating the qadaa ledger —
 * which acknowledges everything marked up to this instant, so the nudge
 * counts misses recorded after this point (regardless of the prayer's date).
 *
 * Monotonic via GREATEST — an out-of-order write can never rewind the
 * waterline (GREATEST ignores NULL). Upserts so users without a ledger row
 * still get their waterline stamped.
 */
export async function acknowledgeQadaaWaterline(userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.qadaaLedger)
    .values({ userId, unloggedSeenThrough: now })
    .onConflictDoUpdate({
      target: schema.qadaaLedger.userId,
      set: {
        unloggedSeenThrough: sql`GREATEST(${schema.qadaaLedger.unloggedSeenThrough}, ${now})`,
      },
    });
}
