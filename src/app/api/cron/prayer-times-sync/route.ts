import { NextRequest, NextResponse } from "next/server";
import { sql, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { verifyCronAuth } from "@/lib/cronAuth";
import { fetchMonthPrayerTimes, parseTime } from "@/lib/aladhan/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/cron/prayer-times-sync — monthly, re-fetches prayer times for all users
//
// ─── Scalability for 100k+ users ───
// 1. LOCATION DEDUP: Users sharing the same (lat,lng,method,madhab,month,year)
//    share a single AlAdhan API call. 100k users → ~1k unique locations.
// 2. STALENESS CHECK: Only fetch users missing cache rows for their current month.
//    Queries prayer_times_cache instead of comparing month strings.
// 3. CONCURRENCY: 10 parallel AlAdhan calls (within AlAdhan's ~14 req/s limit).

const SYNC_BATCH_SIZE = 500;
const ALADHAN_CONCURRENCY = 10;

// Round coordinates to ~1km precision for deduplication.
// 0.01 degrees ≈ 1.1 km at the equator. This groups users in the same
// neighborhood/masjid into one AlAdhan call.
function roundCoord(lat: string, lng: string): string {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return "";
  return `${latNum.toFixed(2)},${lngNum.toFixed(2)}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get("authorization"), request.headers.get("x-vercel-cron") === "1")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all prayer settings
  const allSettings = await db
    .select({
      userId: schema.prayerSettings.userId,
      latitude: schema.prayerSettings.latitude,
      longitude: schema.prayerSettings.longitude,
      calculationMethod: schema.prayerSettings.calculationMethod,
      madhab: schema.prayerSettings.madhab,
      timezone: schema.prayerSettings.timezone,
    })
    .from(schema.prayerSettings);

  if (allSettings.length === 0) {
    return NextResponse.json({ ok: true, success: 0, failed: 0, skipped: "no users" });
  }

  // Compute each user's current month in their timezone
  const userMonths = new Map<string, { year: number; month: number; monthStart: string }>();
  for (const s of allSettings) {
    const tz = s.timezone || "UTC";
    const nowInTz = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const [yearStr, monthStr] = nowInTz.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    userMonths.set(s.userId, { year, month, monthStart: `${yearStr}-${monthStr}-01` });
  }

  // ── STALENESS CHECK: Find users who DON'T have cache rows for their current month ──
  // Collect all unique month-start dates we need to check
  const allMonthStarts = new Set<string>();
  for (const [, info] of userMonths) allMonthStarts.add(info.monthStart);

  // Query distinct (userId, monthStart) pairs that already exist in cache
  // by checking for rows with date >= monthStart AND date < next month
  const existingCacheUsers = new Set<string>();
  for (const monthStart of allMonthStarts) {
    const [yearStr, monthStr] = monthStart.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    // Next month start
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

    // Get users who already have at least one row in this month range
    const cached = await db
      .select({ userId: schema.prayerTimesCache.userId })
      .from(schema.prayerTimesCache)
      .where(
        and(
          sql`${schema.prayerTimesCache.date} >= ${monthStart}`,
          sql`${schema.prayerTimesCache.date} < ${nextMonthStart}`,
        ),
      )
      .groupBy(schema.prayerTimesCache.userId);

    for (const row of cached) {
      if (row.userId) existingCacheUsers.add(row.userId);
    }
  }

  // Only sync users who are missing cache rows for their current month
  const staleSettings = allSettings.filter((s) => !existingCacheUsers.has(s.userId));

  if (staleSettings.length === 0) {
    return NextResponse.json({ ok: true, success: 0, failed: 0, skipped: "all up to date", totalUsers: allSettings.length });
  }

  // ── LOCATION DEDUPLICATION ──
  // Group stale users by (rounded lat,lng, method, madhab, month, year)
  // Users in the same location share a single AlAdhan API call.
  const locationGroups = new Map<string, {
    lat: number;
    lng: number;
    method: number;
    school: 0 | 1;
    month: number;
    year: number;
    timezone: string;
    userIds: string[];
  }>();

  for (const s of staleSettings) {
    const latNum = parseFloat(s.latitude);
    const lngNum = parseFloat(s.longitude);
    if (isNaN(latNum) || isNaN(lngNum)) continue;

    const monthInfo = userMonths.get(s.userId);
    if (!monthInfo) continue;

    const dedupKey = `${roundCoord(s.latitude, s.longitude)}|${s.calculationMethod}|${s.madhab}|${monthInfo.year}-${monthInfo.month}`;

    const existing = locationGroups.get(dedupKey);
    if (existing) {
      existing.userIds.push(s.userId);
    } else {
      locationGroups.set(dedupKey, {
        lat: latNum,
        lng: lngNum,
        method: s.calculationMethod,
        school: s.madhab === "hanafi" ? 1 : 0,
        month: monthInfo.month,
        year: monthInfo.year,
        timezone: s.timezone || "UTC",
        userIds: [s.userId],
      });
    }
  }

  const uniqueLocations = Array.from(locationGroups.values());
  let successCount = 0;
  let failCount = 0;
  const apiCallsSaved = staleSettings.length - uniqueLocations.length;

  // Process unique locations in batches with concurrency limit
  for (let batchStart = 0; batchStart < uniqueLocations.length; batchStart += SYNC_BATCH_SIZE) {
    const batch = uniqueLocations.slice(batchStart, batchStart + SYNC_BATCH_SIZE);

    // Process with concurrency limit
    for (let i = 0; i < batch.length; i += ALADHAN_CONCURRENCY) {
      const chunk = batch.slice(i, i + ALADHAN_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (loc) => {
          const days = await fetchMonthPrayerTimes(
            loc.lat,
            loc.lng,
            loc.month,
            loc.year,
            loc.method,
            loc.school,
            loc.timezone,
          );

          // Build cache values for ALL users sharing this location
          const allValues: Array<{
            userId: string;
            date: string;
            fajr: string;
            sunrise: string;
            dhuhr: string;
            asr: string;
            maghrib: string;
            isha: string;
          }> = [];

          for (const day of days) {
            const dateStr = day.date.gregorian.date;
            const [dayNum, monthNum, yearNum] = dateStr.split("-").map(Number);
            const isoDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const timings = day.timings;

            for (const userId of loc.userIds) {
              allValues.push({
                userId,
                date: isoDate,
                fajr: parseTime(timings.Fajr),
                sunrise: parseTime(timings.Sunrise),
                dhuhr: parseTime(timings.Dhuhr),
                asr: parseTime(timings.Asr),
                maghrib: parseTime(timings.Maghrib),
                isha: parseTime(timings.Isha),
              });
            }
          }

          // Batch insert for all users sharing this location
          // Insert in chunks of 500 to avoid parameter limits
          for (let v = 0; v < allValues.length; v += 500) {
            const valuesChunk = allValues.slice(v, v + 500);
            await db
              .insert(schema.prayerTimesCache)
              .values(valuesChunk)
              .onConflictDoUpdate({
                target: [schema.prayerTimesCache.userId, schema.prayerTimesCache.date],
                set: {
                  fajr: sql.raw("excluded.fajr"),
                  sunrise: sql.raw("excluded.sunrise"),
                  dhuhr: sql.raw("excluded.dhuhr"),
                  asr: sql.raw("excluded.asr"),
                  maghrib: sql.raw("excluded.maghrib"),
                  isha: sql.raw("excluded.isha"),
                  fetchedAt: new Date(),
                },
              });
          }
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") successCount++;
        else failCount++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    success: successCount,
    failed: failCount,
    totalUsers: allSettings.length,
    staleUsers: staleSettings.length,
    uniqueLocations: uniqueLocations.length,
    apiCallsSaved,
  });
}
