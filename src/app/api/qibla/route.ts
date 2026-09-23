import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { calculateQiblaBearing, calculateDistance, bearingToCardinal } from "@/lib/prayer/qibla";
import { logError } from "@/lib/logError";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/qibla
 * Returns the Qibla bearing, distance, and cardinal direction from the user's
 * saved location (prayer_settings.latitude/longitude).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("qibla", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const [settings] = await db
      .select({
        latitude: schema.prayerSettings.latitude,
        longitude: schema.prayerSettings.longitude,
      })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);

    if (!settings || !settings.latitude || !settings.longitude) {
      return NextResponse.json(
        { error: "Location not set. Please set your location in Settings first." },
        { status: 400 },
      );
    }

    const lat = parseFloat(settings.latitude);
    const lng = parseFloat(settings.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return NextResponse.json({ error: "Invalid location data." }, { status: 400 });
    }

    const bearing = calculateQiblaBearing(lat, lng);
    const distance = calculateDistance(lat, lng);
    const cardinal = bearingToCardinal(bearing);

    return NextResponse.json({
      bearing: Math.round(bearing),
      distance,
      cardinal,
      userLocation: { latitude: lat, longitude: lng },
    });
  } catch (err) {
    logError(err, { route: "qibla GET" });
    return NextResponse.json({ error: "Failed to calculate Qibla direction." }, { status: 500 });
  }
}
