import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// POST — remove a push subscription (scoped to current user).
// Accepts:
//   1. Web Push: { endpoint }
//   2. Native:   { token, platform }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("push-unsubscribe", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { endpoint, token, platform } = body as {
    endpoint?: string;
    token?: string;
    platform?: string;
  };

  // Native token deletion
  if (token && platform) {
    await db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, session.userId),
          eq(schema.pushSubscriptions.platform, platform),
          eq(schema.pushSubscriptions.token, token),
        ),
      );
    return NextResponse.json({ ok: true });
  }

  // Web Push endpoint deletion (existing behavior)
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
  }

  // Scope deletion to the current user — prevents cross-user deletion
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, session.userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    );

  return NextResponse.json({ ok: true });
}
