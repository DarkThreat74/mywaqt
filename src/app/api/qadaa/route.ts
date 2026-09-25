import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/qadaa — get the user's per-salah qadaa ledger
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("qadaa", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const [ledger] = await db
    .select()
    .from(schema.qadaaLedger)
    .where(eq(schema.qadaaLedger.userId, session.userId))
    .limit(1);

  if (!ledger) {
    return NextResponse.json({
      fajrOwed: 0,
      dhuhrOwed: 0,
      asrOwed: 0,
      maghribOwed: 0,
      ishaOwed: 0,
      setupCompleted: false,
    });
  }

  // Missed prayers logged after the waterline, grouped per salah — surfaced
  // as an "add to qadaa?" nudge under the tracker.
  const missedRows = await db
    .select({
      prayerName: schema.prayerLog.prayerName,
      missed: sql<number>`count(*)::int`,
    })
    .from(schema.prayerLog)
    .where(
      and(
        eq(schema.prayerLog.userId, session.userId),
        eq(schema.prayerLog.status, "missed"),
        gt(schema.prayerLog.date, ledger.unloggedSeenThrough ?? "0001-01-01"),
      ),
    )
    .groupBy(schema.prayerLog.prayerName);

  const unloggedByPrayer: Record<string, number> = {};
  let unloggedMissed = 0;
  for (const r of missedRows) {
    if (r.missed > 0) {
      unloggedByPrayer[r.prayerName] = r.missed;
      unloggedMissed += r.missed;
    }
  }

  return NextResponse.json({
    fajrOwed: ledger.fajrOwed,
    dhuhrOwed: ledger.dhuhrOwed,
    asrOwed: ledger.asrOwed,
    maghribOwed: ledger.maghribOwed,
    ishaOwed: ledger.ishaOwed,
    setupCompleted: ledger.setupCompleted,
    unloggedMissed,
    unloggedByPrayer,
  });
}
