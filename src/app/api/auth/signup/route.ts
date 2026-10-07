import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { isValidEmail, isHoneypotTripped, isTimeTrapTripped, isValidFingerprintHash } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { createUserWithPrayerCode, trustDevice } from "@/lib/auth/create-user";
import { env } from "@/lib/env";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
  // ── Rate limit: 5/15min per IP (burst) + 3/hour per IP (slow burn) ──
  // Bots solving the captcha still can't mint accounts faster than this.
  const ip = getClientIp(request.headers);
  if (
    !checkRateLimit("signup", ip, 5, 15 * 60 * 1000) ||
    !checkRateLimit("signup-hourly", ip, 3, 60 * 60 * 1000)
  ) {
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

  const { email, password, turnstileToken, fingerprintHash, website, company, renderedAt } = body as {
    email?: string;
    password?: string;
    turnstileToken?: string;
    fingerprintHash?: string;
    website?: string;
    company?: string;
    renderedAt?: number;
  };

  // ── Cloudflare Turnstile verification (server-side, authoritative) ──
  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip, "signup");
  if (!turnstileValid) {
    return NextResponse.json(
      { error: "Security verification failed. Please try again." },
      { status: 403 },
    );
  }

  // ── Honeypot check — if filled, reject as bot ──
  if (isHoneypotTripped({ website, company })) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  // ── Time-trap — bots submit in <2s ──
  // Note: renderedAt = -1 means the client hasn't mounted yet (useEffect hasn't run).
  // Treat -1 as valid (not a bot) to avoid false positives on fast connections.
  if (renderedAt !== undefined && renderedAt !== -1 && isTimeTrapTripped(renderedAt, 2)) {
    return NextResponse.json(
      { error: "Please take a moment to fill out the form." },
      { status: 400 },
    );
  }

  // ── Validate email ──
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 },
    );
  }

  // ── Validate password ──
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (!/[a-zA-Z]/.test(password)) {
    return NextResponse.json(
      { error: "Password must contain at least one letter." },
      { status: 400 },
    );
  }
  if (!/[0-9]/.test(password)) {
    return NextResponse.json(
      { error: "Password must contain at least one number." },
      { status: 400 },
    );
  }

  // ── Anti-enumeration signup ──
  // The response is identical whether the email is free or registered —
  // no enumeration oracle. Two modes depending on whether email sending
  // is configured (RESEND_API_KEY):
  //   ON  — verify-email-first: the account is only created when the emailed
  //         link is clicked (see /api/auth/signup/verify).
  //   OFF — the account is created immediately but NO session is issued;
  //         the user signs in themselves. Same generic response either way,
  //         so existence still can't be probed.
  const emailVerificationEnabled = !!env.resendApiKey;
  const GENERIC_OK = {
    ok: true,
    message: emailVerificationEnabled
      ? "Check your email for a link to finish creating your account."
      : "If this email isn't already registered, your account is ready — sign in to continue.",
  };

  // ── Per-email burn — the same address can't retry more than 3/hour,
  // regardless of IP. Checked before any DB work. ──
  if (!checkRateLimit(`signup-email:${normalizedEmail}`, normalizedEmail, 3, 60 * 60 * 1000)) {
    return NextResponse.json(GENERIC_OK); // generic — don't leak the throttle exists
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    // Registered email → send a notice to the owner if we can, same response.
    if (emailVerificationEnabled) {
      await sendEmail({
        to: normalizedEmail,
        subject: "Someone tried to sign up with your email",
        text:
          `Someone just tried to create a Waqt account with this email address.\n\n` +
          `If it was you, sign in instead — or use "Forgot password" on the login page if you need to reset it.\n\n` +
          `If it wasn't you, you can ignore this email — no account was created and nothing changed.`,
      });
    }
    return NextResponse.json(GENERIC_OK);
  }

  // Email off → create the account now; user signs in via /login.
  if (!emailVerificationEnabled) {
    const user = await createUserWithPrayerCode(normalizedEmail, passwordHash);
    if (!user) {
      return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
    }
    await trustDevice(
      user.id,
      fingerprintHash && isValidFingerprintHash(fingerprintHash) ? fingerprintHash : null,
      request.headers.get("user-agent"),
    );
    return NextResponse.json(GENERIC_OK);
  }

  // Pending signup — one row per email; a re-signup atomically overwrites
  // and invalidates the previous link (token_hash is unique).
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const fp = fingerprintHash && isValidFingerprintHash(fingerprintHash) ? fingerprintHash : null;
  await db
    .insert(schema.pendingSignups)
    .values({ email: normalizedEmail, passwordHash, tokenHash, fingerprintHash: fp, expiresAt })
    .onConflictDoUpdate({
      target: schema.pendingSignups.email,
      set: { passwordHash, tokenHash, fingerprintHash: fp, expiresAt },
    });

  const verifyUrl = `${env.appUrl}/signup/verify?token=${rawToken}`;
  const sent = await sendEmail({
    to: normalizedEmail,
    subject: "Confirm your Waqt account",
    text:
      `Confirm your email to finish creating your Waqt account.\n\n` +
      `Confirmation link (expires in 24 hours):\n${verifyUrl}\n\n` +
      `If you didn't sign up for Waqt, you can ignore this email — no account will be created.`,
  });
  if (!sent) {
    logError(new Error("Signup confirmation email not sent — email provider unconfigured or failed"), {
      route: "auth/signup",
    });
  }

  return NextResponse.json(GENERIC_OK);
  } catch (err) {
    logError(err, { route: "auth/signup" });
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 },
    );
  }
}
