import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/settings/prayer-settings — get the user's prayer settings (timezone, method, visibility, etc.)
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings] = await db
    .select({
      timezone: schema.prayerSettings.timezone,
      calculationMethod: schema.prayerSettings.calculationMethod,
      madhab: schema.prayerSettings.madhab,
      friendsSeeStreak: schema.prayerSettings.friendsSeeStreak,
      friendsSeeTodayStatus: schema.prayerSettings.friendsSeeTodayStatus,
      friendsSeeSunnah: schema.prayerSettings.friendsSeeSunnah,
      friendsSeeMasjidPct: schema.prayerSettings.friendsSeeMasjidPct,
      friendsNotifyComplete: schema.prayerSettings.friendsNotifyComplete,
      gender: schema.prayerSettings.gender,
      haydTracking: schema.prayerSettings.haydTracking,
      masjidExternalId: schema.prayerSettings.masjidExternalId,
      masjidName: schema.prayerSettings.masjidName,
      masjidIqamah: schema.prayerSettings.masjidIqamah,
      useIqamahReminders: schema.prayerSettings.useIqamahReminders,
      timeOffsetMinutes: schema.prayerSettings.timeOffsetMinutes,
      showNaflTimes: schema.prayerSettings.showNaflTimes,
    })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);

  if (!settings) {
    return NextResponse.json({ error: "Settings not found." }, { status: 404 });
  }

  return NextResponse.json(settings);
}

// PATCH /api/settings/prayer-settings — update friends visibility toggles
// Body: { friendsSeeStreak?, friendsSeeTodayStatus?, friendsSeeSunnah?, friendsSeeMasjidPct? }
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-settings-patch", ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: {
    friendsSeeStreak?: boolean;
    friendsSeeTodayStatus?: boolean;
    friendsSeeSunnah?: boolean;
    friendsSeeMasjidPct?: boolean;
    friendsNotifyComplete?: boolean;
    gender?: string;
    haydTracking?: boolean;
    masjidExternalId?: string | null;
    masjidName?: string | null;
    masjidIqamah?: Record<string, string> | null;
    useIqamahReminders?: boolean;
    timeOffsetMinutes?: number;
    showNaflTimes?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.friendsSeeStreak === "boolean") updates.friendsSeeStreak = body.friendsSeeStreak;
  if (typeof body.friendsSeeTodayStatus === "boolean") updates.friendsSeeTodayStatus = body.friendsSeeTodayStatus;
  if (typeof body.friendsSeeSunnah === "boolean") updates.friendsSeeSunnah = body.friendsSeeSunnah;
  if (typeof body.friendsSeeMasjidPct === "boolean") updates.friendsSeeMasjidPct = body.friendsSeeMasjidPct;
  if (typeof body.friendsNotifyComplete === "boolean") updates.friendsNotifyComplete = body.friendsNotifyComplete;
  if (body.gender === "male" || body.gender === "female") updates.gender = body.gender;
  // Hayd tracking only applies to female accounts — check effective gender
  if (typeof body.haydTracking === "boolean") {
    let effectiveGender = body.gender === "male" || body.gender === "female" ? body.gender : null;
    if (!effectiveGender) {
      const [cur] = await db
        .select({ gender: schema.prayerSettings.gender })
        .from(schema.prayerSettings)
        .where(eq(schema.prayerSettings.userId, session.userId))
        .limit(1);
      effectiveGender = cur?.gender ?? null;
    }
    updates.haydTracking = body.haydTracking && effectiveGender === "female";
    // Switching to male disables hayd tracking implicitly
    if (body.gender === "male") updates.haydTracking = false;
  }
  if (body.masjidExternalId === null || typeof body.masjidExternalId === "string") {
    updates.masjidExternalId = body.masjidExternalId === null ? null : body.masjidExternalId.slice(0, 200);
  }
  if (body.masjidName === null || typeof body.masjidName === "string") {
    updates.masjidName = body.masjidName === null ? null : body.masjidName.slice(0, 200);
  }
  if (body.masjidIqamah !== undefined) {
    if (body.masjidIqamah === null) {
      updates.masjidIqamah = null;
    } else if (typeof body.masjidIqamah === "object") {
      const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
      const iq = body.masjidIqamah as {
        manual?: Record<string, string>;
        fixed?: (string | null)[];
        offsets?: (number | null)[];
        jummah?: string | null;
      };
      const clean: Record<string, unknown> = {};
      if (iq.manual && typeof iq.manual === "object") {
        const m: Record<string, string> = {};
        for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
          const v = iq.manual[k];
          if (typeof v === "string" && TIME_RE.test(v)) m[k] = v;
        }
        clean.manual = m;
      }
      if (Array.isArray(iq.fixed)) {
        clean.fixed = iq.fixed.slice(0, 5).map((v) => (typeof v === "string" && TIME_RE.test(v) ? v : null));
      }
      if (Array.isArray(iq.offsets)) {
        clean.offsets = iq.offsets
          .slice(0, 5)
          .map((v) => (typeof v === "number" && Number.isInteger(v) && v >= -120 && v <= 300 ? v : null));
      }
      if (typeof iq.jummah === "string" && TIME_RE.test(iq.jummah)) clean.jummah = iq.jummah;
      updates.masjidIqamah = clean;
    }
  }
  if (typeof body.useIqamahReminders === "boolean") updates.useIqamahReminders = body.useIqamahReminders;
  if (typeof body.timeOffsetMinutes === "number" && Number.isInteger(body.timeOffsetMinutes)
      && body.timeOffsetMinutes >= -120 && body.timeOffsetMinutes <= 120) {
    updates.timeOffsetMinutes = body.timeOffsetMinutes;
  }
  if (typeof body.showNaflTimes === "boolean") updates.showNaflTimes = body.showNaflTimes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(schema.prayerSettings)
      .set(updates)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Settings not found." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "prayer-settings/PATCH" });
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
