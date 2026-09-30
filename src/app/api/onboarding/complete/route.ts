import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("onboarding-complete", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Parse body for optional displayName
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { displayName } = body as { displayName?: string };

  // Validate and sanitize display name if provided
  const trimmedName = displayName?.trim();
  if (trimmedName && trimmedName.length > 50) {
    return NextResponse.json({ error: "Name must be 50 characters or less." }, { status: 400 });
  }

  await db
    .update(schema.users)
    .set({
      onboardingCompleted: true,
      // Keep the legacy first_name column in sync — every display path
      // reads firstName || displayName, so a stale first name shadows this.
      ...(trimmedName ? { displayName: trimmedName, firstName: trimmedName } : {}),
    })
    .where(eq(schema.users.id, session.userId));

  return NextResponse.json({ ok: true });
}
