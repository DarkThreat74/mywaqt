import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/public/[token]/prayer-times?date=YYYY-MM-DD
// Public, read-only. Returns cached prayer times for the token owner.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // Rate limit: 60 reads per minute per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("public-prayer-read", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { token } = await params;
  // Token is a 6-char share code (unambiguous alphabet). Legacy 32-char hex
  // tokens are also accepted so existing shared links don't break.
  if (!token || (!/^[A-Z2-9]{6}$/.test(token) && !/^[a-f0-9]{32}$/.test(token))) {
    return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  }

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.publicShareToken, token))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  if (!dateStr) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  const [cached] = await db
    .select({
      date: schema.prayerTimesCache.date,
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
        eq(schema.prayerTimesCache.userId, user.id),
        eq(schema.prayerTimesCache.date, dateStr),
      ),
    )
    .limit(1);

  if (!cached) {
    return NextResponse.json(
      { error: "No prayer times cached for this date." },
      { status: 404 },
    );
  }

  const response = NextResponse.json(cached);
  // Cache publicly — prayer times don't change within a day
  response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return response;
}
