import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, inArray, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { calculateStreak, weekStartInTimezone } from "@/lib/prayer/checkin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";

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
  if (!checkRateLimit("pf-list", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const friendships = await db
    .select({
      friendId: schema.prayerFriends.friendId,
      nickname: schema.prayerFriends.nickname,
      hiddenFromLeague: schema.prayerFriends.hiddenFromLeague,
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
  // Each friend's week runs Sunday→today in THEIR timezone — identical to the
  // analytics endpoint's "this week", so the league compares like with like.
  const weekStartByUser = new Map(
    friendSettingsAll.map((s) => [
      s.userId,
      weekStartInTimezone(s.timezone || "America/Chicago"),
    ]),
  );
  const distinctTodayStrs = [...new Set(todayByUser.values())];

  // Batch all reads in parallel (9 queries total, not 5 per friend)
  const [friendUsers, friendLogsAll, todayLogsAll, todaySunnahAll, remindersAll, streaksAll, cheersAll, timesAll] =
    await Promise.all([
      db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          middleInitial: schema.users.middleInitial,
          displayName: schema.users.displayName,
          avatarUrl: schema.users.avatarUrl,
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
          createdAt: schema.prayerReminders.createdAt,
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
      // Each friend's cached times for THEIR today — the open-salah window is
      // computed from these, matching the remind route's server-side check.
      db
        .select({
          userId: schema.prayerTimesCache.userId,
          date: schema.prayerTimesCache.date,
          fajr: schema.prayerTimesCache.fajr,
          sunrise: schema.prayerTimesCache.sunrise,
          dhuhr: schema.prayerTimesCache.dhuhr,
          asr: schema.prayerTimesCache.asr,
          maghrib: schema.prayerTimesCache.maghrib,
          isha: schema.prayerTimesCache.isha,
        })
        .from(schema.prayerTimesCache)
        .where(
          and(
            inArray(schema.prayerTimesCache.userId, friendIds),
            inArray(schema.prayerTimesCache.date, distinctTodayStrs.length ? distinctTodayStrs : ["9999-12-31"]),
          ),
        ),
    ]);

  // Index lookups — include visibility settings
  const settingsByUser = new Map(
    friendSettingsAll.map((s) => [s.userId, {
      timezone: s.timezone || "America/Chicago",
      friendsSeeStreak: s.friendsSeeStreak ?? true,
      // Match the schema default — a friend with no settings row is visible.
      friendsSeeTodayStatus: s.friendsSeeTodayStatus ?? true,
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
  // Reminders already sent today — recipientId+date → prayer → last sent
  // timestamp (the 2-minute cooldown clock on the client too).
  const remindedByUserDate = new Map<string, Map<string, string>>();
  for (const r of remindersAll) {
    const dateStr = typeof r.date === "string" ? r.date : String(r.date);
    const key = `${r.recipientId}|${dateStr}`;
    if (!remindedByUserDate.has(key)) remindedByUserDate.set(key, new Map());
    remindedByUserDate.get(key)!.set(r.prayerName, r.createdAt.toISOString());
  }
  const sunnahByUserDate = new Map<string, Map<string, string[]>>();
  for (const s of todaySunnahAll) {
    if (!sunnahByUserDate.has(s.userId)) sunnahByUserDate.set(s.userId, new Map());
    const dateStr = typeof s.date === "string" ? s.date : String(s.date);
    if (!sunnahByUserDate.get(s.userId)!.has(dateStr)) sunnahByUserDate.get(s.userId)!.set(dateStr, []);
    sunnahByUserDate.get(s.userId)!.get(dateStr)!.push(s.sunnahKey);
  }
  // League tiebreaker: rawatib muakkadah + witr this week — the confirmed
  // sunnahs count the same under both madhabs (ghayr-muakkadah and nafl are
  // excluded deliberately so the league rewards the emphasized prayers).
  const MUAKKADAH_WAJIB = new Set(["fajr_before", "dhuhr_before", "dhuhr_after", "maghrib_after", "isha_after", "witr"]);
  const weekSunnahByUser = new Map<string, number>();
  for (const s of todaySunnahAll) {
    if (MUAKKADAH_WAJIB.has(s.sunnahKey)) {
      weekSunnahByUser.set(s.userId, (weekSunnahByUser.get(s.userId) ?? 0) + 1);
    }
  }
  // Shared streaks keyed by the friend on the other side of the pair.
  // A chain is only alive if the last matched date is within the last 2 days
  // (covers ±1 day of timezone skew between the pair) — otherwise it shows 0
  // with the best streak preserved.
  const aliveAfter = new Date();
  aliveAfter.setUTCDate(aliveAfter.getUTCDate() - 2);
  const aliveAfterStr = aliveAfter.toISOString().slice(0, 10);
  const streakByFriend = new Map<string, { streak: number; bestStreak: number; lastDate: string | null }>();
  for (const s of streaksAll) {
    const friendId = s.userLowId === session.userId ? s.userHighId : s.userLowId;
    const lastDate = s.lastDate ? String(s.lastDate) : null;
    streakByFriend.set(friendId, {
      streak: lastDate !== null && lastDate >= aliveAfterStr ? s.streak : 0,
      bestStreak: s.bestStreak,
      lastDate,
    });
  }
  const cheeredByUserDate = new Set<string>();
  for (const c of cheersAll) {
    const dateStr = typeof c.date === "string" ? c.date : String(c.date);
    cheeredByUserDate.add(`${c.recipientId}|${dateStr}`);
  }
  // Friend-local times keyed userId|date — the client highlights the open
  // salah from THESE, not the viewer's own times.
  const timesByUserDate = new Map<string, { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string }>();
  for (const t of timesAll) {
    const dateStr = typeof t.date === "string" ? t.date : String(t.date);
    timesByUserDate.set(`${t.userId}|${dateStr}`, {
      fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha,
    });
  }

  // Owner-set nicknames ride the friendship row — they only apply to the
  // viewer's own list, never the friend's public identity.
  const nicknameByFriend = new Map(
    friendships.map((f) => [f.friendId, f.nickname?.trim() || null]),
  );
  // Viewer-side league hiding — the friend stays a friend everywhere else.
  const hiddenByFriend = new Map(
    friendships.map((f) => [f.friendId, f.hiddenFromLeague]),
  );

  const friends: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleInitial: string | null;
    nickname: string | null;
    hiddenFromLeague: boolean;
    displayName: string | null;
    shownName: string;
    avatarUrl: string | null;
    streak: number | null;
    weekCompleteDays: number | null;
    totalCompleteDays: number | null;
    totalPrayed: number | null;
    masjidPct: number | null;
    thisWeekPrayed: number | null;
    lastPrayedDate: string | null;
    todayLogs: Array<{ prayerName: string; status: string }>;
    todaySunnahs: string[];
    todayVisible: boolean;
    remindedAt: Record<string, string>;
    cheeredToday: boolean;
    sharedStreak: { streak: number; bestStreak: number; lastDate: string | null } | null;
    timezone: string;
    weekSunnah: number;
    times: { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string } | null;
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
    const weekStartStr = weekStartByUser.get(friendUser.id) ?? weekStartInTimezone(timezone);
    const friendLogs = logsByUser.get(friendUser.id) ?? [];

    // Build logs by date map
    const logsByDate = new Map<string, Array<{ status: string }>>();
    let totalPrayed = 0;
    let lastPrayedDate: string | null = null;
    // Week-scoped stats — same Sunday→today window the viewer's own card uses
    let weekPrayed = 0;
    let weekMasjid = 0;

    for (const log of friendLogs) {
      const dateStr = typeof log.date === "string" ? log.date : String(log.date);
      if (!logsByDate.has(dateStr)) logsByDate.set(dateStr, []);
      logsByDate.get(dateStr)!.push({ status: log.status });

      if (log.status === "prayed" || log.status === "assumed_prayed") {
        totalPrayed++;
        if (!lastPrayedDate || dateStr > lastPrayedDate) lastPrayedDate = dateStr;
        if (dateStr >= weekStartStr && dateStr <= todayStr) {
          weekPrayed++;
          if (log.wentToMasjid === true) weekMasjid++;
        }
      }
    }

    // Complete days — excused counts (it never breaks a streak),
    // but isn't included in the "prayed" totals above.
    let weekCompleteDays = 0;
    let totalCompleteDays = 0;
    for (const [dateStr, logs] of logsByDate) {
      const prayedCount = logs.filter(
        (l) => l.status === "prayed" || l.status === "assumed_prayed" || l.status === "excused",
      ).length;
      if (prayedCount === 5) {
        totalCompleteDays++;
        if (dateStr >= weekStartStr && dateStr <= todayStr) weekCompleteDays++;
      }
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
      lastName: friendUser.lastName,
      middleInitial: friendUser.middleInitial,
      nickname: nicknameByFriend.get(friendUser.id) ?? null,
      hiddenFromLeague: hiddenByFriend.get(friendUser.id) ?? false,
      shownName: "", // resolved in the collision pass below
      displayName: friendUser.displayName,
      avatarUrl: friendUser.avatarUrl,
      streak: settings.friendsSeeStreak ? streak : null,
      weekCompleteDays: settings.friendsSeeStreak ? weekCompleteDays : null,
      totalCompleteDays: settings.friendsSeeStreak ? totalCompleteDays : null,
      totalPrayed: settings.friendsSeeStreak ? totalPrayed : null,
      masjidPct: settings.friendsSeeMasjidPct
        ? (weekPrayed > 0 ? Math.round((weekMasjid / weekPrayed) * 100) : 0)
        : null,
      thisWeekPrayed: settings.friendsSeeStreak ? weekPrayed : null,
      lastPrayedDate: settings.friendsSeeStreak ? lastPrayedDate : null,
      todayLogs,
      todaySunnahs,
      todayVisible: settings.friendsSeeTodayStatus,
      remindedAt: Object.fromEntries(remindedByUserDate.get(`${friendUser.id}|${todayStr}`) ?? []),
      cheeredToday: cheeredByUserDate.has(`${friendUser.id}|${todayStr}`),
      sharedStreak: settings.friendsSeeStreak ? (streakByFriend.get(friendUser.id) ?? null) : null,
      timezone,
      // League tiebreaker — only counted when they share sunnah data.
      weekSunnah: settings.friendsSeeSunnah ? (weekSunnahByUser.get(friendUser.id) ?? 0) : 0,
      // Times only ride along when today's status is shared — that's the only
      // UI that needs them (open-salah highlight + nudge).
      times: settings.friendsSeeTodayStatus
        ? (timesByUserDate.get(`${friendUser.id}|${todayStr}`) ?? null)
        : null,
    });
  }

  // Display name resolution: nickname → first name → display name → "Friend".
  // When the shown base name collides (two Muhammads), append the last
  // initial; still colliding → add the middle initial ("Muhammad A.K.").
  const baseOf = (f: (typeof friends)[number]) =>
    (f.nickname ?? f.firstName ?? f.displayName ?? "Friend").trim();
  const baseCounts = new Map<string, number>();
  for (const f of friends) {
    const b = baseOf(f).toLowerCase();
    baseCounts.set(b, (baseCounts.get(b) ?? 0) + 1);
  }
  for (const f of friends) {
    let name = baseOf(f);
    if ((baseCounts.get(name.toLowerCase()) ?? 0) > 1) {
      const li = f.lastName?.trim().charAt(0);
      if (li) {
        name = `${name} ${li.toUpperCase()}.`;
        // Still colliding? Middle initial breaks the tie.
        const clash = friends.some(
          (o) => o !== f
            && `${baseOf(o)} ${o.lastName?.trim().charAt(0).toUpperCase()}.` === name,
        );
        const mi = f.middleInitial?.trim().charAt(0);
        if (clash && mi) name = `${name.slice(0, -1)}${mi.toUpperCase()}.`;
      }
    }
    f.shownName = name;
  }

  // Sort by streak descending so the leaderboard is competitive
  friends.sort((a, b) => (b.streak ?? -1) - (a.streak ?? -1) || (b.thisWeekPrayed ?? -1) - (a.thisWeekPrayed ?? -1));

  return NextResponse.json(friends);
}
