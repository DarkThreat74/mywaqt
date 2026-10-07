import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST { friendId, nickname } — the owner-side label for a friend ("save
 * Mahmud as Muhammad"). Lives on the friendship row: private to the viewer,
 * never shown to the friend. Empty string clears it.
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
  const { friendId, nickname } = body as { friendId?: string; nickname?: string };

  if (typeof friendId !== "string" || !isValidUUID(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }
  const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 40) : "";

  const updated = await db
    .update(schema.prayerFriends)
    .set({ nickname: trimmed || null })
    .where(and(
      eq(schema.prayerFriends.userId, session.userId),
      eq(schema.prayerFriends.friendId, friendId),
      eq(schema.prayerFriends.status, "accepted"),
    ))
    .returning({ id: schema.prayerFriends.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Friendship not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, nickname: trimmed || null });
}
