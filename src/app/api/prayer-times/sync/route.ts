import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { fetchMonthPrayerTimes, parseTime } from "@/lib/aladhan/client";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/prayer-times/sync — fetch and cache current month's prayer times
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 syncs per hour per IP (sync fetches a whole month from AlAdhan)
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-times-sync", ip, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many sync requests." }, { status: 429 });
  }

  // Get user's prayer settings (location only — not privacy flags)
  const [settings] = await db
    .select({
      latitude: schema.prayerSettings.latitude,
      longitude: schema.prayerSettings.longitude,
      timezone: schema.prayerSettings.timezone,
      calculationMethod: schema.prayerSettings.calculationMethod,
      madhab: schema.prayerSettings.madhab,
    })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);

  if (!settings) {
    return NextResponse.json(
      { error: "No location set. Complete onboarding first." },
      { status: 400 },
    );
  }

  // Compute current month/year in the user's timezone, not server UTC.
  // This prevents wrong-month fetches at timezone boundaries.
  const tz = settings.timezone || "UTC";
  const nowInTz = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [yearStr, monthStr] = nowInTz.split("-");
  const month = parseInt(monthStr);
  const year = parseInt(yearStr);

  // Validate coordinates before calling AlAdhan
  const latNum = parseFloat(settings.latitude);
  const lngNum = parseFloat(settings.longitude);
  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return NextResponse.json(
      { error: "Invalid coordinates. Please update your location in settings." },
      { status: 400 },
    );
  }

  try {
    const days = await fetchMonthPrayerTimes(
      latNum,
      lngNum,
      month,
      year,
      settings.calculationMethod,
      settings.madhab === "hanafi" ? 1 : 0,
      tz,
    );

    // Batch upsert — single query instead of N+1 select+insert per day
    const values = days.map((day) => {
      const dateStr = day.date.gregorian.date; // "DD-MM-YYYY"
      const [dayNum, monthNum, yearNum] = dateStr.split("-").map(Number);
      const isoDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const timings = day.timings;
      return {
        userId: session.userId,
        date: isoDate,
        fajr: parseTime(timings.Fajr),
        sunrise: parseTime(timings.Sunrise),
        dhuhr: parseTime(timings.Dhuhr),
        asr: parseTime(timings.Asr),
        maghrib: parseTime(timings.Maghrib),
        isha: parseTime(timings.Isha),
      };
    });

    await db
      .insert(schema.prayerTimesCache)
      .values(values)
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

    return NextResponse.json({ ok: true, daysCached: days.length });
  } catch (err) {
    logError(err, { route: "prayer-times/sync" });
    return NextResponse.json(
      { error: "Could not fetch prayer times. Please try again later." },
      { status: 502 },
    );
  }
}
