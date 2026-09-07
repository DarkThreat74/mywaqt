import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// GET /api/prayer-log/range?from=YYYY-MM-DD&to=YYYY-MM-DD — get prayer logs for a date range
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "Missing from or to parameter." }, { status: 400 });
  }

  // Cap range to 180 days to prevent unbounded queries
  const fromDate = new Date(fromStr + "T00:00:00");
  const toDate = new Date(toStr + "T23:59:59");
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }
  const maxRange = 180 * 24 * 60 * 60 * 1000;
  if (toDate.getTime() - fromDate.getTime() > maxRange) {
    return NextResponse.json({ error: "Date range cannot exceed 180 days." }, { status: 400 });
  }

  const logs = await db
    .select({
      id: schema.prayerLog.id,
      date: schema.prayerLog.date,
      prayerName: schema.prayerLog.prayerName,
      status: schema.prayerLog.status,
      wentToMasjid: schema.prayerLog.wentToMasjid,
    })
    .from(schema.prayerLog)
    .where(
      and(
        eq(schema.prayerLog.userId, session.userId),
        gte(schema.prayerLog.date, fromStr),
        lte(schema.prayerLog.date, toStr),
      ),
    )
    .limit(1000);

  return NextResponse.json(logs);
}
