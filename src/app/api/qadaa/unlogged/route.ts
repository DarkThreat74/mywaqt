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

      const updates: Record<string, ReturnType<typeof sql>> = {};
      for (const r of rows) {
        const col = OWED_COL[r.prayerName as keyof typeof OWED_COL];
        if (col && r.missed > 0) {
          const prop = col === "fajr_owed" ? "fajrOwed" : col === "dhuhr_owed" ? "dhuhrOwed" : col === "asr_owed" ? "asrOwed" : col === "maghrib_owed" ? "maghribOwed" : "ishaOwed";
          updates[prop] = sql`${sql.raw(col)} + ${r.missed}`;
        }
      }
      if (Object.keys(updates).length > 0) {
        await db
          .update(schema.qadaaLedger)
          .set(updates)
          .where(eq(schema.qadaaLedger.userId, session.userId));
      }
    }

    // Advance the waterline to today in the user's timezone — today's
    // prayers aren't resolved yet, so they don't count.
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    const today = dateStrInTimezone(new Date(), settings?.timezone || "UTC");

    await db
      .update(schema.qadaaLedger)
      .set({ unloggedSeenThrough: today })
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
