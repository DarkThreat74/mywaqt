import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST { friendId, nickname?, hiddenFromLeague? } — owner-side prefs on a
 * friendship row. `nickname` is "how I saved them" (private label); the
 * `hiddenFromLeague` flag drops them from the weekly leaderboard without
 * unfriending. Both are viewer-private — never shown to the friend.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("pf-nickname", ip, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { friendId, nickname, hiddenFromLeague } = body as {
    friendId?: string;
    nickname?: string;
    hiddenFromLeague?: boolean;
  };

  if (typeof friendId !== "string" || !isValidUUID(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }
  if (nickname === undefined && hiddenFromLeague === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updates: { nickname?: string | null; hiddenFromLeague?: boolean } = {};
  if (nickname !== undefined) {
    const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 40) : "";
    updates.nickname = trimmed || null;
  }
  if (hiddenFromLeague !== undefined) {
    updates.hiddenFromLeague = Boolean(hiddenFromLeague);
  }

  const updated = await db
    .update(schema.prayerFriends)
    .set(updates)
    .where(and(
      eq(schema.prayerFriends.userId, session.userId),
      eq(schema.prayerFriends.friendId, friendId),
      eq(schema.prayerFriends.status, "accepted"),
    ))
    .returning({ id: schema.prayerFriends.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Friendship not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...updates });
}
