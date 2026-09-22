import "server-only";
import { and, eq, isNull, lte, or, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Hayd (menstruation) helpers. During a hayd period the prayer obligation is
 * lifted — check-ins are blocked server-side, the cron marks days `excused`,
 * and streaks treat them as neutral (never a miss, never assumed).
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

/**
 * Bulk variant for the cron: returns a Set of `${userId}:${date}` pairs that
 * are covered by a hayd period. One query for a whole batch of users/dates.
 */
export async function haydCoverage(userIds: string[], dates: string[]): Promise<Set<string>> {
  const covered = new Set<string>();
  if (userIds.length === 0 || dates.length === 0) return covered;
  const sorted = dates.slice().sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];
  // A period overlaps the window iff start <= maxDate && (no end || end >= minDate)
  const periods = await db
    .select({
      userId: schema.haydPeriods.userId,
      startDate: schema.haydPeriods.startDate,
      endDate: schema.haydPeriods.endDate,
    })
    .from(schema.haydPeriods)
    .where(
      and(
        inArray(schema.haydPeriods.userId, userIds),
        lte(schema.haydPeriods.startDate, maxDate),
        or(isNull(schema.haydPeriods.endDate), gte(schema.haydPeriods.endDate, minDate)),
      ),
    );
  for (const p of periods) {
    for (const d of dates) {
      if (d >= p.startDate && d <= (p.endDate ?? maxDate)) {
        covered.add(`${p.userId}:${d}`);
      }
    }
  }
  return covered;
}
