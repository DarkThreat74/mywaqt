import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { isValidEmail, isValidFingerprintHash } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST /api/auth/check-device — check if a device fingerprint is trusted for an email
// Body: { email: string, fingerprintHash: string }
// Returns: { trusted: boolean }
// This does NOT log the user in — it only checks. Login happens via /api/auth/login.
//
// Security: This route is designed to NOT reveal whether an email exists.
// - Invalid email or hash → immediate { trusted: false }
// - Valid email but user not found → same response shape, same DB query count
//   (we run a dummy query to equalize timing)
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("check-device", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, fingerprintHash } = body as { email?: string; fingerprintHash?: string };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return NextResponse.json({ trusted: false });
  }

  if (!fingerprintHash || typeof fingerprintHash !== "string" || !isValidFingerprintHash(fingerprintHash)) {
    return NextResponse.json({ trusted: false });
  }

  // Look up user by email
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    // Timing equalization: run a dummy query so the response time is similar
    // to the case where the user exists. This prevents email enumeration via timing.
    await db
      .select({ id: schema.trustedDevices.id })
      .from(schema.trustedDevices)
      .where(eq(schema.trustedDevices.fingerprintHash, fingerprintHash))
      .limit(1);
    return NextResponse.json({ trusted: false });
  }

  // Check if this fingerprint is trusted for this user
  const [trusted] = await db
    .select({ id: schema.trustedDevices.id })
    .from(schema.trustedDevices)
    .where(and(
      eq(schema.trustedDevices.userId, user.id),
      eq(schema.trustedDevices.fingerprintHash, fingerprintHash),
    ))
    .limit(1);

  return NextResponse.json({ trusted: !!trusted });
}
