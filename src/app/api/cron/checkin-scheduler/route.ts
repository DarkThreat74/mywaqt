import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { verifyCronAuth } from "@/lib/cronAuth";
import { isWindowClosed, getPrayerWindow } from "@/lib/prayer/stateMachine";
import { sendPrayerPush } from "@/lib/notifications/push";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/cron/checkin-scheduler — runs once daily (Vercel Hobby limitation)
//
// Since this only runs once daily, it CANNOT send real-time prayer notifications.
// Real-time prayer notifications are handled by the client-side NotificationScheduler
// while the app is open or in a background tab.
//
// This cron does four things:
// 1. Sends a daily morning push with today's prayer times (so users start the
//    day knowing when each prayer is)
// 2. Resolves any prayers from yesterday whose windows have closed as
//    assumed_prayed (the "never assume the worst" principle)
// 3. Cleans up login_attempts older than 24 hours (per-account brute-force table)
// 4. Cleans up trusted_devices unused for 90 days (stale device hygiene)
//
// Idempotent — safe to run multiple times.
//
// ─── Optimization for 100k+ users ───
// Processes users in BATCHES of 500 to avoid:
// - Postgres prepared-statement parameter limits (inArray with 100k IDs)
// - Memory exhaustion from loading all data at once
// - Single-function timeout from processing too many users sequentially
const BATCH_SIZE = 500;
const STALE_DEVICE_DAYS = 90;
const LOGIN_ATTEMPT_RETENTION_HOURS = 24;

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request.headers.get("authorization"), request.headers.get("x-vercel-cron") === "1")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let notificationsSent = 0;
  let assumedResolved = 0;

  // Fetch all user IDs first (lightweight — just IDs, not full settings)
  const allSettings = await db.select({
    userId: schema.prayerSettings.userId,
    timezone: schema.prayerSettings.timezone,
    latitude: schema.prayerSettings.latitude,
    longitude: schema.prayerSettings.longitude,
    calculationMethod: schema.prayerSettings.calculationMethod,
    madhab: schema.prayerSettings.madhab,
  }).from(schema.prayerSettings);

  if (allSettings.length === 0) {
    return NextResponse.json({ ok: true, notificationsSent: 0, assumedResolved: 0 });
  }

  // Process in batches to avoid inArray with 100k+ IDs
  for (let batchStart = 0; batchStart < allSettings.length; batchStart += BATCH_SIZE) {
    const batch = allSettings.slice(batchStart, batchStart + BATCH_SIZE);
    const batchUserIds = batch.map((s) => s.userId);

    try {
      const result = await processUserBatch(batch, batchUserIds);
      notificationsSent += result.notificationsSent;
      assumedResolved += result.assumedResolved;
    } catch (batchErr) {
      logError(batchErr, { route: "cron/checkin-scheduler", phase: "batch", offset: batchStart });
    }
  }

  // ── Cleanup: prune stale login attempts and trusted devices ──
  // Best-effort — failures don't affect the main response.
  let loginAttemptsDeleted = 0;
  let staleDevicesDeleted = 0;
  try {
    const loginCutoff = new Date(Date.now() - LOGIN_ATTEMPT_RETENTION_HOURS * 60 * 60 * 1000);
    const deletedAttempts = await db
      .delete(schema.loginAttempts)
      .where(lt(schema.loginAttempts.failedAt, loginCutoff));
    loginAttemptsDeleted = deletedAttempts?.rowCount ?? 0;
  } catch (err) {
    logError(err, { route: "cron/checkin-scheduler", phase: "cleanup-login-attempts" });
  }
  try {
    const deviceCutoff = new Date(Date.now() - STALE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
    const deletedDevices = await db
      .delete(schema.trustedDevices)
      .where(lt(schema.trustedDevices.lastUsedAt, deviceCutoff));
    staleDevicesDeleted = deletedDevices?.rowCount ?? 0;
  } catch (err) {
    logError(err, { route: "cron/checkin-scheduler", phase: "cleanup-stale-devices" });
  }

  return NextResponse.json({ ok: true, notificationsSent, assumedResolved, loginAttemptsDeleted, staleDevicesDeleted });
}

async function processUserBatch(
  settings: Array<{ userId: string; timezone: string; latitude: string; longitude: string; calculationMethod: number; madhab: string | null }>,
  userIds: string[],
): Promise<{ notificationsSent: number; assumedResolved: number }> {
  let notificationsSent = 0;
  let assumedResolved = 0;

  // Compute all possible dates we need (today + yesterday for each timezone)
  const allDates = new Set<string>();
  const yesterdayDates = new Set<string>();
  for (const s of settings) {
    const userNow = new Date(new Date().toLocaleString("en-US", { timeZone: s.timezone }));
    const today = userNow.toISOString().split("T")[0];
    const yesterday = new Date(userNow.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    allDates.add(today);
    allDates.add(yesterdayStr);
    yesterdayDates.add(yesterdayStr);
  }
  const dateList = Array.from(allDates);

  // Batch 1: prayer times cache rows for relevant dates
  const allCachedTimes = await db
    .select()
    .from(schema.prayerTimesCache)
    .where(inArray(schema.prayerTimesCache.date, dateList));

  const cachedTimesMap = new Map<string, Map<string, typeof allCachedTimes[0]>>();
  for (const row of allCachedTimes) {
    if (!row.userId) continue;
    if (!cachedTimesMap.has(row.userId)) cachedTimesMap.set(row.userId, new Map());
    cachedTimesMap.get(row.userId)!.set(row.date, row);
  }

  // Batch 2: pending prayer logs for yesterday's dates
  const allPendingLogs = await db
    .select()
    .from(schema.prayerLog)
    .where(
      and(
        inArray(schema.prayerLog.userId, userIds),
        inArray(schema.prayerLog.date, Array.from(yesterdayDates)),
        eq(schema.prayerLog.status, "pending"),
      ),
    );

  const pendingLogsMap = new Map<string, Map<string, Map<string, typeof allPendingLogs[0]>>>();
  for (const log of allPendingLogs) {
    if (!pendingLogsMap.has(log.userId)) pendingLogsMap.set(log.userId, new Map());
    if (!pendingLogsMap.get(log.userId)!.has(log.date)) pendingLogsMap.get(log.userId)!.set(log.date, new Map());
    pendingLogsMap.get(log.userId)!.get(log.date)!.set(log.prayerName, log);
  }

  // Batch 3: notification prefs
  const allPrefs = await db
    .select()
    .from(schema.notificationPrefs)
    .where(inArray(schema.notificationPrefs.userId, userIds));

  const prefsMap = new Map<string, typeof allPrefs[0]>();
  for (const prefs of allPrefs) prefsMap.set(prefs.userId, prefs);

  // Batch 4: push subscriptions
  const allSubs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(inArray(schema.pushSubscriptions.userId, userIds));

  const subsMap = new Map<string, typeof allSubs[number][]>();
  for (const sub of allSubs) {
    if (!subsMap.has(sub.userId)) subsMap.set(sub.userId, []);
    subsMap.get(sub.userId)!.push(sub);
  }

  // Process each user using the batched data
  for (const s of settings) {
    try {
      const userNow = new Date(new Date().toLocaleString("en-US", { timeZone: s.timezone }));
      const today = userNow.toISOString().split("T")[0];
      const yesterday = new Date(userNow.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // 1. Resolve yesterday's unmarked prayers as assumed_prayed
      const yesterdayCached = cachedTimesMap.get(s.userId)?.get(yesterdayStr);
      if (yesterdayCached) {
        const yesterdayTimings = {
          fajr: yesterdayCached.fajr,
          sunrise: yesterdayCached.sunrise,
          dhuhr: yesterdayCached.dhuhr,
          asr: yesterdayCached.asr,
          maghrib: yesterdayCached.maghrib,
          isha: yesterdayCached.isha,
        };

        const prayers: Array<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha"> = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
        const logIdsToUpdate: string[] = [];

        for (const prayerName of prayers) {
          const window = getPrayerWindow(prayerName, yesterdayTimings);
          // Pass yesterdayStr so isWindowClosed checks against yesterday's window,
          // not today's. This fixes the bug where midnight cron thought windows hadn't closed.
          if (!isWindowClosed(window, userNow, yesterdayStr)) continue;

          const existingLog = pendingLogsMap.get(s.userId)?.get(yesterdayStr)?.get(prayerName);
          if (existingLog) {
            logIdsToUpdate.push(existingLog.id);
          }
        }

        if (logIdsToUpdate.length > 0) {
          // Add status='pending' guard to avoid overwriting prayers the user
          // manually marked as prayed/missed between our read and write.
          await db
            .update(schema.prayerLog)
            .set({ status: "assumed_prayed" })
            .where(
              and(
                inArray(schema.prayerLog.id, logIdsToUpdate),
                eq(schema.prayerLog.status, "pending"),
              ),
            );
          assumedResolved += logIdsToUpdate.length;
        }
      }

      // 2. Send daily prayer schedule push
      const cached = cachedTimesMap.get(s.userId)?.get(today);
      if (!cached) continue;

      const prefs = prefsMap.get(s.userId);
      const earlyMidPref = prefs?.prayerEarlyMid || "push";
      if (earlyMidPref === "none") continue;

      const subs = subsMap.get(s.userId);
      if (!subs || subs.length === 0) continue;

      const formatTime = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
      };

      const body = [
        `Fajr: ${formatTime(cached.fajr)}`,
        `Dhuhr: ${formatTime(cached.dhuhr)}`,
        `Asr: ${formatTime(cached.asr)}`,
        `Maghrib: ${formatTime(cached.maghrib)}`,
        `Isha: ${formatTime(cached.isha)}`,
      ].join(" · ");

      const payload = JSON.stringify({
        title: "Today's prayer times",
        body,
        tag: `prayer-times-${today}`,
        data: { url: "/calendar/day" },
        vibrate: [200, 100, 200],
        renotify: true,
      });

      // Send pushes with concurrency (10 parallel) instead of sequential.
      // At 100k users this reduces push time from ~2.8h to ~17min.
      const PUSH_CONCURRENCY = 10;
      const subChunks: typeof subs[] = [];
      for (let si = 0; si < subs.length; si += PUSH_CONCURRENCY) {
        subChunks.push(subs.slice(si, si + PUSH_CONCURRENCY));
      }
      for (const subChunk of subChunks) {
        await Promise.allSettled(
          subChunk.map(async (sub) => {
            try {
              const result = await sendPrayerPush(
                sub,
                payload,
                { topic: `prayer-times-${today}` },
              );
              if (result.delivered) {
                notificationsSent++;
              } else if (result.expired) {
                try {
                  await db
                    .delete(schema.pushSubscriptions)
                    .where(eq(schema.pushSubscriptions.id, sub.id));
                } catch (deleteErr) {
                  logError(deleteErr, { route: "cron/checkin-scheduler", phase: "delete-expired-sub", subId: sub.id });
                }
              }
            } catch (err) {
              const e = err as { statusCode?: number };
              logError(err, { route: "cron/checkin-scheduler", phase: "push", subId: sub.id, statusCode: e.statusCode });
            }
          }),
        );
      }
    } catch (userErr) {
      logError(userErr, { route: "cron/checkin-scheduler", phase: "user", userId: s.userId });
    }
  }

  return { notificationsSent, assumedResolved };
}
