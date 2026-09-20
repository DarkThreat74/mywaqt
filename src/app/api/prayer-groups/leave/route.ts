import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// POST /api/prayer-groups/leave — leave a group, or owner removes a member
// Body: { groupId: string, memberId?: string }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-group-leave", ip, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { groupId, memberId } = body as { groupId?: string; memberId?: string };
  if (!groupId || !isValidUUID(groupId)) {
    return NextResponse.json({ error: "Invalid group." }, { status: 400 });
  }
  const targetId = memberId ?? session.userId;
  if (memberId && !isValidUUID(memberId)) {
    return NextResponse.json({ error: "Invalid member." }, { status: 400 });
  }

  try {
    const [myMembership] = await db
      .select({ role: schema.prayerGroupMembers.role })
      .from(schema.prayerGroupMembers)
      .where(
        and(
          eq(schema.prayerGroupMembers.groupId, groupId),
          eq(schema.prayerGroupMembers.userId, session.userId),
        ),
      )
      .limit(1);
    if (!myMembership) {
      return NextResponse.json({ error: "Not a member." }, { status: 403 });
    }

    // Removing someone else requires owner role; an owner can't remove themselves
    if (targetId !== session.userId && myMembership.role !== "owner") {
      return NextResponse.json({ error: "Only the group owner can remove members." }, { status: 403 });
    }

    await db
      .delete(schema.prayerGroupMembers)
      .where(
        and(
          eq(schema.prayerGroupMembers.groupId, groupId),
          eq(schema.prayerGroupMembers.userId, targetId),
        ),
      );

    // If the owner left and members remain, promote the earliest member
    if (targetId === session.userId && myMembership.role === "owner") {
      const [next] = await db
        .select({ userId: schema.prayerGroupMembers.userId })
        .from(schema.prayerGroupMembers)
        .where(eq(schema.prayerGroupMembers.groupId, groupId))
        .orderBy(schema.prayerGroupMembers.joinedAt)
        .limit(1);
      if (next) {
        await db
          .update(schema.prayerGroupMembers)
          .set({ role: "owner" })
          .where(
            and(
              eq(schema.prayerGroupMembers.groupId, groupId),
              eq(schema.prayerGroupMembers.userId, next.userId),
            ),
          );
      } else {
        // Empty group — delete it and its challenges
        await db.delete(schema.prayerGroups).where(eq(schema.prayerGroups.id, groupId));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "prayer-groups/leave" });
    return NextResponse.json({ error: "Could not leave group." }, { status: 500 });
  }
}
