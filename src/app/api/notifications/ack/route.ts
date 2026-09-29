import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

// POST /api/notifications/ack — acknowledge a notification row (it stops
// surfacing in the toast tray).
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit("notif-ack", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: { id?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !isValidUUID(body.id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await db
    .update(schema.appNotifications)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(schema.appNotifications.id, body.id),
        eq(schema.appNotifications.userId, session.userId),
      ),
    );

  return NextResponse.json({ ok: true });
}
