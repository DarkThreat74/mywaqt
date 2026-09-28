import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
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
// The waterline is a timestamp: "missed prayers marked since the user last
// engaged". Resolving the nudge acknowledges everything marked up to now —
// the counter restarts from the current salah, and a prayer marked missed
// later today still surfaces tomorrow.
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

    // Snapshot BEFORE counting: a check-in landing between the count and the
    // UPDATE gets marked_at > snapshot and survives to the next nudge —
    // nothing is ever swallowed mid-request.
    const snapshot = new Date();
    const oldWaterline = ledger.unloggedSeenThrough;
    const markedExpr = sql`coalesce(${schema.prayerLog.markedAt}, ${schema.prayerLog.lastCheckinAt}, ${schema.prayerLog.date}::timestamptz)`;

    // Single UPDATE for owed columns AND waterline — atomic, so a crash
    // between absorb and waterline can't double-add or silently drop rows.
    const updates: Record<string, unknown> = {
      unloggedSeenThrough: snapshot,
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
            sql`${markedExpr} > ${oldWaterline ?? new Date(0)}`,
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

    // Optimistic concurrency — the UPDATE only applies if the waterline is
    // still what we counted against. Two concurrent absorbs can't both add:
    // whoever commits second matches zero rows and returns the winner's state.
    const applied = await db
      .update(schema.qadaaLedger)
      .set(updates)
      .where(
        and(
          eq(schema.qadaaLedger.userId, session.userId),
          sql`${schema.qadaaLedger.unloggedSeenThrough} IS NOT DISTINCT FROM ${oldWaterline}`,
        ),
      )
      .returning({ id: schema.qadaaLedger.userId });

    if (applied.length === 0) {
      logError(new Error("qadaa/unlogged: concurrent resolve detected"), {
        route: "qadaa/unlogged",
      });
    }

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
