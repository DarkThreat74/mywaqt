import { NextRequest, NextResponse, after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { fetchMonthPrayerTimes, parseTime } from "@/lib/aladhan/client";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST — save prayer settings (location, timezone, calculation method)
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("onboarding-settings", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { latitude, longitude, timezone, calculationMethod, madhab, gender, haydTracking } = body as {
    latitude?: string;
    longitude?: string;
    timezone?: string;
    calculationMethod?: number;
    madhab?: string;
    gender?: string;
    haydTracking?: boolean;
  };

  if (!latitude || !longitude || !timezone) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  // Validate coordinates
  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return NextResponse.json({ error: "Invalid latitude." }, { status: 400 });
  }
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    return NextResponse.json({ error: "Invalid longitude." }, { status: 400 });
  }
  if (timezone.length > 100) {
    return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
  }

  // Validate timezone is a valid IANA timezone string
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
  }

  // Validate calculation method (AlAdhan method IDs)
  const validMethods = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const method = calculationMethod && validMethods.includes(calculationMethod) ? calculationMethod : 2;

  // Validate madhab
  const validMadhabs = ["standard", "hanafi"];
  const madhabVal = madhab && validMadhabs.includes(madhab) ? madhab : "standard";

  // Gender is optional (legacy flows) but restricted to two values when present
  const genderVal = gender === "male" || gender === "female" ? gender : null;
  const haydVal = genderVal === "female" && haydTracking === true;

  // Upsert prayer settings
  const [existing] = await db
    .select()
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);

  if (existing) {
    await db
      .update(schema.prayerSettings)
      .set({ latitude, longitude, timezone, calculationMethod: method, madhab: madhabVal, ...(genderVal ? { gender: genderVal, haydTracking: haydVal } : {}), updatedAt: new Date() })
      .where(eq(schema.prayerSettings.userId, session.userId));
  } else {
    await db.insert(schema.prayerSettings).values({
      userId: session.userId,
      latitude,
      longitude,
      timezone,
      calculationMethod: method,
      madhab: madhabVal,
      gender: genderVal,
      haydTracking: haydVal,
    });
  }

  // Re-fetch prayer times from AlAdhan immediately after settings change,
  // so the user sees correct times without waiting for the next cron run.
  after(async () => {
    try {
      const tz = timezone || "UTC";
      const nowInTz = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const [yearStr, monthStr] = nowInTz.split("-");
      const month = parseInt(monthStr);
      const year = parseInt(yearStr);

      const days = await fetchMonthPrayerTimes(
        latNum,
        lngNum,
        month,
        year,
        method,
        madhabVal === "hanafi" ? 1 : 0,
        tz,
      );

      const values = days.map((day) => {
        const dateStr = day.date.gregorian.date;
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
          imsak: timings.Imsak ? parseTime(timings.Imsak) : null,
          firstThird: timings.Firstthird ? parseTime(timings.Firstthird) : null,
          lastThird: timings.Lastthird ? parseTime(timings.Lastthird) : null,
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
            imsak: sql.raw("excluded.imsak"),
            firstThird: sql.raw("excluded.first_third"),
            lastThird: sql.raw("excluded.last_third"),
            fetchedAt: new Date(),
          },
        });
    } catch (err) {
      logError(err, { route: "onboarding/save-settings:resync" });
    }
  });

  return NextResponse.json({ ok: true, calculationMethod: method, madhab: madhabVal });
}
