import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, inArray, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { calculateStreak } from "@/lib/prayer/checkin";

export const dynamic = "force-dynamic";

// GET /api/prayer-friends — list the current user's prayer friends with real metrics
//
// ─── Optimization ───
// Previously this route did 5 DB queries per friend (N+1). Now it batches all
// reads into 5 total queries using inArray, and limits the prayer-log lookback
// to 90 days so it can use the prayer_log_user_date_prayed_idx partial index.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const friendships = await db
    .select({
      friendId: schema.prayerFriends.friendId,
    })
    .from(schema.prayerFriends)
    .where(
      and(
        eq(schema.prayerFriends.userId, session.userId),
        eq(schema.prayerFriends.status, "accepted"),
      ),
    )
    .limit(100);

  if (friendships.length === 0) {
    return NextResponse.json([]);
  }

  const friendIds = friendships.map((f) => f.friendId);

  // 90-day lookback for history; 7-day for weekly count
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fromStr = ninetyDaysAgo.toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  // Settings first — each friend's timezone decides what "today" is for them,
  // which the reminders query below needs.
  const friendSettingsAll = await db
    .select({
      userId: schema.prayerSettings.userId,
      timezone: schema.prayerSettings.timezone,
      friendsSeeStreak: schema.prayerSettings.friendsSeeStreak,
      friendsSeeTodayStatus: schema.prayerSettings.friendsSeeTodayStatus,
      friendsSeeSunnah: schema.prayerSettings.friendsSeeSunnah,
      friendsSeeMasjidPct: schema.prayerSettings.friendsSeeMasjidPct,
    })
    .from(schema.prayerSettings)
    .where(inArray(schema.prayerSettings.userId, friendIds));

  const todayByUser = new Map(
    friendSettingsAll.map((s) => [
      s.userId,
      new Date().toLocaleDateString("en-CA", { timeZone: s.timezone || "America/Chicago" }),
    ]),
  );
  const distinctTodayStrs = [...new Set(todayByUser.values())];

  // Batch all reads in parallel (8 queries total, not 5 per friend)
  const [friendUsers, friendLogsAll, todayLogsAll, todaySunnahAll, remindersAll, streaksAll, cheersAll] =
    await Promise.all([
      db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          displayName: schema.users.displayName,
        })
        .from(schema.users)
        .where(inArray(schema.users.id, friendIds)),
      db
        .select({
          userId: schema.prayerLog.userId,
          date: schema.prayerLog.date,
          status: schema.prayerLog.status,
          wentToMasjid: schema.prayerLog.wentToMasjid,
        })
        .from(schema.prayerLog)
        .where(
          and(
            inArray(schema.prayerLog.userId, friendIds),
            gte(schema.prayerLog.date, fromStr),
          ),
        ),
      // Today's logs per friend — resolved below per timezone
      db
        .select({
          userId: schema.prayerLog.userId,
          date: schema.prayerLog.date,
          prayerName: schema.prayerLog.prayerName,
          status: schema.prayerLog.status,
        })
        .from(schema.prayerLog)
        .where(
          and(
            inArray(schema.prayerLog.userId, friendIds),
            gte(schema.prayerLog.date, weekAgoStr),
          ),
        ),
      db
        .select({ userId: schema.sunnahLog.userId, date: schema.sunnahLog.date, sunnahKey: schema.sunnahLog.sunnahKey })
        .from(schema.sunnahLog)
        .where(
          and(
            inArray(schema.sunnahLog.userId, friendIds),
            eq(schema.sunnahLog.prayed, true),
            gte(schema.sunnahLog.date, weekAgoStr),
          ),
        ),
      // Reminders I already sent today (per each friend's local date)
      db
        .select({
          recipientId: schema.prayerReminders.recipientId,
          date: schema.prayerReminders.date,
          prayerName: schema.prayerReminders.prayerName,
        })
        .from(schema.prayerReminders)
        .where(
          and(
            eq(schema.prayerReminders.senderId, session.userId),
            inArray(schema.prayerReminders.recipientId, friendIds),
            inArray(schema.prayerReminders.date, distinctTodayStrs.length ? distinctTodayStrs : ["9999-12-31"]),
          ),
        ),
      // Shared streaks for every pair (me, friend) — canonical low/high key
      db
        .select({
          userLowId: schema.prayerFriendStreaks.userLowId,
          userHighId: schema.prayerFriendStreaks.userHighId,
          streak: schema.prayerFriendStreaks.streak,
          bestStreak: schema.prayerFriendStreaks.bestStreak,
          lastDate: schema.prayerFriendStreaks.lastDate,
        })
        .from(schema.prayerFriendStreaks)
        .where(
          or(
            and(
              eq(schema.prayerFriendStreaks.userLowId, session.userId),
              inArray(schema.prayerFriendStreaks.userHighId, friendIds),
            ),
            and(
              eq(schema.prayerFriendStreaks.userHighId, session.userId),
              inArray(schema.prayerFriendStreaks.userLowId, friendIds),
            ),
          ),
        ),
      // Cheers I already sent today (per each friend's local date)
      db
        .select({
          recipientId: schema.prayerCheers.recipientId,
          date: schema.prayerCheers.date,
        })
        .from(schema.prayerCheers)
        .where(
          and(
            eq(schema.prayerCheers.senderId, session.userId),
            inArray(schema.prayerCheers.recipientId, friendIds),
            inArray(schema.prayerCheers.date, distinctTodayStrs.length ? distinctTodayStrs : ["9999-12-31"]),
          ),
        ),
    ]);

  // Index lookups — include visibility settings
  const settingsByUser = new Map(
    friendSettingsAll.map((s) => [s.userId, {
      timezone: s.timezone || "America/Chicago",
      friendsSeeStreak: s.friendsSeeStreak ?? true,
      friendsSeeTodayStatus: s.friendsSeeTodayStatus ?? false,
      friendsSeeSunnah: s.friendsSeeSunnah ?? false,
      friendsSeeMasjidPct: s.friendsSeeMasjidPct ?? true,
    }]),
  );
  const logsByUser = new Map<string, typeof friendLogsAll>();
  for (const log of friendLogsAll) {
    if (!logsByUser.has(log.userId)) logsByUser.set(log.userId, []);
    logsByUser.get(log.userId)!.push(log);
  }
  const todayLogsByUserDate = new Map<string, Map<string, Array<{ prayerName: string; status: string }>>>();
  for (const log of todayLogsAll) {
    if (!todayLogsByUserDate.has(log.userId)) todayLogsByUserDate.set(log.userId, new Map());
    const dateStr = typeof log.date === "string" ? log.date : String(log.date);
    if (!todayLogsByUserDate.get(log.userId)!.has(dateStr)) todayLogsByUserDate.get(log.userId)!.set(dateStr, []);
    todayLogsByUserDate.get(log.userId)!.get(dateStr)!.push({ prayerName: log.prayerName, status: log.status });
  }
  // Reminders already sent today — recipientId+date+prayerName key
  const remindedByUserDate = new Map<string, Set<string>>();
  for (const r of remindersAll) {
    const dateStr = typeof r.date === "string" ? r.date : String(r.date);
    const key = `${r.recipientId}|${dateStr}`;
    if (!remindedByUserDate.has(key)) remindedByUserDate.set(key, new Set());
    remindedByUserDate.get(key)!.add(r.prayerName);
  }
  const sunnahByUserDate = new Map<string, Map<string, string[]>>();
  for (const s of todaySunnahAll) {
    if (!sunnahByUserDate.has(s.userId)) sunnahByUserDate.set(s.userId, new Map());
    const dateStr = typeof s.date === "string" ? s.date : String(s.date);
    if (!sunnahByUserDate.get(s.userId)!.has(dateStr)) sunnahByUserDate.get(s.userId)!.set(dateStr, []);
    sunnahByUserDate.get(s.userId)!.get(dateStr)!.push(s.sunnahKey);
  }
  // Shared streaks keyed by the friend on the other side of the pair
  const streakByFriend = new Map<string, { streak: number; bestStreak: number; lastDate: string | null }>();
  for (const s of streaksAll) {
    const friendId = s.userLowId === session.userId ? s.userHighId : s.userLowId;
    streakByFriend.set(friendId, {
      streak: s.streak,
      bestStreak: s.bestStreak,
      lastDate: s.lastDate ? String(s.lastDate) : null,
    });
  }
  const cheeredByUserDate = new Set<string>();
  for (const c of cheersAll) {
    const dateStr = typeof c.date === "string" ? c.date : String(c.date);
    cheeredByUserDate.add(`${c.recipientId}|${dateStr}`);
  }

  const friends: Array<{
    id: string;
    firstName: string | null;
    displayName: string | null;
    streak: number | null;
    totalCompleteDays: number | null;
    totalPrayed: number | null;
    masjidPct: number | null;
    thisWeekPrayed: number | null;
    lastPrayedDate: string | null;
    todayLogs: Array<{ prayerName: string; status: string }>;
    todaySunnahs: string[];
    todayVisible: boolean;
    remindedToday: string[];
    cheeredToday: boolean;
    sharedStreak: { streak: number; bestStreak: number; lastDate: string | null } | null;
    timezone: string;
  }> = [];

  for (const friendUser of friendUsers) {
    const settings = settingsByUser.get(friendUser.id) || {
      timezone: "America/Chicago",
      friendsSeeStreak: true,
      friendsSeeTodayStatus: false,
      friendsSeeSunnah: false,
      friendsSeeMasjidPct: true,
    };
    const timezone = settings.timezone;
    const todayStr = todayByUser.get(friendUser.id)
      ?? new Date().toLocaleDateString("en-CA", { timeZone: timezone });
    const friendLogs = logsByUser.get(friendUser.id) ?? [];

    // Build logs by date map
    const logsByDate = new Map<string, Array<{ status: string }>>();
    let completeDays = 0;
    let totalPrayed = 0;
    let totalMasjid = 0;
    let thisWeekPrayed = 0;
    let lastPrayedDate: string | null = null;

    for (const log of friendLogs) {
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      if (!logsByDate.has(dateStr)) logsByDate.set(dateStr, []);
      logsByDate.get(dateStr)!.push({ status: log.status });

      if (log.status === "prayed" || log.status === "assumed_prayed") {
        totalPrayed++;
        if (log.wentToMasjid === true) totalMasjid++;
        if (dateStr >= weekAgoStr) thisWeekPrayed++;
        if (!lastPrayedDate || dateStr > lastPrayedDate) lastPrayedDate = dateStr;
      }
    }

    // Count complete days — excused counts (it never breaks a streak), but
    // isn't included in the "prayed" totals above.
    for (const [, logs] of logsByDate) {
      const prayedCount = logs.filter(
        (l) => l.status === "prayed" || l.status === "assumed_prayed" || l.status === "excused",
      ).length;
      if (prayedCount === 5) completeDays++;
    }

    const streak = calculateStreak(logsByDate, todayStr);

    const todayLogs = settings.friendsSeeTodayStatus
      ? (todayLogsByUserDate.get(friendUser.id)?.get(todayStr) ?? [])
      : [];
    const todaySunnahs = settings.friendsSeeSunnah
      ? (sunnahByUserDate.get(friendUser.id)?.get(todayStr) ?? [])
      : [];

    friends.push({
      id: friendUser.id,
      firstName: friendUser.firstName,
      displayName: friendUser.displayName,
      streak: settings.friendsSeeStreak ? streak : null,
      totalCompleteDays: settings.friendsSeeStreak ? completeDays : null,
      totalPrayed: settings.friendsSeeStreak ? totalPrayed : null,
      masjidPct: settings.friendsSeeMasjidPct
        ? (totalPrayed > 0 ? Math.round((totalMasjid / totalPrayed) * 100) : 0)
        : null,
      thisWeekPrayed: settings.friendsSeeStreak ? thisWeekPrayed : null,
      lastPrayedDate: settings.friendsSeeStreak ? lastPrayedDate : null,
      todayLogs,
      todaySunnahs,
      todayVisible: settings.friendsSeeTodayStatus,
      remindedToday: [...(remindedByUserDate.get(`${friendUser.id}|${todayStr}`) ?? [])],
      cheeredToday: cheeredByUserDate.has(`${friendUser.id}|${todayStr}`),
      sharedStreak: streakByFriend.get(friendUser.id) ?? null,
      timezone,
    });
  }

  // Sort by streak descending so the leaderboard is competitive
  friends.sort((a, b) => (b.streak ?? -1) - (a.streak ?? -1) || (b.thisWeekPrayed ?? -1) - (a.thisWeekPrayed ?? -1));

  return NextResponse.json(friends);
}
