import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Friends activation — opt-in gate. Until a user activates, nobody can add
 * them and they can't add anyone. Users with an existing friendship are
 * treated as activated (grandfathered) — the flag just makes it explicit.
 *
 * GET  → { active: boolean }
 * POST → activate, idempotent
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, friendship] = await Promise.all([
    db
      .select({ friendsActive: schema.prayerSettings.friendsActive })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1),
    db
      .select({ id: schema.prayerFriends.id })
      .from(schema.prayerFriends)
      .where(eq(schema.prayerFriends.userId, session.userId))
      .limit(1),
  ]);

  return NextResponse.json({ active: (settings[0]?.friendsActive ?? false) || friendship.length > 0 });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit("pf-activate", getClientIp(request.headers), 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // prayer_settings exists once onboarding completes — update only, never
  // create a shell row (a 0/0 UTC settings row would corrupt prayer times).
  const updated = await db
    .update(schema.prayerSettings)
    .set({ friendsActive: true })
    .where(eq(schema.prayerSettings.userId, session.userId))
    .returning({ userId: schema.prayerSettings.userId });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Finish onboarding first." }, { status: 409 });
  }
  return NextResponse.json({ active: true });
}
