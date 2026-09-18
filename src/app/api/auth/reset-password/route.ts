import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { isValidEmail, isHoneypotTripped, isTimeTrapTripped } from "@/lib/validation";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/**
 * Token-based password reset — email-link flow.
 *
 * The previous flow let anyone reset any account's password knowing only the
 * email (unauthenticated account takeover). Now:
 *   - "request" → creates a single-use token (SHA-256 hashed at rest, 30-min
 *     expiry), emails a reset link. Response is identical whether or not the
 *     account exists — no enumeration oracle.
 *   - "reset" → requires the emailed token; on success it invalidates ALL
 *     existing sessions (sessionsValidAfter cutoff) and revokes every trusted
 *     device, so a compromised account is actually recovered.
 *
 * Mitigations: IP rate limit, honeypot, time-trap, password strength rules.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GENERIC_OK = { ok: true, message: "If an account exists for that email, a reset link is on its way." };

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("reset-password", ip, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { action, email, token, password, confirm, website, company, renderedAt } = body as {
      action?: string;
      email?: string;
      token?: string;
      password?: string;
      confirm?: string;
      website?: string;
      company?: string;
      renderedAt?: number;
    };

    if (isHoneypotTripped({ website, company })) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (renderedAt !== undefined && renderedAt !== -1 && isTimeTrapTripped(renderedAt, 2)) {
      return NextResponse.json(
        { error: "Please take a moment to fill out the form." },
        { status: 400 },
      );
    }

    // ── Action: request a reset link ──
    if (action === "request") {
      const normalizedEmail = email?.trim().toLowerCase();
      if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
        // Same response shape — don't reveal anything about validity/existence
        return NextResponse.json(GENERIC_OK);
      }

      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);

      if (user) {
        // Invalidate older unused tokens for this user (only one live link)
        await db
          .delete(schema.passwordResetTokens)
          .where(
            and(
              eq(schema.passwordResetTokens.userId, user.id),
              isNull(schema.passwordResetTokens.usedAt),
            ),
          );

        const rawToken = crypto.randomBytes(32).toString("hex");
        await db.insert(schema.passwordResetTokens).values({
          userId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        });

        const resetUrl = `${env.appUrl}/reset?token=${rawToken}`;
        const sent = await sendEmail({
          to: normalizedEmail,
          subject: "Reset your Waqt password",
          text:
            `Someone requested a password reset for your Waqt account.\n\n` +
            `Reset link (expires in 30 minutes):\n${resetUrl}\n\n` +
            `If this wasn't you, you can ignore this email — your password hasn't changed.`,
        });
        if (!sent) {
          logError(new Error("Reset email not sent — email provider unconfigured or failed"), {
            route: "auth/reset-password",
          });
        }
      }

      return NextResponse.json(GENERIC_OK);
    }

    // ── Action: consume a reset token ──
    if (action === "reset") {
      if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
        return NextResponse.json(
          { error: "This reset link is invalid or has expired." },
          { status: 400 },
        );
      }
      if (!password || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters with a letter and a number." },
          { status: 400 },
        );
      }
      if (!confirm || confirm !== password) {
        return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
      }

      const [row] = await db
        .select({
          id: schema.passwordResetTokens.id,
          userId: schema.passwordResetTokens.userId,
        })
        .from(schema.passwordResetTokens)
        .where(
          and(
            eq(schema.passwordResetTokens.tokenHash, sha256(token)),
            isNull(schema.passwordResetTokens.usedAt),
            gt(schema.passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!row) {
        return NextResponse.json(
          { error: "This reset link is invalid or has expired." },
          { status: 400 },
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const now = new Date();

      // Mark token used, set new password, invalidate all existing sessions,
      // and revoke trusted devices — a real recovery, not just a password swap.
      await Promise.all([
        db
          .update(schema.passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(schema.passwordResetTokens.id, row.id)),
        db
          .update(schema.users)
          .set({ passwordHash, sessionsValidAfter: now })
          .where(eq(schema.users.id, row.userId)),
        db
          .delete(schema.trustedDevices)
          .where(eq(schema.trustedDevices.userId, row.userId)),
      ]);

      // Drop the cached sessionsValidAfter so revocation applies immediately
      // instead of waiting out the 60s cache TTL.
      revalidateTag(`sva-${row.userId}`, "expire");

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'request' or 'reset'." },
      { status: 400 },
    );
  } catch (err) {
    logError(err, { route: "auth/reset-password" });
    return NextResponse.json(
      { error: "Could not reset password. Please try again." },
      { status: 500 },
    );
  }
}
