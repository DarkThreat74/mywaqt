import { eq, and, lt, gte, lte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import {
  packMonth,
  unpackMonth,
  type ArchiveLogRow,
  type ArchiveSourceRow,
} from "@/lib/prayer/archiveCodec";

/**
 * prayer_log hot/cold split.
 *
 * prayer_log keeps a rolling HOT_WINDOW_DAYS window — every existing read
 * path (check-in, range ≤180d, sunnah, qadaa, cron resolution) stays inside
 * it by design. Older rows are packed into prayer_log_archive: ONE row per
 * (user, month) whose payload is the fixed-layout blob from archiveCodec.ts
 * (bytea column; the driver maps it through "\\x<hex>" text).
 *
 * ~1KB per user-month vs ~150B × ~150 rows — roughly a 25-30× size cut while
 * retaining status, masjid flag, checkin stage, and both timestamps to the
 * minute for every prayer, every day, indefinitely.
 */

export const HOT_WINDOW_DAYS = 200;
export { packMonth, unpackMonth };
export type { ArchiveLogRow };

/** First day (YYYY-MM-01) of the month `HOT_WINDOW_DAYS` ago — archive cutoff. */
export function archiveCutoffDate(): string {
  const d = new Date(Date.now() - HOT_WINDOW_DAYS * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Archive prayer_log rows older than the hot window, grouped by user+month.
 * `userIds` is one chunk (caller batches). Idempotent — archive upserts and
 * only deletes a user's hot rows after ALL their months are packed.
 * Returns rows archived.
 */
export async function archivePrayerLogsForUsers(
  userIds: string[],
  cutoffDate: string,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = await db
    .select({
      userId: schema.prayerLog.userId,
      date: schema.prayerLog.date,
      prayerName: schema.prayerLog.prayerName,
      status: schema.prayerLog.status,
      wentToMasjid: schema.prayerLog.wentToMasjid,
      markedAt: schema.prayerLog.markedAt,
      lastCheckinAt: schema.prayerLog.lastCheckinAt,
      checkinStage: schema.prayerLog.checkinStage,
    })
    .from(schema.prayerLog)
    .where(and(inArray(schema.prayerLog.userId, userIds), lt(schema.prayerLog.date, cutoffDate)));
  if (rows.length === 0) return 0;

  const byUserMonth = new Map<string, Map<string, ArchiveSourceRow[]>>();
  for (const r of rows as ArchiveSourceRow[]) {
    const month = String(r.date).slice(0, 7);
    let um = byUserMonth.get(r.userId);
    if (!um) { um = new Map(); byUserMonth.set(r.userId, um); }
    const list = um.get(month) || [];
    list.push(r);
    um.set(month, list);
  }

  let archived = 0;
  for (const [userId, months] of byUserMonth) {
    for (const [mk, monthRows] of months) {
      const [y, m] = mk.split("-").map(Number);
      const payload = packMonth(monthRows, y, m);
      await db
        .insert(schema.prayerLogArchive)
        .values({ userId, month: mk, payload })
        .onConflictDoUpdate({
          target: [schema.prayerLogArchive.userId, schema.prayerLogArchive.month],
          set: { payload },
        });
      archived += monthRows.length;
    }
    await db
      .delete(schema.prayerLog)
      .where(and(eq(schema.prayerLog.userId, userId), lt(schema.prayerLog.date, cutoffDate)));
  }
  return archived;
}

/**
 * Read prayer logs across the hot/cold boundary. Returns rows in the shape
 * analytics consumes — `id` is intentionally absent (archived rows can't
 * reconstruct uuids; no caller uses it).
 */
export async function fetchPrayerLogsRange(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<ArchiveLogRow & { userId: string }>> {
  const cutoff = archiveCutoffDate();
  // Archive only holds COMPLETE months before the cutoff month, so the
  // effective archive range ends the day before the cutoff date.
  const archiveTo = toDate < cutoff ? toDate : (() => {
    const d = new Date(cutoff + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [hot, archiveMonths] = await Promise.all([
    db
      .select({
        date: schema.prayerLog.date,
        prayerName: schema.prayerLog.prayerName,
        status: schema.prayerLog.status,
        wentToMasjid: schema.prayerLog.wentToMasjid,
        markedAt: schema.prayerLog.markedAt,
        // lastCheckinAt/checkinStage unused by the only reader (analytics) —
        // leaving them out trims the 365d+ row set the API ships per call.
      })
      .from(schema.prayerLog)
      .where(and(eq(schema.prayerLog.userId, userId), gte(schema.prayerLog.date, fromDate), lte(schema.prayerLog.date, toDate))),
    fromDate < cutoff
      ? db
          .select({ month: schema.prayerLogArchive.month, payload: schema.prayerLogArchive.payload })
          .from(schema.prayerLogArchive)
          .where(and(eq(schema.prayerLogArchive.userId, userId), lt(schema.prayerLogArchive.month, cutoff.slice(0, 7))))
      : Promise.resolve([] as Array<{ month: string; payload: Buffer }>),
  ]);

  const out: Array<ArchiveLogRow & { userId: string }> = hot.map((r) => ({
    ...r, lastCheckinAt: null, checkinStage: null, userId,
  }));
  for (const a of archiveMonths) {
    const [y, m] = a.month.split("-").map(Number);
    for (const row of unpackMonth(a.payload, y, m)) {
      if (row.date >= fromDate && row.date <= archiveTo) out.push({ ...row, userId });
    }
  }
  return out;
}
