import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/prayer-friends/cheer — one-tap encouragement to a friend
// Body: { friendId: string }
//
// Server-side rules (mirrors /remind):
//   - Must be accepted friends, no block either direction
//   - One cheer per sender per recipient per day (recipient's local date)
//   - Best-effort push; friend without subscriptions gets a clear error
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-friend-cheer", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { friendId } = body as { friendId?: string };
  if (!friendId || !isValidUUID(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }

  try {
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

    const [friendSettings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, friendId))
      .limit(1);
    const timezone = friendSettings?.timezone || "America/Chicago";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, friendId));
    if (subs.length === 0) {
      return NextResponse.json(
        { error: "They don't have notifications enabled — the cheer wouldn't reach them." },
        { status: 409 },
      );
    }

    // Dedupe: one cheer per day — the unique index is the backstop
    const inserted = await db
      .insert(schema.prayerCheers)
      .values({ senderId: session.userId, recipientId: friendId, date: todayStr })
      .onConflictDoNothing()
      .returning({ id: schema.prayerCheers.id });

    if (inserted.length === 0) {
      return NextResponse.json(
        { error: "You already cheered them on today." },
        { status: 409 },
      );
    }

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
          title: "MashaAllah!",
          body: `${myName} is cheering you on — keep going.`,
          url: "/prayer?tab=friends",
        }), {
          topic: "prayer-cheer",
          ttl: 6 * 60 * 60,
        });
        if (result.expired) expiredIds.push(sub.id);
      }
      if (expiredIds.length > 0) {
        await db
          .delete(schema.pushSubscriptions)
          .where(inArray(schema.pushSubscriptions.id, expiredIds));
      }
    } catch {
      // Push is best-effort — the cheer row is still recorded
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "prayer-friends/cheer" });
    return NextResponse.json({ error: "Could not send cheer." }, { status: 500 });
  }
}
