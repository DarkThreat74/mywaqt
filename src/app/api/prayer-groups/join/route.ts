import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const MAX_GROUPS_PER_USER = 10;
const MAX_GROUP_MEMBERS = 20;

// POST /api/prayer-groups/join — join a group by invite code
// Body: { code: string }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  // Tight limit — guessing codes must be expensive
  if (!checkRateLimit("prayer-group-join", ip, 15, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { code } = body as { code?: string };
  const trimmed = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(trimmed)) {
    return NextResponse.json({ error: "Invalid group code." }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(schema.prayerGroups)
      .where(eq(schema.prayerGroups.inviteCode, trimmed))
      .limit(1);
    if (!group) {
      return NextResponse.json({ error: "No group found with that code." }, { status: 404 });
    }

    const [myGroups, members] = await Promise.all([
      db
        .select({ groupId: schema.prayerGroupMembers.groupId })
        .from(schema.prayerGroupMembers)
        .where(eq(schema.prayerGroupMembers.userId, session.userId))
        .limit(MAX_GROUPS_PER_USER + 1),
      db
        .select({ userId: schema.prayerGroupMembers.userId })
        .from(schema.prayerGroupMembers)
        .where(eq(schema.prayerGroupMembers.groupId, group.id))
        .limit(MAX_GROUP_MEMBERS + 1),
    ]);

    if (myGroups.length >= MAX_GROUPS_PER_USER) {
      return NextResponse.json({ error: `You can join at most ${MAX_GROUPS_PER_USER} groups.` }, { status: 429 });
    }
    if (members.some((m) => m.userId === session.userId)) {
      return NextResponse.json({ error: "You're already in this group." }, { status: 409 });
    }
    if (members.length >= MAX_GROUP_MEMBERS) {
      return NextResponse.json({ error: "This group is full." }, { status: 429 });
    }

    await db
      .insert(schema.prayerGroupMembers)
      .values({ groupId: group.id, userId: session.userId, role: "member" })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, group: { id: group.id, name: group.name } });
  } catch (err) {
    logError(err, { route: "prayer-groups/join" });
    return NextResponse.json({ error: "Could not join group." }, { status: 500 });
  }
}
