import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/prayer-groups/challenges — create a group challenge
// Body: { groupId, name, goalDays, startDate, endDate }
// A challenge = each member aims for `goalDays` complete days between the
// dates. Progress is computed from prayer_day_completions — no extra writes.
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-challenge-create", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { groupId, name, goalDays, startDate, endDate } = body as {
    groupId?: string; name?: string; goalDays?: number; startDate?: string; endDate?: string;
  };

  if (!groupId || !isValidUUID(groupId)) {
    return NextResponse.json({ error: "Invalid group." }, { status: 400 });
  }
  const trimmed = (name ?? "").trim().slice(0, 80);
  if (trimmed.length < 2) {
    return NextResponse.json({ error: "Challenge name must be at least 2 characters." }, { status: 400 });
  }
  const days = Math.floor(Number(goalDays));
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return NextResponse.json({ error: "Goal must be between 1 and 90 days." }, { status: 400 });
  }
  if (!startDate || !DATE_RE.test(startDate) || !endDate || !DATE_RE.test(endDate) || startDate > endDate) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const spanDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000 + 1;
  if (spanDays > 90) {
    return NextResponse.json({ error: "Challenges can span at most 90 days." }, { status: 400 });
  }
  if (days > spanDays) {
    return NextResponse.json({ error: "Goal can't exceed the challenge length." }, { status: 400 });
  }

  try {
    const [membership] = await db
      .select({ role: schema.prayerGroupMembers.role })
      .from(schema.prayerGroupMembers)
      .where(
        and(
          eq(schema.prayerGroupMembers.groupId, groupId),
          eq(schema.prayerGroupMembers.userId, session.userId),
        ),
      )
      .limit(1);
    if (!membership) {
      return NextResponse.json({ error: "Not a member." }, { status: 403 });
    }

    const [challenge] = await db
      .insert(schema.prayerChallenges)
      .values({ groupId, creatorId: session.userId, name: trimmed, goalDays: days, startDate, endDate })
      .returning();

    return NextResponse.json(challenge, { status: 201 });
  } catch (err) {
    logError(err, { route: "prayer-groups/challenges" });
    return NextResponse.json({ error: "Could not create challenge." }, { status: 500 });
  }
}
