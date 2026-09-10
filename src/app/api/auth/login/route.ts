import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { setSessionCookie } from "@/lib/auth/session";
import { isValidEmail, isHoneypotTripped, isTimeTrapTripped, isValidFingerprintHash } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { getDeviceLabel } from "@/lib/auth/device-label";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// Per-account brute-force protection: after 10 failed attempts in 15 min,
// the account is locked. This is DB-backed so it survives serverless cold
// starts and is shared across all Vercel function instances.
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
  // ── Rate limit: 5 login attempts per 15 min per IP ──
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("login", ip, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  // ── Parse body ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, password, fingerprintHash, website, company, renderedAt } = body as {
    email?: string; password?: string; fingerprintHash?: string;
    website?: string; company?: string; renderedAt?: number;
  };

  // ── Honeypot check — if filled, reject as bot ──
  if (isHoneypotTripped({ website, company })) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // ── Time-trap — bots submit in <2s ──
  // Note: renderedAt = -1 means the client hasn't mounted yet (useEffect hasn't run).
  // Treat -1 as valid (not a bot) to avoid false positives on fast connections.
  if (renderedAt !== undefined && renderedAt !== -1 && isTimeTrapTripped(renderedAt, 2)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // ── Per-account brute-force check (DB-backed) ──
  // Count recent failed attempts for this email. If >= MAX, lock the account.
  const lockoutCutoff = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const recentFailures = await db
    .select({ id: schema.loginAttempts.id })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.email, normalizedEmail),
        gt(schema.loginAttempts.failedAt, lockoutCutoff),
      ),
    )
    .limit(MAX_FAILED_ATTEMPTS + 1);

  if (recentFailures.length >= MAX_FAILED_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again in 15 minutes." },
      { status: 429 },
    );
  }

  // ── Look up user ──
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, passwordHash: schema.users.passwordHash, role: schema.users.role, firstName: schema.users.firstName })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    // Record failed attempt for email enumeration protection
    await db.insert(schema.loginAttempts).values({ email: normalizedEmail });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // ── Trusted device check ──
  // If a fingerprint hash is provided and matches a trusted device,
  // allow login without a password.
  const validFingerprint = fingerprintHash && typeof fingerprintHash === "string" && isValidFingerprintHash(fingerprintHash);
  if (validFingerprint) {
    const [trusted] = await db
      .select({ id: schema.trustedDevices.id })
      .from(schema.trustedDevices)
      .where(and(
        eq(schema.trustedDevices.userId, user.id),
        eq(schema.trustedDevices.fingerprintHash, fingerprintHash),
      ))
      .limit(1);

    if (trusted) {
      // Update lastUsedAt — fire and forget, don't block login
      db.update(schema.trustedDevices)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.trustedDevices.id, trusted.id))
        .then(() => {})
        .catch(() => {});

      // Clear failed attempts on successful trusted-device login
      await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.email, normalizedEmail));

      await setSessionCookie({ id: user.id, email: user.email });
      return NextResponse.json({ ok: true, trustedDevice: true });
    }
  }

  // ── Password verification ──
  if (!password) {
    await db.insert(schema.loginAttempts).values({ email: normalizedEmail });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    await db.insert(schema.loginAttempts).values({ email: normalizedEmail });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // ── Clear failed attempts on successful password login ──
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.email, normalizedEmail));

  // ── Set session ──
  await setSessionCookie({ id: user.id, email: user.email });

  // ── Trust this device if fingerprint provided ──
  // Uses onConflictDoUpdate to upsert in a single query (no check-then-insert race)
  if (validFingerprint) {
    try {
      const deviceLabel = getDeviceLabel(request.headers.get('user-agent'));

      // ── Trusted device limit: max 10 per user ──
      // If at limit, delete the oldest device before adding the new one
      const existingDevices = await db
        .select({ id: schema.trustedDevices.id })
        .from(schema.trustedDevices)
        .where(eq(schema.trustedDevices.userId, user.id))
        .orderBy(schema.trustedDevices.lastUsedAt);

      if (existingDevices.length >= 10) {
        // Delete the least recently used device
        await db
          .delete(schema.trustedDevices)
          .where(eq(schema.trustedDevices.id, existingDevices[0].id));
      }

      await db
        .insert(schema.trustedDevices)
        .values({
          userId: user.id,
          fingerprintHash,
          label: deviceLabel,
        })
        .onConflictDoUpdate({
          target: [schema.trustedDevices.userId, schema.trustedDevices.fingerprintHash],
          set: { lastUsedAt: new Date(), label: deviceLabel },
        });
    } catch {
      // Non-critical — device trust is a convenience, not a security requirement
    }
  }

  return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "auth/login" });
    return NextResponse.json(
      { error: "Could not sign in. Please try again." },
      { status: 500 },
    );
  }
}
