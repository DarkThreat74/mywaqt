import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { dateStrInTimezone } from "@/lib/timezone";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const OWED_COL = {
  fajr: "fajr_owed",
  dhuhr: "dhuhr_owed",
  asr: "asr_owed",
  maghrib: "maghrib_owed",
  isha: "isha_owed",
} as const;

// POST /api/qadaa/unlogged — resolve the "missed since last update" nudge.
// Body: { action: "absorb" | "dismiss" }
//   absorb  — adds each missed prayer to its owed column, advances waterline
//   dismiss — advances the waterline only
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("qadaa-unlogged", ip, 20, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const action = (body as { action?: string }).action;
    if (action !== "absorb" && action !== "dismiss") {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const [ledger] = await db
      .select()
      .from(schema.qadaaLedger)
      .where(eq(schema.qadaaLedger.userId, session.userId))
      .limit(1);
    if (!ledger || !ledger.setupCompleted) {
      return NextResponse.json({ error: "Qadaa not set up yet." }, { status: 404 });
    }

    const waterline = ledger.unloggedSeenThrough ?? "0001-01-01";

    // Waterline = yesterday in the user's timezone — prayers missed today
    // aren't resolved yet, and still surface tomorrow.
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    const todayStr = dateStrInTimezone(new Date(), settings?.timezone || "UTC");
    const yesterday = new Date(`${todayStr}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const newWaterline = yesterday.toISOString().slice(0, 10);

    // Single UPDATE for owed columns AND waterline — atomic, so a crash
    // between absorb and waterline can't double-add or silently drop rows.
    const updates: Record<string, unknown> = {
      unloggedSeenThrough: newWaterline,
      updatedAt: new Date(),
    };

    if (action === "absorb") {
      // Per-prayer missed counts since the waterline — one grouped query.
      const rows = await db
        .select({
          prayerName: schema.prayerLog.prayerName,
          missed: sql<number>`count(*)::int`,
        })
        .from(schema.prayerLog)
        .where(
          and(
            eq(schema.prayerLog.userId, session.userId),
            eq(schema.prayerLog.status, "missed"),
            gt(schema.prayerLog.date, waterline),
          ),
        )
        .groupBy(schema.prayerLog.prayerName);

      for (const r of rows) {
        const col = OWED_COL[r.prayerName as keyof typeof OWED_COL];
        if (col && r.missed > 0) {
          const prop = col === "fajr_owed" ? "fajrOwed" : col === "dhuhr_owed" ? "dhuhrOwed" : col === "asr_owed" ? "asrOwed" : col === "maghrib_owed" ? "maghribOwed" : "ishaOwed";
          updates[prop] = sql`${sql.raw(col)} + ${r.missed}`;
        }
      }
    }

    await db
      .update(schema.qadaaLedger)
      .set(updates)
      .where(eq(schema.qadaaLedger.userId, session.userId));

    const [updated] = await db
      .select()
      .from(schema.qadaaLedger)
      .where(eq(schema.qadaaLedger.userId, session.userId))
      .limit(1);

    return NextResponse.json({
      fajrOwed: updated.fajrOwed,
      dhuhrOwed: updated.dhuhrOwed,
      asrOwed: updated.asrOwed,
      maghribOwed: updated.maghribOwed,
      ishaOwed: updated.ishaOwed,
      setupCompleted: updated.setupCompleted,
      unloggedMissed: 0,
    });
  } catch (err) {
    logError(err, { route: "qadaa/unlogged" });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
