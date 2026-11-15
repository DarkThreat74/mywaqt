import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimitAsync } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET /api/auth/trusted-devices — list the current user's trusted devices
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!await checkRateLimitAsync("trusted-devices-read", ip, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const devices = await db
    .select({
      id: schema.trustedDevices.id,
      label: schema.trustedDevices.label,
      createdAt: schema.trustedDevices.createdAt,
      lastUsedAt: schema.trustedDevices.lastUsedAt,
    })
    .from(schema.trustedDevices)
    .where(eq(schema.trustedDevices.userId, session.userId))
    .orderBy(desc(schema.trustedDevices.lastUsedAt));

  return NextResponse.json({ devices });
}

// DELETE /api/auth/trusted-devices?id=... — remove a trusted device
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!await checkRateLimitAsync("trusted-devices-delete", ip, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("id");
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  // Ensure the device belongs to the current user (prevent IDOR)
  const [device] = await db
    .select({ userId: schema.trustedDevices.userId })
    .from(schema.trustedDevices)
    .where(and(
      eq(schema.trustedDevices.id, deviceId),
      eq(schema.trustedDevices.userId, session.userId),
    ))
    .limit(1);

  if (!device) {
    return NextResponse.json({ error: "Device not found." }, { status: 404 });
  }

  await db
    .delete(schema.trustedDevices)
    .where(and(
      eq(schema.trustedDevices.id, deviceId),
      eq(schema.trustedDevices.userId, session.userId),
    ));

  return NextResponse.json({ ok: true });
}
