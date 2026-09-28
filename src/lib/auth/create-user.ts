import crypto from "crypto";
import { db, schema } from "@/lib/db/client";
import { getDeviceLabel } from "@/lib/auth/device-label";

/**
 * Create a user row with a unique 6-char prayer code for friend sharing.
 * Retries the INSERT on unique-violation (23505) so a check-then-insert
 * race can't slip through. Returns null only if every attempt collided.
 */
export async function createUserWithPrayerCode(
  email: string,
  passwordHash: string,
): Promise<{ id: string; email: string } | null> {
  for (let i = 0; i < 10; i++) {
    try {
      const [user] = await db
        .insert(schema.users)
        .values({ email, passwordHash, prayerCode: generatePrayerCode() })
        .returning({ id: schema.users.id, email: schema.users.email });
      return user ?? null;
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") continue;
      throw err;
    }
  }
  return null;
}

/** Mark a device fingerprint as trusted for the user (best-effort). */
export async function trustDevice(
  userId: string,
  fingerprintHash: string | null,
  userAgent: string | null,
): Promise<void> {
  if (!fingerprintHash) return;
  try {
    const deviceLabel = getDeviceLabel(userAgent);
    await db
      .insert(schema.trustedDevices)
      .values({ userId, fingerprintHash, label: deviceLabel })
      .onConflictDoUpdate({
        target: [schema.trustedDevices.userId, schema.trustedDevices.fingerprintHash],
        set: { lastUsedAt: new Date(), label: deviceLabel },
      });
  } catch {
    // Non-critical — device trust is a convenience
  }
}

// Random 6-char prayer code (uppercase + digits, no ambiguous chars)
function generatePrayerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}
