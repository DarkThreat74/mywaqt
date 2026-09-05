import { NextRequest, NextResponse } from "next/server";
import { count, desc, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// GET /api/admin/users — paginated list of non-admin users with stats
// Query params: ?page=1 (default 1), ?pageSize=50 (max 100)
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || String(PAGE_SIZE), 10)));
    const offset = (page - 1) * pageSize;

    // Paginated user query — show ALL users including admins
    const users = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        displayName: schema.users.displayName,
        createdAt: schema.users.createdAt,
        role: schema.users.role,
      })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt))
      .limit(pageSize)
      .offset(offset);

    // Get total count for pagination (all users)
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.users);

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      return NextResponse.json({ users: [], total: 0, page, pageSize, totalPages: 0 });
    }

    // Batch queries using inArray (safe with ≤100 IDs per page)
    const logStats = await db
      .select({
        userId: schema.prayerLog.userId,
        totalLogs: count(),
        lastCheckin: sql<Date>`max(${schema.prayerLog.lastCheckinAt})`,
        prayedCount: sql<number>`count(*) filter (where ${schema.prayerLog.status} = 'prayed')`,
      })
      .from(schema.prayerLog)
      .where(inArray(schema.prayerLog.userId, userIds))
      .groupBy(schema.prayerLog.userId);

    const eventStats = await db
      .select({
        userId: schema.events.userId,
        eventCount: count(),
      })
      .from(schema.events)
      .where(inArray(schema.events.userId, userIds))
      .groupBy(schema.events.userId);

    const friendStats = await db
      .select({
        userId: schema.prayerFriends.userId,
        friendCount: count(),
      })
      .from(schema.prayerFriends)
      .where(inArray(schema.prayerFriends.userId, userIds))
      .groupBy(schema.prayerFriends.userId);

    const logMap = new Map(logStats.map((l) => [l.userId, l]));
    const eventMap = new Map(eventStats.map((e) => [e.userId, e.eventCount]));
    const friendMap = new Map(friendStats.map((f) => [f.userId, f.friendCount]));

    const usersWithStats = users.map((u) => {
      const log = logMap.get(u.id);
      return {
        ...u,
        prayerLogCount: log?.totalLogs ?? 0,
        prayedCount: log?.prayedCount ?? 0,
        lastCheckin: log?.lastCheckin ?? null,
        eventCount: eventMap.get(u.id) ?? 0,
        friendCount: friendMap.get(u.id) ?? 0,
      };
    });

    return NextResponse.json({
      users: usersWithStats,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/users" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
