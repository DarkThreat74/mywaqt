import "server-only";
import { and, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Hayd (menstruation): during a period the prayer obligation is lifted.
 * The UI hides check-in controls on covered days; this is the cheap
 * server-side backstop so an offline-queued check-in can't slip through.
 */

/** True if `date` (YYYY-MM-DD) falls inside any hayd period for the user. */
export async function isHaydDay(userId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.haydPeriods.id })
    .from(schema.haydPeriods)
    .where(
      and(
        eq(schema.haydPeriods.userId, userId),
        lte(schema.haydPeriods.startDate, date),
        or(isNull(schema.haydPeriods.endDate), gte(schema.haydPeriods.endDate, date)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
