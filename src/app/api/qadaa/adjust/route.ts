import { NextRequest, NextResponse, after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { acknowledgeQadaaWaterline } from "@/lib/qadaa";

export const dynamic = "force-dynamic";

const VALID_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
type PrayerName = (typeof VALID_PRAYERS)[number];

// POST /api/qadaa/adjust — adjust the qadaa count for a specific prayer
// Body: { prayer: "fajr"|"dhuhr"|"asr"|"maghrib"|"isha", amount: number }
// amount > 0 = add to backlog, amount < 0 = log prayed (reduces owed), capped at ±20
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("qadaa-adjust", ip, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { prayer, amount } = body as { prayer?: string; amount?: number };

  if (!prayer || !VALID_PRAYERS.includes(prayer as PrayerName)) {
    return NextResponse.json({ error: "Invalid prayer name." }, { status: 400 });
  }

  if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: "Amount must be a non-zero integer." }, { status: 400 });
  }

  // Cap at ±20
  const cappedAmount = Math.max(-20, Math.min(20, amount));
  const prayerName = prayer as PrayerName;

  // Get existing ledger
  const [existing] = await db
    .select()
    .from(schema.qadaaLedger)
    .where(eq(schema.qadaaLedger.userId, session.userId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Qadaa not set up yet." }, { status: 404 });
  }

  // Map prayer name to Drizzle property name and DB column name
  const columnMap = {
    fajr: { prop: "fajrOwed", col: "fajr_owed" },
    dhuhr: { prop: "dhuhrOwed", col: "dhuhr_owed" },
    asr: { prop: "asrOwed", col: "asr_owed" },
    maghrib: { prop: "maghribOwed", col: "maghrib_owed" },
    isha: { prop: "ishaOwed", col: "isha_owed" },
  } as const;

  const { prop, col } = columnMap[prayerName];

  // Atomic increment/decrement using SQL GREATEST to prevent negative values
  // This avoids the read-then-update race condition
  const [updated] = await db
    .update(schema.qadaaLedger)
    .set({
      [prop]: sql`GREATEST(${sql.raw(col)} + ${cappedAmount}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(schema.qadaaLedger.userId, session.userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Failed to update qadaa." }, { status: 500 });
  }

  // Touching the ledger acknowledges pending unlogged misses — reset the
  // nudge waterline to today.
  after(() => acknowledgeQadaaWaterline(session.userId));

  // Log the entry if it's a "prayed" adjustment (negative)
  if (cappedAmount < 0) {
    // Log what was actually deducted, not what was requested — the ledger
    // clamps at 0 via GREATEST, so a -20 on a balance of 3 only prays 3.
    const currentOwed = existing[prop] as number;
    const applied = Math.min(Math.abs(cappedAmount), Math.max(0, currentOwed));
    if (applied > 0) {
      await db.insert(schema.qadaaLogEntries).values({
        userId: session.userId,
        prayerName: prayerName,
        amountLogged: applied,
      });
    }
  }

  return NextResponse.json({
    fajrOwed: updated.fajrOwed,
    dhuhrOwed: updated.dhuhrOwed,
    asrOwed: updated.asrOwed,
    maghribOwed: updated.maghribOwed,
    ishaOwed: updated.ishaOwed,
    setupCompleted: updated.setupCompleted,
  });
}
