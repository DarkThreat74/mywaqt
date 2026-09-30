import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const VALID_PRAYERS = new Set(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
const PRAYER_LABEL: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

// POST /api/prayer-friends/remind — nudge a friend who hasn't prayed yet
// Body: { friendId: string, prayerName: string }
//
// Rules enforced server-side:
//   - Must be accepted friends, no block either direction
//   - Friend must share today's status (friendsSeeTodayStatus) — you can only
//     remind for what you can see
//   - Only the prayer whose window is OPEN right now (in the friend's own
//     timezone, from their cached times) can be reminded — nothing else
//   - Refused if the prayer is already prayed/assumed_prayed/missed — reminders
//     only make sense for an open prayer
//   - 2-minute cooldown per sender per prayer per day (unique index backstop,
//     row's createdAt is the cooldown clock)

const REMIND_COOLDOWN_MS = 2 * 60 * 1000;
const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
type PrayerName = (typeof PRAYER_ORDER)[number];

function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Which salah's window is live for the friend, from THEIR local clock. */
function currentPrayer(times: { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }, mins: number): PrayerName {
  let current: PrayerName = "isha"; // after midnight / before Fajr → Isha still open
  for (const p of PRAYER_ORDER) {
    const start = toMinutes(times[p]);
    if (start !== null && mins >= start) current = p;
  }
  return current;
}
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-friend-remind", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { friendId, prayerName } = body as { friendId?: string; prayerName?: string };
  if (!friendId || !isValidUUID(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }
  if (!prayerName || !VALID_PRAYERS.has(prayerName)) {
    return NextResponse.json({ error: "Invalid prayer." }, { status: 400 });
  }

  try {
    // Accepted friendship (me → them)
    const [friendship] = await db
      .select({ id: schema.prayerFriends.id })
      .from(schema.prayerFriends)
      .where(
        and(
          eq(schema.prayerFriends.userId, session.userId),
          eq(schema.prayerFriends.friendId, friendId),
          eq(schema.prayerFriends.status, "accepted"),
        ),
      )
      .limit(1);
    if (!friendship) {
      return NextResponse.json({ error: "Not friends." }, { status: 403 });
    }

    // Block check — either direction
    const [block] = await db
      .select({ id: schema.prayerBlocks.id })
      .from(schema.prayerBlocks)
      .where(
        or(
          and(eq(schema.prayerBlocks.userId, session.userId), eq(schema.prayerBlocks.blockedUserId, friendId)),
          and(eq(schema.prayerBlocks.userId, friendId), eq(schema.prayerBlocks.blockedUserId, session.userId)),
        ),
      )
      .limit(1);
    if (block) {
      return NextResponse.json({ error: "Not friends." }, { status: 403 });
    }

    // Friend must share today's status — otherwise the sender can't see the
    // prayer is open and the remind button shouldn't exist.
    const [friendSettings] = await db
      .select({
        timezone: schema.prayerSettings.timezone,
        friendsSeeTodayStatus: schema.prayerSettings.friendsSeeTodayStatus,
      })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, friendId))
      .limit(1);

    if (!friendSettings?.friendsSeeTodayStatus) {
      return NextResponse.json(
        { error: "This friend doesn't share their prayer status." },
        { status: 403 },
      );
    }

    const timezone = friendSettings.timezone || "America/Chicago";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

    // Only the prayer whose window is OPEN right now — computed from the
    // friend's cached times on THEIR local clock, same rule the UI uses.
    const [times] = await db
      .select()
      .from(schema.prayerTimesCache)
      .where(
        and(
          eq(schema.prayerTimesCache.userId, friendId),
          eq(schema.prayerTimesCache.date, todayStr),
        ),
      )
      .limit(1);
    if (!times) {
      return NextResponse.json(
        { error: "Their prayer times aren't synced — try again later." },
        { status: 409 },
      );
    }
    let localMins: number;
    try {
      const parts = new Date()
        .toLocaleTimeString("en-US", { timeZone: timezone, hour12: false, hour: "2-digit", minute: "2-digit" })
        .split(":")
        .map(Number);
      localMins = (parts[0] % 24) * 60 + parts[1];
    } catch {
      return NextResponse.json({ error: "Couldn't read their timezone." }, { status: 409 });
    }
    const live = currentPrayer(times, localMins);
    if (prayerName !== live) {
      return NextResponse.json(
        { error: `Only ${PRAYER_LABEL[live]} can be nudged right now — that's the salah happening.` },
        { status: 409 },
      );
    }

    // Only remind for an open prayer — pending row or no row at all.
    const [log] = await db
      .select({ status: schema.prayerLog.status })
      .from(schema.prayerLog)
      .where(
        and(
          eq(schema.prayerLog.userId, friendId),
          eq(schema.prayerLog.date, todayStr),
          eq(schema.prayerLog.prayerName, prayerName as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"),
        ),
      )
      .limit(1);

    if (log && log.status !== "pending") {
      return NextResponse.json(
        { error: `They've already marked ${PRAYER_LABEL[prayerName]}.` },
        { status: 409 },
      );
    }

    // Check push subs BEFORE inserting the dedupe row — if the friend has no
    // notifications enabled, the reminder would go nowhere but still burn the
    // one-per-day slot.
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, friendId));
    if (subs.length === 0) {
      return NextResponse.json(
        { error: "They don't have notifications enabled — the reminder wouldn't reach them." },
        { status: 409 },
      );
    }

    // 2-minute cooldown — the unique row's createdAt doubles as the clock.
    // Update only if older than the cooldown; a racing request waits on the
    // row lock then sees the fresh timestamp and falls through to the 409.
    const keys = and(
      eq(schema.prayerReminders.senderId, session.userId),
      eq(schema.prayerReminders.recipientId, friendId),
      eq(schema.prayerReminders.date, todayStr),
      eq(schema.prayerReminders.prayerName, prayerName as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"),
    );
    const [renewed] = await db
      .update(schema.prayerReminders)
      .set({ createdAt: new Date() })
      .where(and(keys, lt(schema.prayerReminders.createdAt, new Date(Date.now() - REMIND_COOLDOWN_MS))))
      .returning({ id: schema.prayerReminders.id });

    if (!renewed) {
      const inserted = await db
        .insert(schema.prayerReminders)
        .values({
          senderId: session.userId,
          recipientId: friendId,
          date: todayStr,
          prayerName: prayerName as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
        })
        .onConflictDoNothing()
        .returning({ id: schema.prayerReminders.id });
      if (inserted.length === 0) {
        return NextResponse.json(
          { error: "Already nudged — try again in a couple of minutes.", retryAfterSec: REMIND_COOLDOWN_MS / 1000 },
          { status: 429 },
        );
      }
    }
    const remindedAt = new Date().toISOString();

    // Push to the friend — best effort
    try {
      const [me] = await db
        .select({ firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const myName = me?.firstName || me?.displayName || "A friend";
      const expiredIds: string[] = [];
      for (const sub of subs) {
        const result = await sendPrayerPush(sub, JSON.stringify({
          title: `Prayer reminder — ${PRAYER_LABEL[prayerName]}`,
          body: `${myName} is reminding you to pray ${PRAYER_LABEL[prayerName]}.`,
          url: "/prayer",
        }), {
          // Group per prayer so a re-remind replaces, and expire after 2h —
          // a Fajr nudge delivered hours late is worse than none.
          topic: `prayer-remind-${prayerName}`,
          ttl: 2 * 60 * 60,
        });
        if (result.expired) expiredIds.push(sub.id);
      }
      if (expiredIds.length > 0) {
        await db
          .delete(schema.pushSubscriptions)
          .where(inArray(schema.pushSubscriptions.id, expiredIds));
      }
    } catch {
      // Push is best-effort — the reminder row is still recorded
    }

    return NextResponse.json({ ok: true, remindedAt });
  } catch (err) {
    logError(err, { route: "prayer-friends/remind" });
    return NextResponse.json({ error: "Could not send reminder." }, { status: 500 });
  }
}
