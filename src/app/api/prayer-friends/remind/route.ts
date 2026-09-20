import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, inArray } from "drizzle-orm";
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
//   - Refused if the prayer is already prayed/assumed_prayed/missed — reminders
//     only make sense for an open prayer
//   - One reminder per sender per prayer per day (unique index backstop)
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

    // Dedupe: one reminder per sender per prayer per day
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
        { error: "You already reminded them about this prayer today." },
        { status: 409 },
      );
    }

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "prayer-friends/remind" });
    return NextResponse.json({ error: "Could not send reminder." }, { status: 500 });
  }
}
