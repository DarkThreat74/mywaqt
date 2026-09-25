import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { acknowledgeQadaaWaterline } from "@/lib/qadaa";

export const dynamic = "force-dynamic";

const VALID_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
type PrayerName = (typeof VALID_PRAYERS)[number];

// POST /api/qadaa/setup — set initial per-salah qadaa amounts (only works if not already set up)
// Body: { fajr: number, dhuhr: number, asr: number, maghrib: number, isha: number }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("qadaa-setup", ip, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { fajr, dhuhr, asr, maghrib, isha } = body as {
    fajr?: number; dhuhr?: number; asr?: number; maghrib?: number; isha?: number;
  };

  // Validate all 5 prayers
  const amounts: Record<PrayerName, number> = {
    fajr: Number(fajr) || 0,
    dhuhr: Number(dhuhr) || 0,
    asr: Number(asr) || 0,
    maghrib: Number(maghrib) || 0,
    isha: Number(isha) || 0,
  };

  for (const prayer of VALID_PRAYERS) {
    if (!Number.isInteger(amounts[prayer]) || amounts[prayer] < 0) {
      return NextResponse.json({ error: `${prayer} must be a non-negative integer.` }, { status: 400 });
    }
    if (amounts[prayer] > 100000) {
      return NextResponse.json({ error: `${prayer} value too large.` }, { status: 400 });
    }
  }

  // Check if already set up
  const [existing] = await db
    .select()
    .from(schema.qadaaLedger)
    .where(eq(schema.qadaaLedger.userId, session.userId))
    .limit(1);

  if (existing?.setupCompleted) {
    return NextResponse.json(
      { error: "Qadaa already set up. Use the adjust endpoint to change amounts." },
      { status: 409 },
    );
  }

  if (existing) {
    await db
      .update(schema.qadaaLedger)
      .set({
        fajrOwed: amounts.fajr,
        dhuhrOwed: amounts.dhuhr,
        asrOwed: amounts.asr,
        maghribOwed: amounts.maghrib,
        ishaOwed: amounts.isha,
        setupCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.qadaaLedger.userId, session.userId));
  } else {
    await db.insert(schema.qadaaLedger).values({
      userId: session.userId,
      fajrOwed: amounts.fajr,
      dhuhrOwed: amounts.dhuhr,
      asrOwed: amounts.asr,
      maghribOwed: amounts.maghrib,
      ishaOwed: amounts.isha,
      setupCompleted: true,
    });
  }

  // Setup is "the last time you updated the qadaa tracker" — the nudge
  // counts only misses from here forward.
  after(() => acknowledgeQadaaWaterline(session.userId));

  return NextResponse.json({
    fajrOwed: amounts.fajr,
    dhuhrOwed: amounts.dhuhr,
    asrOwed: amounts.asr,
    maghribOwed: amounts.maghrib,
    ishaOwed: amounts.isha,
    setupCompleted: true,
  });
}
