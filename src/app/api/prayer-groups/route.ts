import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, gte } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const MAX_GROUPS_PER_USER = 10;

// GET /api/prayer-groups — my groups, each with member stats + challenges
//
// Privacy: members only ever see what each member shares with prayer friends
// (the same friendsSee* settings) — group membership never widens visibility.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const memberships = await db
      .select({
        groupId: schema.prayerGroupMembers.groupId,
        role: schema.prayerGroupMembers.role,
      })
      .from(schema.prayerGroupMembers)
      .where(eq(schema.prayerGroupMembers.userId, session.userId))
      .limit(MAX_GROUPS_PER_USER);

    if (memberships.length === 0) {
      return NextResponse.json([]);
    }

    const groupIds = memberships.map((m) => m.groupId);

    const [groups, allMembers, challenges] = await Promise.all([
      db
        .select()
        .from(schema.prayerGroups)
        .where(inArray(schema.prayerGroups.id, groupIds)),
      db
        .select({
          groupId: schema.prayerGroupMembers.groupId,
          userId: schema.prayerGroupMembers.userId,
          role: schema.prayerGroupMembers.role,
        })
        .from(schema.prayerGroupMembers)
        .where(inArray(schema.prayerGroupMembers.groupId, groupIds)),
      db
        .select()
        .from(schema.prayerChallenges)
        .where(inArray(schema.prayerChallenges.groupId, groupIds)),
    ]);

    const memberIds = [...new Set(allMembers.map((m) => m.userId))];

    const [memberUsers, memberSettings, weekCompletions] = await Promise.all([
      db
        .select({ id: schema.users.id, firstName: schema.users.firstName, displayName: schema.users.displayName })
        .from(schema.users)
        .where(inArray(schema.users.id, memberIds)),
      db
        .select({
          userId: schema.prayerSettings.userId,
          timezone: schema.prayerSettings.timezone,
          friendsSeeStreak: schema.prayerSettings.friendsSeeStreak,
          friendsSeeTodayStatus: schema.prayerSettings.friendsSeeTodayStatus,
        })
        .from(schema.prayerSettings)
        .where(inArray(schema.prayerSettings.userId, memberIds)),
      // Complete days per member — powers the group race AND challenge
      // progress. 95-day floor covers the max 90-day challenge span.
      // Bounded: at most 1 row per member per completed day.
      db
        .select({ userId: schema.prayerDayCompletions.userId, date: schema.prayerDayCompletions.date })
        .from(schema.prayerDayCompletions)
        .where(
          and(
            inArray(schema.prayerDayCompletions.userId, memberIds),
            gte(schema.prayerDayCompletions.date, new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
          ),
        ),
    ]);

    const userById = new Map(memberUsers.map((u) => [u.id, u]));
    const settingsById = new Map(memberSettings.map((s) => [s.userId, s]));
    const completionsByUser = new Map<string, Set<string>>();
    for (const c of weekCompletions) {
      const d = String(c.date);
      if (!completionsByUser.has(c.userId)) completionsByUser.set(c.userId, new Set());
      completionsByUser.get(c.userId)!.add(d);
    }

    const monday = weekStart(new Date());
    const today = new Date().toISOString().slice(0, 10);
    // "Today" for done-today badges is each member's own local date
    const todayByMember = new Map(
      memberIds.map((id) => [
        id,
        new Date().toLocaleDateString("en-CA", {
          timeZone: settingsById.get(id)?.timezone || "America/Chicago",
        }),
      ]),
    );

    const result = groups.map((g) => {
      const members = allMembers
        .filter((m) => m.groupId === g.id)
        .map((m) => {
          const u = userById.get(m.userId);
          const s = settingsById.get(m.userId);
          const dates = completionsByUser.get(m.userId) ?? new Set<string>();
          const weekDays = [...dates].filter((d) => d >= monday).length;
          return {
            id: m.userId,
            firstName: u?.firstName ?? null,
            displayName: u?.displayName ?? null,
            role: m.role,
            isMe: m.userId === session.userId,
            // Only exposed if the member shares stats with friends — same
            // defaults as the friends list when no settings row exists
            weekCompleteDays: (s?.friendsSeeStreak ?? true) ? weekDays : null,
            todayComplete: (s?.friendsSeeTodayStatus ?? false)
              ? dates.has(todayByMember.get(m.userId) ?? "")
              : null,
          };
        })
        .sort((a, b) => (b.weekCompleteDays ?? -1) - (a.weekCompleteDays ?? -1));

      const groupChallenges = challenges
        .filter((c) => c.groupId === g.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          goalDays: c.goalDays,
          startDate: c.startDate,
          endDate: c.endDate,
          active: c.startDate <= today && c.endDate >= today,
          progress: allMembers
            .filter((m) => m.groupId === g.id)
            .map((m) => ({
              userId: m.userId,
              // null = member keeps stats private — progress stays hidden
              days: (settingsById.get(m.userId)?.friendsSeeStreak ?? true)
                ? [...(completionsByUser.get(m.userId) ?? [])]
                    .filter((d) => d >= c.startDate && d <= c.endDate).length
                : null,
            })),
        }));

      return {
        id: g.id,
        name: g.name,
        inviteCode: g.inviteCode,
        myRole: memberships.find((m) => m.groupId === g.id)?.role ?? "member",
        members,
        challenges: groupChallenges,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logError(err, { route: "prayer-groups GET" });
    return NextResponse.json({ error: "Could not load groups." }, { status: 500 });
  }
}

// POST /api/prayer-groups — create a group
// Body: { name: string }
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("prayer-group-create", ip, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name } = body as { name?: string };
  const trimmed = (name ?? "").trim().slice(0, 60);
  if (trimmed.length < 2) {
    return NextResponse.json({ error: "Group name must be at least 2 characters." }, { status: 400 });
  }

  try {
    const myGroups = await db
      .select({ groupId: schema.prayerGroupMembers.groupId })
      .from(schema.prayerGroupMembers)
      .where(eq(schema.prayerGroupMembers.userId, session.userId))
      .limit(MAX_GROUPS_PER_USER + 1);
    if (myGroups.length >= MAX_GROUPS_PER_USER) {
      return NextResponse.json({ error: `You can join at most ${MAX_GROUPS_PER_USER} groups.` }, { status: 429 });
    }

    const inviteCode = randomBytes(5).toString("base64url").replace(/[-_]/g, "").slice(0, 8).toUpperCase();
    const [group] = await db
      .insert(schema.prayerGroups)
      .values({ name: trimmed, inviteCode, ownerId: session.userId })
      .returning();
    await db.insert(schema.prayerGroupMembers).values({
      groupId: group.id,
      userId: session.userId,
      role: "owner",
    });

    return NextResponse.json({ id: group.id, name: group.name, inviteCode: group.inviteCode }, { status: 201 });
  } catch (err) {
    logError(err, { route: "prayer-groups POST" });
    return NextResponse.json({ error: "Could not create group." }, { status: 500 });
  }
}

function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0=Sun
  x.setUTCDate(x.getUTCDate() - ((day + 6) % 7)); // back to Monday
  return x.toISOString().slice(0, 10);
}
