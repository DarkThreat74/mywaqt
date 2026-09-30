import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/messages/read { friendId } — mark all incoming messages read.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("messages", getClientIp(request.headers), 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { friendId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const friendId = typeof body.friendId === "string" ? body.friendId : "";
  if (!/^[0-9a-f-]{36}$/i.test(friendId)) {
    return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
  }

  try {
    await db
      .update(schema.friendMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.friendMessages.senderId, friendId),
          eq(schema.friendMessages.recipientId, session.userId),
          isNull(schema.friendMessages.readAt),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "messages/read" });
    return NextResponse.json({ error: "Could not mark read." }, { status: 500 });
  }
}
