import { NextRequest, NextResponse, after } from "next/server";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { recordDayCompletion } from "@/lib/prayer/social";

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

  // Validate date format (YYYY-MM-DD)
  const dateCheck = new Date(date + "T00:00:00");
  if (isNaN(dateCheck.getTime())) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  const validPrayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  if (!validPrayers.includes(prayerName)) {
    return NextResponse.json({ error: "Invalid prayer name." }, { status: 400 });
  }

  const validStatuses = ["prayed", "missed", "pending", "assumed_prayed", "excused"];
  // Reject invalid statuses — defaulting to "prayed" would record a prayer
  // the user never confirmed. Missing status defaults to prayed (the client
  // omits it for the common check-in).
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const finalStatus = status ?? "prayed";

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

  // If this check-in might have completed the user's day, record it once —
  // first completion drives shared streaks and opt-in friend notifications.
  // 'missed'/'pending' can never newly complete a day, so skip the query.
  if (finalStatus === "prayed" || finalStatus === "assumed_prayed" || finalStatus === "excused") {
    after(() => recordDayCompletion(session.userId, date));
  }

  return NextResponse.json(entry, { status: 201 });
}
