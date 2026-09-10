import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST — save a push subscription to the database.
// Accepts two formats:
//   1. Web Push: { endpoint, keys: { p256dh, auth } }
//   2. Native:   { platform: "ios"|"android", token: "...", native: true }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("push-subscribe", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ── Native push (iOS APNs / Android FCM) ──
  const nativeBody = body as { platform?: string; token?: string; native?: boolean };
  if (nativeBody.native === true) {
    const platform = nativeBody.platform;
    const token = nativeBody.token;

    if (platform !== "ios" && platform !== "android") {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    if (!token || token.length > 500) {
      return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
    }

    // Dedup by user + platform + token
    const [existing] = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, session.userId),
          eq(schema.pushSubscriptions.platform, platform),
          eq(schema.pushSubscriptions.token, token),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const [sub] = await db
      .insert(schema.pushSubscriptions)
      .values({
        userId: session.userId,
        platform,
        token,
        // Web-push fields are NOT NULL with defaults — empty strings
        endpoint: "",
        p256dh: "",
        auth: "",
      })
      .returning();

    return NextResponse.json({ ok: true, id: sub.id });
  }

  // ── Web Push (default) ──
  const { endpoint, keys } = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing subscription fields." },
      { status: 400 },
    );
  }

  // Validate field lengths to prevent abuse
  if (endpoint.length > 500 || keys.p256dh.length > 200 || keys.auth.length > 200) {
    return NextResponse.json(
      { error: "Invalid subscription data." },
      { status: 400 },
    );
  }

  // Check if this endpoint is already registered for this user
  const [existing] = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, session.userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id });
  }

  // Insert new subscription
  const [sub] = await db
    .insert(schema.pushSubscriptions)
    .values({
      userId: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .returning();

  return NextResponse.json({ ok: true, id: sub.id });
}
