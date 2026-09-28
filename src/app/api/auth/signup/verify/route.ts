import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { setSessionCookie } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { getDeviceLabel } from "@/lib/auth/device-label";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/auth/signup/verify — consume an emailed confirmation token and
// create the account. Body: { token }
// Single-use, SHA-256 hashed at rest, 24h expiry (set at signup).
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("signup-verify", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { token } = body as { token?: string };
    if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json({ error: "This confirmation link is invalid or has expired." }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [pending] = await db
      .select()
      .from(schema.pendingSignups)
      .where(
        and(
          eq(schema.pendingSignups.tokenHash, tokenHash),
          gt(schema.pendingSignups.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!pending) {
      return NextResponse.json(
        { error: "This confirmation link is invalid or has expired." },
        { status: 400 },
      );
    }

    // Race guard — someone may have completed signup for this email since
    // the link was sent. Delete the pending row either way.
    await db.delete(schema.pendingSignups).where(eq(schema.pendingSignups.email, pending.email));

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, pending.email))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "This email is already registered — sign in instead." },
        { status: 409 },
      );
    }

    // Unique 6-char prayer code for friend sharing
    let prayerCode = "";
    for (let i = 0; i < 10; i++) {
      prayerCode = generatePrayerCode();
      const [dupe] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.prayerCode, prayerCode))
        .limit(1);
      if (!dupe) break;
    }

    const [user] = await db
      .insert(schema.users)
      .values({ email: pending.email, passwordHash: pending.passwordHash, prayerCode })
      .returning({ id: schema.users.id, email: schema.users.email });

    if (!user) {
      return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
    }

    await setSessionCookie(user);

    // Trust the device fingerprint captured at signup
    if (pending.fingerprintHash) {
      try {
        const deviceLabel = getDeviceLabel(request.headers.get("user-agent"));
        await db
          .insert(schema.trustedDevices)
          .values({ userId: user.id, fingerprintHash: pending.fingerprintHash, label: deviceLabel })
          .onConflictDoUpdate({
            target: [schema.trustedDevices.userId, schema.trustedDevices.fingerprintHash],
            set: { lastUsedAt: new Date(), label: deviceLabel },
          });
      } catch {
        // Non-critical — device trust is a convenience
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "auth/signup/verify" });
    return NextResponse.json({ error: "Could not confirm your account. Please try again." }, { status: 500 });
  }
}

// Random 6-char prayer code (uppercase + digits, no ambiguous chars)
function generatePrayerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
