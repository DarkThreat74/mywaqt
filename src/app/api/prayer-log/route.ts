import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/prayer-log?date=YYYY-MM-DD — get prayer log for a day
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 60 reads per minute per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-log-read", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  if (!dateStr) {
    return NextResponse.json({ error: "Missing date parameter." }, { status: 400 });
  }

  const logs = await db
    .select({
      id: schema.prayerLog.id,
      prayerName: schema.prayerLog.prayerName,
      status: schema.prayerLog.status,
      wentToMasjid: schema.prayerLog.wentToMasjid,
    })
    .from(schema.prayerLog)
    .where(
      and(
        eq(schema.prayerLog.userId, session.userId),
        eq(schema.prayerLog.date, dateStr),
      ),
    );

  return NextResponse.json(logs);
}
