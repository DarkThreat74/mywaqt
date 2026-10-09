import { NextRequest, NextResponse, after } from "next/server";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isHaydDay } from "@/lib/prayer/hayd";
import { recordDayCompletion } from "@/lib/prayer/social";
import { acknowledgeQadaaWaterline } from "@/lib/qadaa";

export const dynamic = "force-dynamic";

// POST /api/prayer-log/checkin — record a prayer check-in
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-checkin", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { date, prayerName, status, wentToMasjid } = body as {
    date?: string;
    prayerName?: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
    status?: "prayed" | "missed" | "pending" | "assumed_prayed" | "excused";
    wentToMasjid?: boolean;
  };

  if (!date || !prayerName) {
    return NextResponse.json({ error: "Date and prayer name are required." }, { status: 400 });
  }

  // Validate strict YYYY-MM-DD — `new Date()` accepts "2024-1-1" too, which
  // would store a row whose date never matches the zero-padded format every
  // query uses (a permanently orphaned prayer log).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + "T00:00:00").getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  const validPrayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  if (!validPrayers.includes(prayerName)) {
    return NextResponse.json({ error: "Invalid prayer name." }, { status: 400 });
  }

  // No future dates — logging tomorrow's prayers inflates streaks, heatmap,
  // and qadaa before the day exists. Bounded in the user's own timezone.
  const [tzRow] = await db
    .select({ timezone: schema.prayerSettings.timezone })
    .from(schema.prayerSettings)
    .where(eq(schema.prayerSettings.userId, session.userId))
    .limit(1);
  let todayStr: string;
  try {
    todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tzRow?.timezone || "UTC" });
  } catch {
    todayStr = new Date().toLocaleDateString("en-CA");
  }
  if (date > todayStr) {
    return NextResponse.json({ error: "Can't log a prayer for a future date." }, { status: 400 });
  }

  // "assumed_prayed" is system-resolved (cron at window close) — a client
  // writing it would forge the auto-resolution trail. "excused" stays
  // client-writable: illness/travel/hayd are user-declared by design.
  const validStatuses = ["prayed", "missed", "pending", "excused"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const finalStatus = status ?? "prayed";

  // Hayd: during a hayd period the obligation is lifted — the UI hides
  // check-in controls; this blocks any queued/manual call that slips through.
  if (finalStatus !== "excused" && (await isHaydDay(session.userId, date))) {
    return NextResponse.json(
      { error: "This day is marked as hayd — prayer logging is paused.", excused: true },
      { status: 409 },
    );
  }

  // Note: No window check — users can log prayers at any time.
  // This is essential for offline use (when the outbox syncs, the window
  // may have passed) and for users who prayed but couldn't log at the time.
  // The cron job handles auto-resolution (assumed_prayed) for unmarked prayers.

  // Upsert prayer log entry — atomic so retries/double-taps don't 500 on the
  // unique index (userId, date, prayerName). wentToMasjid uses COALESCE so an
  // omitted field keeps the stored value.
  const [entry] = await db
    .insert(schema.prayerLog)
    .values({
      userId: session.userId,
      date,
      prayerName: prayerName as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
      status: finalStatus as "prayed" | "missed" | "pending" | "assumed_prayed" | "excused",
      wentToMasjid: wentToMasjid ?? false,
      markedAt: new Date(),
      lastCheckinAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.prayerLog.userId, schema.prayerLog.date, schema.prayerLog.prayerName],
      set: {
        status: finalStatus as "prayed" | "missed" | "pending" | "assumed_prayed" | "excused",
        ...(wentToMasjid !== undefined ? { wentToMasjid } : {}),
        markedAt: new Date(),
        lastCheckinAt: new Date(),
        checkinStage: 0,
      },
    })
    .returning();

  // Nudged prayers: marking a salah that friends reminded about flips those
  // reminders to answered and tells the client who to dua for. answered_at
  // is the one-shot guard — re-marks don't re-prompt.
  let thanksDue: { senderId: string; name: string }[] = [];
  if (finalStatus === "prayed") {
    const owed = await db
      .update(schema.prayerReminders)
      .set({ answeredAt: new Date() })
      .where(
        and(
          eq(schema.prayerReminders.recipientId, session.userId),
          eq(schema.prayerReminders.date, date),
          eq(schema.prayerReminders.prayerName, prayerName),
          isNull(schema.prayerReminders.answeredAt),
        ),
      )
      .returning({ senderId: schema.prayerReminders.senderId });

    if (owed.length > 0) {
      const senders = await db
        .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(inArray(schema.users.id, owed.map((r) => r.senderId)));
      thanksDue = senders.map((s) => ({
        senderId: s.id,
        name: s.firstName || s.displayName || "your friend",
      }));

      // The nudge was answered — clear its lingering toast on their tray.
      after(async () => {
        await db
          .update(schema.appNotifications)
          .set({ acknowledgedAt: new Date() })
          .where(
            and(
              eq(schema.appNotifications.userId, session.userId),
              eq(schema.appNotifications.type, "nudge"),
              isNull(schema.appNotifications.acknowledgedAt),
            ),
          );
      });
    }
  }

  // If this check-in might have completed the user's day, record it once —
  // first completion drives shared streaks and opt-in friend notifications.
  // 'missed'/'pending' can never newly complete a day, so skip the query.
  if (finalStatus === "prayed" || finalStatus === "assumed_prayed" || finalStatus === "excused") {
    after(() => recordDayCompletion(session.userId, date));
  }

  // Deliberately engaging resets the "unlogged misses" nudge — the waterline
  // moves to today. 'missed' check-ins are excluded so a prayer the user just
  // marked missed still surfaces in tomorrow's nudge instead of being
  // swallowed by the waterline they just raised.
  if (finalStatus !== "missed") {
    after(() => acknowledgeQadaaWaterline(session.userId));
  }

  return NextResponse.json({ ...entry, thanksDue }, { status: 201 });
}
