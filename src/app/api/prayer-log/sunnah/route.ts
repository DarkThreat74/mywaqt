import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { getSunnahsForMadhab, type FardPrayer } from "@/lib/prayer/sunnahs";
import { getCurrentMinutesInTimezone, parseMinutes, type PrayerTimings } from "@/lib/prayer/checkin";

export const dynamic = "force-dynamic";

// POST /api/prayer-log/sunnah — log or unlog a sunnah prayer
// Body: { date: "YYYY-MM-DD", sunnahKey: string, prayed: boolean }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("sunnah-log", ip, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { date, sunnahKey, prayed, _offlineTimestamp } = body as {
    date?: string;
    sunnahKey?: string;
    prayed?: boolean;
    _offlineTimestamp?: number;
  };

  if (!date || !sunnahKey) {
    return NextResponse.json({ error: "Date and sunnah key are required." }, { status: 400 });
  }

  // Validate date format
  const dateCheck = new Date(date + "T00:00:00");
  if (isNaN(dateCheck.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  // Get user's prayer settings (timezone + madhab)
  const [settings] = await db
    .select()
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);

  if (!settings) {
    return NextResponse.json({ error: "Prayer settings not configured." }, { status: 400 });
  }

  // Find the sunnah definition
  const sunnahs = getSunnahsForMadhab(settings.madhab);
  const sunnah = sunnahs.find((s) => s.key === sunnahKey);
  if (!sunnah) {
    return NextResponse.json({ error: "Invalid sunnah key." }, { status: 400 });
  }

  // If un-logging (prayed = false), allow it without checks
  if (prayed === false) {
    await db
      .delete(schema.sunnahLog)
      .where(
        and(
          eq(schema.sunnahLog.userId, session.userId),
          eq(schema.sunnahLog.date, date),
          eq(schema.sunnahLog.sunnahKey, sunnahKey),
        ),
      );
    return NextResponse.json({ ok: true, prayed: false });
  }

  // ── Algorithmic checks for logging (prayed = true) ──

  // 1. For "after" sunnahs: the associated fard must be logged as "prayed"
  // Also for Witr (standalone but requires Isha to be prayed first)
  // Nafls like Duha don't require any fard to be prayed first
  if (sunnah.position === "after" || (sunnah.position === "standalone" && sunnah.key === "witr")) {
    const [fardLog] = await db
      .select()
      .from(schema.prayerLog)
      .where(
        and(
          eq(schema.prayerLog.userId, session.userId),
          eq(schema.prayerLog.date, date),
          eq(schema.prayerLog.prayerName, sunnah.associatedFard as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"),
        ),
      )
      .limit(1);

    if (!fardLog || fardLog.status !== "prayed") {
      const fardLabel = sunnah.associatedFard.charAt(0).toUpperCase() + sunnah.associatedFard.slice(1);
      return NextResponse.json(
        { error: `You must log ${fardLabel} as prayed before logging this sunnah.` },
        { status: 403 },
      );
    }
  }

  // 2. Time-based checks:
  //    a. "before" sunnahs: fard time must have started
  //    b. Lock check: can't log after the next fard starts (window closed)
  //       EXCEPT Duha (user wants late Duha logging allowed)
  //    c. Witr special case: locks at Fajr (Isha window ends when Fajr starts)
  //
  //    Offline support: if _offlineTimestamp is present (from SW outbox sync),
  //    check the window against that time instead of current time.
  //    This ensures offline logs made during the window aren't rejected on sync.
  const [cache] = await db
    .select()
    .from(schema.prayerTimesCache)
    .where(
      and(
        eq(schema.prayerTimesCache.userId, session.userId),
        eq(schema.prayerTimesCache.date, date),
      ),
    )
    .limit(1);

  if (cache) {
    const timings: PrayerTimings = {
      fajr: cache.fajr,
      sunrise: cache.sunrise,
      dhuhr: cache.dhuhr,
      asr: cache.asr,
      maghrib: cache.maghrib,
      isha: cache.isha,
    };

    // Time-of-day checks only make sense for "today". A past date is being
    // backfilled (the fard check above already ran) — allow it. A future
    // date's window hasn't happened — block it outright.
    const todayInTz = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone });
    if (date > todayInTz) {
      return NextResponse.json(
        { error: "You can't log a sunnah for a future date." },
        { status: 403 },
      );
    }
    const isToday = date === todayInTz;

    // Use offline timestamp if present (outbox sync), otherwise current time
    const currentMinutes = _offlineTimestamp
      ? (() => {
          const d = new Date(_offlineTimestamp);
          const localStr = d.toLocaleString("en-US", { timeZone: settings.timezone, hour12: false });
          const match = localStr.match(/(\d+):(\d+)/);
          // hour12:false emits "24:MM" for midnight hour — normalize to 0
          return match ? (parseInt(match[1]) % 24) * 60 + parseInt(match[2]) : getCurrentMinutesInTimezone(settings.timezone);
        })()
      : getCurrentMinutesInTimezone(settings.timezone);

    const prayerMinutes: Record<FardPrayer, number> = {
      fajr: parseMinutes(timings.fajr),
      dhuhr: parseMinutes(timings.dhuhr),
      asr: parseMinutes(timings.asr),
      maghrib: parseMinutes(timings.maghrib),
      isha: parseMinutes(timings.isha),
    };

    // 2a. "before" sunnahs: the associated fard's time must have started
    if (isToday && sunnah.position === "before") {
      const fardStartMinutes = prayerMinutes[sunnah.associatedFard];
      if (currentMinutes < fardStartMinutes) {
        const fardLabel = sunnah.associatedFard.charAt(0).toUpperCase() + sunnah.associatedFard.slice(1);
        return NextResponse.json(
          { error: `${fardLabel} hasn't started yet — you can't log this sunnah until ${fardLabel} time comes in.` },
          { status: 403 },
        );
      }
    }

    // 2b. Lock check: can't log after the lock prayer starts (window closed)
    //     EXCEPT Duha — user wants late Duha logging allowed
    if (isToday && sunnah.locksAt && sunnah.key !== "duha") {
      const lockMinutes = prayerMinutes[sunnah.locksAt];
      // Witr locks at Fajr — Isha's window ends when Fajr starts
      // Special case: if current time is after midnight but before Fajr,
      // we're still in Isha's window so Witr should still be loggable
      if (sunnah.key === "witr" && sunnah.locksAt === "fajr") {
        if (currentMinutes >= lockMinutes && currentMinutes < prayerMinutes.isha) {
          return NextResponse.json(
            { error: "Witr can no longer be logged — Fajr has started." },
            { status: 403 },
          );
        }
      } else {
        // Normal case: locked when the next prayer starts
        if (currentMinutes >= lockMinutes) {
          const lockLabel = sunnah.locksAt.charAt(0).toUpperCase() + sunnah.locksAt.slice(1);
          return NextResponse.json(
            { error: `This sunnah can no longer be logged — ${lockLabel} has started.` },
            { status: 403 },
          );
        }
      }
    }
  }

  // Upsert sunnah log — atomic to survive retries/double-taps (the unique
  // index on (userId, date, sunnahKey) makes this a true upsert)
  const [entry] = await db
    .insert(schema.sunnahLog)
    .values({
      userId: session.userId,
      date,
      sunnahKey,
      associatedFard: sunnah.associatedFard as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
      prayed: true,
      loggedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.sunnahLog.userId, schema.sunnahLog.date, schema.sunnahLog.sunnahKey],
      set: { prayed: true, loggedAt: new Date() },
    })
    .returning();

  return NextResponse.json(entry, { status: 201 });
}

// GET /api/prayer-log/sunnah?date=YYYY-MM-DD — get all sunnah logs for a date
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  const logs = await db
    .select()
    .from(schema.sunnahLog)
    .where(
      and(
        eq(schema.sunnahLog.userId, session.userId),
        eq(schema.sunnahLog.date, date),
      ),
    );

  return NextResponse.json(logs);
}
