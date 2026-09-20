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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(schema.prayerSettings)
      .set(updates)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .returning({
        friendsSeeStreak: schema.prayerSettings.friendsSeeStreak,
        friendsSeeTodayStatus: schema.prayerSettings.friendsSeeTodayStatus,
        friendsSeeSunnah: schema.prayerSettings.friendsSeeSunnah,
        friendsSeeMasjidPct: schema.prayerSettings.friendsSeeMasjidPct,
        friendsNotifyComplete: schema.prayerSettings.friendsNotifyComplete,
      });

    if (!updated) {
      return NextResponse.json({ error: "Settings not found." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    logError(err, { route: "prayer-settings/PATCH" });
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
