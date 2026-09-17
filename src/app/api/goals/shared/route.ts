import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/logError";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/goals/shared?token=<token> — public read-only goals by share token
 * No auth required — anyone with the token can view the goals.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("goals-shared", ip, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find the share token
    const [shareToken] = await db
      .select()
      .from(schema.goalShareTokens)
      .where(eq(schema.goalShareTokens.token, token))
      .limit(1);

    if (!shareToken) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    // Fetch the user's display name for the shared page
    const [user] = await db
      .select({ displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, shareToken.userId))
      .limit(1);

    // Fetch all goals for this user — explicit projection, never leak userId
    const rows = await db
      .select({
        id: schema.goals.id,
        parentId: schema.goals.parentId,
        title: schema.goals.title,
        description: schema.goals.description,
        status: schema.goals.status,
        color: schema.goals.color,
        goalType: schema.goals.goalType,
        targetDate: schema.goals.targetDate,
        sortOrder: schema.goals.sortOrder,
        completedAt: schema.goals.completedAt,
      })
      .from(schema.goals)
      .where(eq(schema.goals.userId, shareToken.userId))
      .orderBy(schema.goals.sortOrder, schema.goals.createdAt)
      .limit(500);

    return NextResponse.json({
      goals: rows,
      ownerName: user?.displayName || "Someone",
    });
  } catch (err) {
    logError(err, { route: "goals/shared" });
    return NextResponse.json({ error: "Failed to fetch shared goals" }, { status: 500 });
  }
}
