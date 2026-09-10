import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { sendPrayerPush } from "@/lib/notifications/push";

export const dynamic = "force-dynamic";

// POST — send a test push notification to the current user
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("notif-test", ip, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many test notifications. Please wait a few minutes." }, { status: 429 });
  }

  // Get all subscriptions for this user
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, session.userId));

  if (subs.length === 0) {
    return NextResponse.json(
      { error: "No push subscriptions found. Allow notifications and try again." },
      { status: 404 },
    );
  }

  const payload = JSON.stringify({
    title: "Waqt",
    body: "Push notifications are working. You'll be reminded when it's time to pray.",
    tag: "waqt-test",
    data: { url: "/" },
    vibrate: [200, 100, 200],
    renotify: true,
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendPrayerPush(
        sub,
        payload,
        { topic: "waqt-test" },
      ),
    ),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.delivered).length;
  const failed = results.filter((r) => r.status === "rejected").length;

  // Clean up expired subscriptions in a single batched delete
  const expiredIds = results
    .map((r, i) => ({ r, id: subs[i].id }))
    .filter(({ r }) => r.status === "fulfilled" && r.value.expired)
    .map(({ id }) => id);

  if (expiredIds.length > 0) {
    await db
      .delete(schema.pushSubscriptions)
      .where(inArray(schema.pushSubscriptions.id, expiredIds));
  }

  return NextResponse.json({
    ok: true,
    sent: succeeded,
    failed,
  });
}
