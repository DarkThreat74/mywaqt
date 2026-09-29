import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { FRIEND_REQUEST_TTL_MS } from "@/lib/friend-requests";

export const dynamic = "force-dynamic";

const SNOOZE_MS = 3 * 60 * 60 * 1000; // "answer later" resurfaces in 3h
const SNOOZE_CUTOFF_MS = 2 * 60 * 60 * 1000; // no dismiss in the last 2h of life

// POST /api/prayer-friends/snooze — recipient dismisses the request toast for
// 3h without answering. Refused inside the request's final 2 hours.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("pf-snooze", getClientIp(request.headers), 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { requestId?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.requestId !== "string" || !isValidUUID(body.requestId)) {
    return NextResponse.json({ error: "Invalid requestId." }, { status: 400 });
  }

  const [req] = await db
    .select()
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.id, body.requestId),
        eq(schema.prayerFriends.friendId, session.userId),
        eq(schema.prayerFriends.status, "pending"),
      ),
    )
    .limit(1);
  if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const lifeLeft = req.createdAt.getTime() + FRIEND_REQUEST_TTL_MS - Date.now();
  if (lifeLeft <= SNOOZE_CUTOFF_MS) {
    return NextResponse.json({ error: "This request expires soon — please answer it." }, { status: 409 });
  }

  await db
    .update(schema.prayerFriends)
    .set({ dismissedUntil: new Date(Date.now() + SNOOZE_MS) })
    .where(eq(schema.prayerFriends.id, req.id));

  return NextResponse.json({ ok: true });
}
