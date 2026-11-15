import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logError } from "@/lib/logError";
import { getClientIp, checkRateLimitAsync } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/goals/share — generate or get existing share token
 * DELETE /api/goals/share — revoke share token
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!await checkRateLimitAsync("goals-share-post", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const session = await getSessionFromRequest(request as never);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if a token already exists
    const [existing] = await db
      .select()
      .from(schema.goalShareTokens)
      .where(eq(schema.goalShareTokens.userId, session.userId))
      .limit(1);

    if (existing) {
      const url = `${new URL(request.url).origin}/goals/shared/${existing.token}`;
      return NextResponse.json({ token: existing.token, url });
    }

    // Generate a new token
    const token = randomUUID();
    const [row] = await db
      .insert(schema.goalShareTokens)
      .values({ userId: session.userId, token })
      .returning();

    const url = `${new URL(request.url).origin}/goals/shared/${token}`;
    return NextResponse.json({ token: row.token, url });
  } catch (err) {
    logError(err, { route: "goals/share", method: "POST" });
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!await checkRateLimitAsync("goals-share-delete", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const session = await getSessionFromRequest(request as never);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(schema.goalShareTokens)
      .where(eq(schema.goalShareTokens.userId, session.userId));

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "goals/share", method: "DELETE" });
    return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 });
  }
}
