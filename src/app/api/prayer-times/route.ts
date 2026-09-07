import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/prayer-times?date=YYYY-MM-DD — get cached prayer times for a day
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 60 reads per minute per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-times-read", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  if (!dateStr) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  // Check if user has location set (parallel with cache lookup)
  const [settingsResult, cachedResult] = await Promise.all([
    db
      .select({ latitude: schema.prayerSettings.latitude, madhab: schema.prayerSettings.madhab, timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1),
    db
      .select({
        fajr: schema.prayerTimesCache.fajr,
        sunrise: schema.prayerTimesCache.sunrise,
        dhuhr: schema.prayerTimesCache.dhuhr,
        asr: schema.prayerTimesCache.asr,
        maghrib: schema.prayerTimesCache.maghrib,
        isha: schema.prayerTimesCache.isha,
      })
      .from(schema.prayerTimesCache)
      .where(
        and(
          eq(schema.prayerTimesCache.userId, session.userId),
          eq(schema.prayerTimesCache.date, dateStr),
        ),
      )
      .limit(1),
  ]);

  const settings = settingsResult[0];
  const cached = cachedResult[0];
  const locationSet = !!(settings?.latitude);

  if (!cached) {
    return NextResponse.json(
      { error: "No prayer times cached for this date. Sync first.", locationSet },
      { status: 404 },
    );
  }

  return NextResponse.json({ ...cached, madhab: settings?.madhab || "standard", timezone: settings?.timezone || null, locationSet: true });
}
