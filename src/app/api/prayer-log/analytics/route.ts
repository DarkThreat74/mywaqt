import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { calculateStreak, calculateBestStreak } from "@/lib/prayer/checkin";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

type Range = "weekly" | "monthly" | "yearly" | "all-time";

function getRangeStart(range: Range, timezone: string): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });

  if (range === "all-time") {
    return "1970-01-01";
  }

  if (range === "weekly") {
    // Find the most recent Sunday in the user's timezone
    const parts = todayStr.split("-").map(Number);
    const localMidnight = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayOfWeek = localMidnight.getDay(); // 0 = Sunday
    const sunday = new Date(localMidnight);
    sunday.setDate(sunday.getDate() - dayOfWeek);
    return sunday.toISOString().split("T")[0];
  }

  if (range === "monthly") {
    // First day of current month
    const parts = todayStr.split("-").map(Number);
    return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-01`;
  }

  // yearly
  const parts = todayStr.split("-").map(Number);
  return `${parts[0]}-01-01`;
}

// GET /api/prayer-log/analytics?range=weekly|monthly|yearly|all-time
// Default range is "weekly" (current week starting Sunday).
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's prayer settings for timezone + madhab
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone, madhab: schema.prayerSettings.madhab })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);

    const timezone = settings?.timezone || "America/Chicago";

    // Parse range param
    const { searchParams } = new URL(request.url);
    const rawRange = searchParams.get("range") || "weekly";
    const range: Range = (["weekly", "monthly", "yearly", "all-time"].includes(rawRange)
      ? rawRange
      : "weekly") as Range;

    const rangeStart = getRangeStart(range, timezone);
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

    // ── Fetch logs ──
    // For streak calculation we always need 90 days of data regardless of range.
    // For per-prayer analytics we filter to the selected range.
    // For the heatmap we need 365 days.
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const streakFromDate = ninetyDaysAgo.toISOString().split("T")[0];

    // For the heatmap, fetch a full year of data
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const heatmapFromDate = yearAgo.toISOString().split("T")[0];

    // Use the earliest of all date filters for the DB query
    const dbFromDate = [rangeStart, streakFromDate, heatmapFromDate].sort()[0];

    const allLogs = await db
      .select({
        id: schema.prayerLog.id,
        date: schema.prayerLog.date,
        prayerName: schema.prayerLog.prayerName,
        status: schema.prayerLog.status,
        wentToMasjid: schema.prayerLog.wentToMasjid,
        markedAt: schema.prayerLog.markedAt,
      })
      .from(schema.prayerLog)
      .where(
        and(
          eq(schema.prayerLog.userId, session.userId),
          gte(schema.prayerLog.date, dbFromDate),
        ),
      )
      .limit(10000);

    // Fetch cached prayer times covering the full DB range
    const prayerTimesRows = await db
      .select()
      .from(schema.prayerTimesCache)
      .where(
        and(
          eq(schema.prayerTimesCache.userId, session.userId),
          gte(schema.prayerTimesCache.date, dbFromDate),
        ),
      );

    // Build a map: date -> { fajr, sunrise, dhuhr, asr, maghrib, isha } in minutes-from-midnight
    const prayerTimesByDate = new Map<string, Record<string, number>>();
    for (const row of prayerTimesRows) {
      const dateStr = typeof row.date === "string" ? row.date : String(row.date);
      const parseTime = (t: string | Date): number => {
        const s = typeof t === "string" ? t : t.toISOString();
        const match = s.match(/(\d+):(\d+)/);
        return match ? parseInt(match[1]) * 60 + parseInt(match[2]) : -1;
      };
      prayerTimesByDate.set(dateStr, {
        fajr: parseTime(row.fajr),
        sunrise: parseTime(row.sunrise),
        dhuhr: parseTime(row.dhuhr),
        asr: parseTime(row.asr),
        maghrib: parseTime(row.maghrib),
        isha: parseTime(row.isha),
      });
    }

    // ── Streak (always uses 90-day window) ──
    const logsByDate = new Map<string, Array<{ status: string }>>();
    for (const log of allLogs) {
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      if (!logsByDate.has(dateStr)) logsByDate.set(dateStr, []);
      logsByDate.get(dateStr)!.push({ status: log.status });
    }
    const streak = calculateStreak(logsByDate, todayStr);

    // ── Filter logs to the selected range for analytics ──
    const rangeLogs = allLogs.filter((l) => {
      const dateStr = typeof l.date === "string" ? l.date : String(l.date);
      return dateStr >= rangeStart && dateStr <= todayStr;
    });

    // ── Range-specific counts ──
    // "This Week" = current calendar week (Sunday to today) in user's timezone.
    // "This Month" = current calendar month in user's timezone.
    let thisWeekPrayed = 0;
    let thisMonthPrayed = 0;
    let lastPrayedDate: string | null = null;

    // Get current date parts in the user's timezone
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const tzVals: Record<string, string> = {};
    for (const p of tzParts) { if (p.type !== "literal") tzVals[p.type] = p.value; }
    const tzYear = parseInt(tzVals.year);
    const tzMonth = parseInt(tzVals.month);
    const tzDay = parseInt(tzVals.day);

    // Day of week (0=Sunday) — construct a UTC date from the tz date parts
    const tzDateObj = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay));
    const dayOfWeek = tzDateObj.getUTCDay(); // 0=Sunday
    // Start of week = today - dayOfWeek days (Sunday)
    const weekStartDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay - dayOfWeek));
    const weekStartStr = weekStartDate.toISOString().split("T")[0];
    // Start of month in user's timezone
    const monthStartStr = `${tzYear}-${String(tzMonth).padStart(2, "0")}-01`;

    for (const log of allLogs) {
      if (log.status === "prayed" || log.status === "assumed_prayed") {
        const dateStr = typeof log.date === "string" ? log.date : String(log.date);
        if (dateStr >= weekStartStr && dateStr <= todayStr) thisWeekPrayed++;
        if (dateStr >= monthStartStr && dateStr <= todayStr) thisMonthPrayed++;
        if (!lastPrayedDate || dateStr > lastPrayedDate) lastPrayedDate = dateStr;
      }
    }

    // ── Active days (denominator for consistency) ──
    let activeDays: number;
    if (range === "all-time") {
      // Use days from first log to today
      if (rangeLogs.length === 0) {
        activeDays = 1;
      } else {
        const sortedDates = rangeLogs
          .map((l) => (typeof l.date === "string" ? l.date : String(l.date)))
          .sort();
        const firstDate = new Date(sortedDates[0] + "T00:00:00");
        const todayDate = new Date(todayStr + "T00:00:00");
        activeDays = Math.max(1, Math.round((todayDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      }
    } else {
      // Days from rangeStart to today
      const start = new Date(rangeStart + "T00:00:00");
      const today = new Date(todayStr + "T00:00:00");
      activeDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    }

    // ── Per-prayer analytics ──
    const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

    const perPrayer = prayers.map((prayer) => {
      const prayerLogs = rangeLogs.filter((l) => l.prayerName === prayer);
      const prayedLogs = prayerLogs.filter((l) => l.status === "prayed" || l.status === "assumed_prayed");
      const totalDays = prayedLogs.length;
      const masjidCount = prayedLogs.filter((l) => l.wentToMasjid === true).length;

      // Calculate window-percentage for each check-in.
      // windowPct = (markedMinutes - prayerStart) / (windowEnd - prayerStart) * 100
      // This is season-independent: 0% = prayed right at start, 100% = prayed at last moment.
      const windowPcts: number[] = [];
      let onTimeCount = 0;  // prayed in first 50% of window
      let lateCount = 0;    // prayed in last 50% of window

      for (const log of prayedLogs) {
        if (!log.markedAt) continue;
        const marked = new Date(log.markedAt);
        const localStr = marked.toLocaleString("en-US", { timeZone: timezone, hour12: false });
        const match = localStr.match(/(\d+):(\d+)/);
        if (!match) continue;
        const markedMinutes = (parseInt(match[1]) % 24) * 60 + parseInt(match[2]);

        const dateStr = typeof log.date === "string" ? log.date : String(log.date);
        const times = prayerTimesByDate.get(dateStr);
        if (!times) continue;

        const prayerStart = times[prayer];
        if (prayerStart < 0) continue;

        // Window end per prayer
        let windowEnd: number;
        switch (prayer) {
          case "fajr":
            windowEnd = times.sunrise >= 0 ? times.sunrise : prayerStart + 120;
            break;
          case "dhuhr":
            windowEnd = times.asr >= 0 ? times.asr : prayerStart + 300;
            break;
          case "asr":
            windowEnd = times.maghrib >= 0 ? times.maghrib : prayerStart + 240;
            break;
          case "maghrib":
            windowEnd = times.isha >= 0 ? times.isha : prayerStart + 90;
            break;
          case "isha":
            // Isha's window runs until NEXT day's Fajr — it crosses midnight.
            // Represented as >1440 so post-midnight marks stay in-window.
            windowEnd = times.fajr >= 0 ? times.fajr + 1440 : prayerStart + 360;
            break;
          default:
            windowEnd = prayerStart + 120;
        }

        // Allow 15-min grace before start
        const windowStart = prayerStart - 15;
        const windowDuration = windowEnd - windowStart;
        if (windowDuration <= 0) continue;

        // Normalize the marked time onto the window's timeline: a mark before
        // window start may be a post-midnight mark of a window that began the
        // previous evening (Isha) — shift it +1440 before comparing.
        const markedAdj = markedMinutes >= windowStart ? markedMinutes : markedMinutes + 1440;
        const inWindow = markedAdj >= windowStart && markedAdj <= windowEnd;

        if (!inWindow) continue;

        // Calculate percentage within the window
        const elapsed = markedAdj - windowStart;
        const pct = (elapsed / windowDuration) * 100;
        const clampedPct = Math.max(0, Math.min(100, pct));
        windowPcts.push(clampedPct);

        // Classify on-time vs late (50% threshold)
        if (clampedPct <= 50) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      }

      const avgWindowPct = windowPcts.length > 0
        ? Math.round(windowPcts.reduce((a, b) => a + b, 0) / windowPcts.length)
        : null;

      return {
        prayer,
        totalPrayed: totalDays,
        masjidCount,
        masjidPct: totalDays > 0 ? Math.round((masjidCount / totalDays) * 100) : 0,
        avgWindowPct,
        consistencyPct: activeDays > 0 ? Math.min(100, Math.round((totalDays / activeDays) * 100)) : 0,
        onTimeCount,
        lateCount,
        onTimePct: totalDays > 0 ? Math.round((onTimeCount / totalDays) * 100) : 0,
      };
    });

    // ── Overall stats (range-scoped) ──
    const totalPrayed = rangeLogs.filter((l) => l.status === "prayed" || l.status === "assumed_prayed").length;
    const totalMasjid = rangeLogs.filter((l) => l.wentToMasjid === true).length;

    // Days with all 5 prayers (range-scoped)
    const completeDays = new Set<string>();
    const prayedByDate = new Map<string, Set<string>>();
    for (const log of rangeLogs) {
      if (log.status === "prayed" || log.status === "assumed_prayed") {
        const dateStr = typeof log.date === "string" ? log.date : String(log.date);
        if (!prayedByDate.has(dateStr)) prayedByDate.set(dateStr, new Set());
        prayedByDate.get(dateStr)!.add(log.prayerName);
        if (prayedByDate.get(dateStr)!.size === 5) {
          completeDays.add(dateStr);
        }
      }
    }

    // ── Today's prayer times for equivalent-time display ──
    const todayTimes = prayerTimesByDate.get(todayStr) || null;

    // ── Best streak (historical) ──
    const bestStreak = calculateBestStreak(logsByDate, todayStr);

    // ── Day-of-week breakdown ──
    // For each day of week (0=Sunday..6=Saturday), count how many prayers were prayed
    // vs how many prayers were expected (activeDays * 5), to get a consistency rate per weekday.
    // IMPORTANT: both counts use the SAME date range (rangeStart to today) to avoid
    // the >100% bug where totalPrayed spanned all-time but activeDays only spanned the range.
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeekStats = Array.from({ length: 7 }, (_, i) => ({
      day: dayNames[i],
      dayIndex: i,
      totalPrayed: 0,
      activeDays: 0,
      consistencyPct: 0,
    }));

    // Build a set of all dates within the range that have any logs (active days)
    const rangeActiveDates = new Set<string>();
    for (const log of rangeLogs) {
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      rangeActiveDates.add(dateStr);
    }

    // Count prayed prayers per day of week (within the selected range only)
    for (const log of rangeLogs) {
      if (log.status !== "prayed" && log.status !== "assumed_prayed") continue;
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      const dateObj = new Date(dateStr + "T00:00:00");
      const dow = dateObj.getDay();
      dayOfWeekStats[dow].totalPrayed++;
    }

    // Count active days per day of week (within the range)
    for (const dateStr of rangeActiveDates) {
      const dateObj = new Date(dateStr + "T00:00:00");
      const dow = dateObj.getDay();
      dayOfWeekStats[dow].activeDays++;
    }

    // Calculate consistency per day of week
    // consistencyPct = prayed prayers / (activeDays * 5) * 100, clamped to 100
    for (const stat of dayOfWeekStats) {
      const expected = stat.activeDays * 5;
      const rawPct = expected > 0 ? Math.round((stat.totalPrayed / expected) * 100) : 0;
      stat.consistencyPct = Math.min(100, Math.max(0, rawPct));
    }

    // ── Total prayed all-time ──
    const totalPrayedAllTime = allLogs.filter(
      (l) => l.status === "prayed" || l.status === "assumed_prayed",
    ).length;

    // ── Average prayers per day (within range) ──
    const avgPrayersPerDay = activeDays > 0 ? Math.round((totalPrayed / activeDays) * 10) / 10 : 0;

    // ── Most consistent / most missed prayer ──
    const sortedByConsistency = [...perPrayer].sort((a, b) => b.consistencyPct - a.consistencyPct);
    const mostConsistentPrayer = sortedByConsistency[0]?.prayer || null;
    const mostMissedPrayer = sortedByConsistency[sortedByConsistency.length - 1]?.prayer || null;

    // ── Heatmap data: daily prayer counts for the last 365 days ──
    // Map: dateStr -> number of prayers prayed (0-5)
    const heatmapData: Record<string, number> = {};
    for (const log of allLogs) {
      if (log.status !== "prayed" && log.status !== "assumed_prayed") continue;
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      heatmapData[dateStr] = (heatmapData[dateStr] || 0) + 1;
    }

    return NextResponse.json({
      streak,
      bestStreak,
      range,
      rangeStart,
      totalCompleteDays: completeDays.size,
      totalPrayed,
      totalMasjid,
      masjidPct: totalPrayed > 0 ? Math.round((totalMasjid / totalPrayed) * 100) : 0,
      perPrayer,
      timezone,
      madhab: settings?.madhab || "standard",
      thisWeekPrayed,
      thisMonthPrayed,
      lastPrayedDate,
      totalPrayedAllTime,
      avgPrayersPerDay,
      mostConsistentPrayer,
      mostMissedPrayer,
      dayOfWeekStats,
      heatmapData,
      todayPrayerTimes: todayTimes
        ? {
            fajr: todayTimes.fajr,
            sunrise: todayTimes.sunrise,
            dhuhr: todayTimes.dhuhr,
            asr: todayTimes.asr,
            maghrib: todayTimes.maghrib,
            isha: todayTimes.isha,
          }
        : null,
    });
  } catch (err) {
    logError(err, { route: "prayer-log/analytics" });
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
}
