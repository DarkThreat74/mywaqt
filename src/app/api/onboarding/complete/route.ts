import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
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

  const { displayName, firstName, lastName, middleInitial } = body as {
    displayName?: string; firstName?: string; lastName?: string; middleInitial?: string;
  };

  // Validate and sanitize display name if provided
  const trimmedName = typeof displayName === "string" ? displayName.trim() : "";
  const trimmedFirst = typeof firstName === "string" ? firstName.trim() : "";
  const trimmedLast = typeof lastName === "string" ? lastName.trim() : "";
  const trimmedMiddle = typeof middleInitial === "string" ? middleInitial.trim().slice(0, 1) : "";
  if (trimmedName.length > 50 || trimmedFirst.length > 50 || trimmedLast.length > 50) {
    return NextResponse.json({ error: "Name must be 50 characters or less." }, { status: 400 });
  }

  await db
    .update(schema.users)
    .set({
      onboardingCompleted: true,
      onboardingStep: "done",
      // Keep the legacy first_name column in sync — every display path
      // reads firstName || displayName, so a stale first name shadows this.
      ...(trimmedName ? { displayName: trimmedName } : {}),
      ...(trimmedFirst ? { firstName: trimmedFirst } : trimmedName ? { firstName: trimmedName } : {}),
      ...(trimmedLast ? { lastName: trimmedLast } : {}),
      ...(trimmedMiddle ? { middleInitial: trimmedMiddle } : {}),
    })
    .where(eq(schema.users.id, session.userId));

  // Bust the cached onboarding gate — without this the layout keeps serving
  // completed=false for up to 60s and the guard loops the user back in.
  try { revalidateTag(`user-gate-${session.userId}`, "max"); } catch { /* non-critical */ }

  return NextResponse.json({ ok: true });
}
