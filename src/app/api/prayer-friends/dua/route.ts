import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";
import { DUA_PRESETS, validateDua } from "@/lib/dua";

export const dynamic = "force-dynamic";

const VALID_PRAYERS = new Set(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
const PRAYER_LABEL: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

/**
 * POST /api/prayer-friends/dua — the reminded friend sends a dua back to the
 * nudger after marking the salah. Body: { senderId, prayerName, date?, preset?|text? }
 * `date` is the salah's logged date — late check-ins (e.g. yesterday's Dhuhr)
 * answered that day's reminder, so the dua must target the same date.
 *
 * Gates:
 *  - an answered reminder must exist (sender → me, my today, this salah)
 *  - one dua per reminder (dua_at set → done)
 *  - custom text passes the local cleanliness filter; presets are fixed
 *  - delivery respects the NUDGER's prefs (duaThanksInApp / duaThanksPush)
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("pf-dua", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { senderId?: unknown; prayerName?: unknown; date?: unknown; preset?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.senderId !== "string" || !isValidUUID(body.senderId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.prayerName !== "string" || !VALID_PRAYERS.has(body.prayerName)) {
    return NextResponse.json({ error: "Invalid prayer." }, { status: 400 });
  }

  const text =
    typeof body.preset === "number" && body.preset >= 0 && body.preset < DUA_PRESETS.length
      ? DUA_PRESETS[body.preset]
      : typeof body.text === "string"
        ? body.text.trim()
        : null;
  if (!text) {
    return NextResponse.json({ error: "Pick a dua or write your own." }, { status: 400 });
  }
  // Presets are vetted; only custom text goes through the filter.
  if (body.preset === undefined) {
    const invalid = validateDua(text);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  }

  try {
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    const timezone = settings?.timezone || "America/Chicago";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

    // The dua targets the date the salah was logged for — late check-ins
    // (yesterday's prayer) stamped that day's reminder. Bound it to the last
    // 7 days in MY timezone so arbitrary old dates can't be mined.
    let dateStr = todayStr;
    if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      const weekAgo = new Date(Date.now() - 7 * 86400_000)
        .toLocaleDateString("en-CA", { timeZone: timezone });
      if (body.date <= todayStr && body.date >= weekAgo) dateStr = body.date;
    }

    // The answered nudge this dua belongs to — one dua per reminder.
    const [reminder] = await db
      .update(schema.prayerReminders)
      .set({ duaText: text, duaAt: new Date() })
      .where(
        and(
          eq(schema.prayerReminders.senderId, body.senderId),
          eq(schema.prayerReminders.recipientId, session.userId),
          eq(schema.prayerReminders.date, dateStr),
          eq(schema.prayerReminders.prayerName, body.prayerName as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"),
          isNotNull(schema.prayerReminders.answeredAt),
          isNull(schema.prayerReminders.duaAt),
        ),
      )
      .returning({ id: schema.prayerReminders.id });
    if (!reminder) {
      return NextResponse.json({ error: "Nothing to thank for." }, { status: 409 });
    }

    const [me] = await db
      .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);
    const myName = me?.firstName || me?.displayName || "Your friend";
    const prayer = PRAYER_LABEL[body.prayerName];

    // Deliver to the nudger per THEIR prefs (both default on).
    const [prefs] = await db
      .select({ inApp: schema.notificationPrefs.duaThanksInApp, push: schema.notificationPrefs.duaThanksPush })
      .from(schema.notificationPrefs)
      .where(eq(schema.notificationPrefs.userId, body.senderId))
      .limit(1);
    const inApp = prefs?.inApp ?? true;
    const push = prefs?.push ?? true;

    if (inApp) {
      await db.insert(schema.appNotifications).values({
        userId: body.senderId,
        type: "dua_received",
        title: `${myName} made dua for you`,
        body: `“${text}” — they prayed ${prayer} after your nudge.`,
      });
    }
    if (push) {
      try {
        const subs = await db
          .select()
          .from(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.userId, body.senderId));
        for (const sub of subs) {
          await sendPrayerPush(sub, JSON.stringify({
            title: `🤲 ${myName} made dua for you`,
            body: `“${text}”`,
            url: "/prayer?tab=friends",
          }), { topic: `dua-${reminder.id}`, ttl: 6 * 60 * 60 });
        }
      } catch {
        // push best-effort
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "prayer-friends/dua" });
    return NextResponse.json({ error: "Couldn't send the dua." }, { status: 500 });
  }
}
