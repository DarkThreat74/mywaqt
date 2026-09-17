import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { slugifyName } from "@/lib/slugify";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Generate a short 6-character share code using an unambiguous alphabet
// (no I, O, 0, 1). 32^6 ≈ 1 billion possibilities — collision-resistant at
// 100k users with a DB uniqueness check. The code is URL-friendly and
// easy to share verbally.
const SHARE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHARE_CODE_LENGTH = 6;

function generateShareCode(): string {
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_ALPHABET[randomInt(SHARE_ALPHABET.length)];
  }
  return code;
}

// POST /api/share/generate — create or regenerate the public share code.
// Regenerating overwrites the old code, which deactivates the previous link.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 generations per hour per IP
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("share-generate", ip, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Get the user's display name for the URL
  const [userRow] = await db
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  const nameSlug = slugifyName(userRow?.displayName || "shared");

  // Generate a unique 6-char code (collisions checked against DB)
  let code = generateShareCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.publicShareToken, code))
      .limit(1);
    if (!existing) break;
    code = generateShareCode();
  }

  // Overwrite the old token — this deactivates any previously shared link
  await db
    .update(schema.users)
    .set({ publicShareToken: code })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ token: code, url: `/${nameSlug}/${code}/public` });
}

// DELETE /api/share/generate — disable sharing (clears the token)
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(schema.users)
    .set({ publicShareToken: null })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true });
}

// GET /api/share/generate — check if sharing is enabled and get current token
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [user] = await db
      .select({
        publicShareToken: schema.users.publicShareToken,
        displayName: schema.users.displayName,
        shareFutureDays: schema.users.shareFutureDays,
        sharePastDays: schema.users.sharePastDays,
        shareShowEvents: schema.users.shareShowEvents,
        shareShowEventDetails: schema.users.shareShowEventDetails,
        shareShowPrayerTimes: schema.users.shareShowPrayerTimes,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const nameSlug = slugifyName(user.displayName || "shared");

    return NextResponse.json({
      enabled: !!user.publicShareToken,
      token: user.publicShareToken,
      url: user.publicShareToken ? `/${nameSlug}/${user.publicShareToken}/public` : null,
      settings: {
        futureDays: user.shareFutureDays,
        pastDays: user.sharePastDays,
        showEvents: user.shareShowEvents,
        showEventDetails: user.shareShowEventDetails,
        showPrayerTimes: user.shareShowPrayerTimes,
      },
    });
  } catch (err) {
    logError(err, { route: "share/generate GET" });
    return NextResponse.json({ error: "Failed to load share status." }, { status: 500 });
  }
}

// Allowed visibility ranges. Days are clamped to these values server-side so
// a crafted request can't widen the public window.
const FUTURE_DAY_OPTIONS = [7, 14, 30, 60, 90];
const PAST_DAY_OPTIONS = [0, 7, 14, 30];

// PATCH /api/share/generate — update visibility settings on the existing link.
// Applies immediately: public routes read these fields on every request.
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("share-settings", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const updates: Partial<{
    shareFutureDays: number;
    sharePastDays: number;
    shareShowEvents: boolean;
    shareShowEventDetails: boolean;
    shareShowPrayerTimes: boolean;
  }> = {};

  if (body.futureDays !== undefined) {
    if (typeof body.futureDays !== "number" || !FUTURE_DAY_OPTIONS.includes(body.futureDays)) {
      return NextResponse.json({ error: "futureDays must be one of 7, 14, 30, 60, 90." }, { status: 400 });
    }
    updates.shareFutureDays = body.futureDays;
  }
  if (body.pastDays !== undefined) {
    if (typeof body.pastDays !== "number" || !PAST_DAY_OPTIONS.includes(body.pastDays)) {
      return NextResponse.json({ error: "pastDays must be one of 0, 7, 14, 30." }, { status: 400 });
    }
    updates.sharePastDays = body.pastDays;
  }
  if (body.showEvents !== undefined) {
    if (typeof body.showEvents !== "boolean") {
      return NextResponse.json({ error: "showEvents must be a boolean." }, { status: 400 });
    }
    updates.shareShowEvents = body.showEvents;
  }
  if (body.showEventDetails !== undefined) {
    if (typeof body.showEventDetails !== "boolean") {
      return NextResponse.json({ error: "showEventDetails must be a boolean." }, { status: 400 });
    }
    updates.shareShowEventDetails = body.showEventDetails;
  }
  if (body.showPrayerTimes !== undefined) {
    if (typeof body.showPrayerTimes !== "boolean") {
      return NextResponse.json({ error: "showPrayerTimes must be a boolean." }, { status: 400 });
    }
    updates.shareShowPrayerTimes = body.showPrayerTimes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid settings provided." }, { status: 400 });
  }

  await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true, settings: updates });
}
