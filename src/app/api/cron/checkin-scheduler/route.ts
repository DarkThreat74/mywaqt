import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, lt, gte, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { verifyCronAuth } from "@/lib/cronAuth";
import { isWindowClosed, getPrayerWindow } from "@/lib/prayer/stateMachine";
import { sendPrayerPush } from "@/lib/notifications/push";
import { recordDayCompletion } from "@/lib/prayer/social";
import { haydCoverage } from "@/lib/prayer/hayd";
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
const DAY_MS = 24 * 60 * 60 * 1000;

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns a Date whose SERVER-LOCAL fields equal the user's current wall
 * clock in `timezone`. This is what isWindowClosed() expects — it builds
 * comparison times with setHours() in the same server-local frame, so both
 * sides must be interpreted in that frame.
 *
 * Never use `new Date(new Date().toLocaleString("en-US", { timeZone }))`
 * followed by .toISOString() — that roundtrip shifts the date by the
 * server's own UTC offset near midnight.
 */
function userNowAsLocalDate(timezone: string): { now: Date; today: string; yesterdayStr: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const now = new Date(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  const today = `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
  return { now, today, yesterdayStr };
}

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
    const { today, yesterdayStr } = userNowAsLocalDate(s.timezone);
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

  // Batch 5: pending homework due within the reminder horizon. The batch
  // spans many timezones, so widen the range to cover every user's today+3.
  const todays = settings.map((s) => userNowAsLocalDate(s.timezone).today).sort();
  const minDue = todays[0];
  const maxPlus3 = fmtLocal(new Date(new Date(`${todays[todays.length - 1]}T12:00:00`).getTime() + 3 * 24 * 60 * 60 * 1000));
  const batchHomework = await db
    .select({
      id: schema.homeworks.id,
      userId: schema.homeworks.userId,
      title: schema.homeworks.title,
      dueDate: schema.homeworks.dueDate,
      notified3dAt: schema.homeworks.notified3dAt,
      notified1dAt: schema.homeworks.notified1dAt,
      notifiedMorningAt: schema.homeworks.notifiedMorningAt,
    })
    .from(schema.homeworks)
    .where(
      and(
        inArray(schema.homeworks.userId, userIds),
        eq(schema.homeworks.status, "pending"),
        gte(schema.homeworks.dueDate, minDue),
        lte(schema.homeworks.dueDate, maxPlus3),
      ),
    );
  const homeworkMap = new Map<string, typeof batchHomework>();
  for (const h of batchHomework) {
    if (!homeworkMap.has(h.userId)) homeworkMap.set(h.userId, []);
    homeworkMap.get(h.userId)!.push(h);
  }

  // Batch 6: hayd coverage for the relevant dates — covered days get
  // 'excused' resolution and no notifications (obligation is lifted).
  const haydSet = await haydCoverage(userIds, dateList);

  // Process each user using the batched data
  for (const s of settings) {
    try {
      const userNow = userNowAsLocalDate(s.timezone).now;
      const { today, yesterdayStr } = userNowAsLocalDate(s.timezone);

      // Hayd coverage: obligation lifted — covered days resolve as 'excused'
      // (never 'assumed_prayed') and no prayer pushes go out.
      const haydYesterday = haydSet.has(`${s.userId}:${yesterdayStr}`);
      const haydToday = haydSet.has(`${s.userId}:${today}`);

      // 1. Resolve yesterday's unmarked prayers as assumed_prayed (or excused
      //    when the day was covered by a hayd period)
      const resolveStatus = haydYesterday ? "excused" : "assumed_prayed";
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
        const rowsToInsert: Array<{
          userId: string;
          date: string;
          prayerName: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
          status: "assumed_prayed" | "excused";
          wentToMasjid: boolean;
          markedAt: Date;
          lastCheckinAt: Date;
        }> = [];

        for (const prayerName of prayers) {
          const window = getPrayerWindow(prayerName, yesterdayTimings);
          // Pass yesterdayStr so isWindowClosed checks against yesterday's window,
          // not today's. This fixes the bug where midnight cron thought windows hadn't closed.
          if (!isWindowClosed(window, userNow, yesterdayStr)) continue;

          const existingLog = pendingLogsMap.get(s.userId)?.get(yesterdayStr)?.get(prayerName);
          if (existingLog) {
            logIdsToUpdate.push(existingLog.id);
          } else {
            // No row at all — the user never touched this prayer. Insert an
            // assumed_prayed row so analytics/streaks see a complete day.
            // onConflictDoNothing makes it safe if a row exists in another
            // status (manually marked between our read and write).
            rowsToInsert.push({
              userId: s.userId,
              date: yesterdayStr,
              prayerName,
              status: resolveStatus,
              wentToMasjid: false,
              markedAt: new Date(),
              lastCheckinAt: new Date(),
            });
          }
        }

        if (logIdsToUpdate.length > 0) {
          // Add status='pending' guard to avoid overwriting prayers the user
          // manually marked as prayed/missed between our read and write.
          await db
            .update(schema.prayerLog)
            .set({ status: resolveStatus })
            .where(
              and(
                inArray(schema.prayerLog.id, logIdsToUpdate),
                eq(schema.prayerLog.status, "pending"),
              ),
            );
          assumedResolved += logIdsToUpdate.length;
        }

        if (rowsToInsert.length > 0) {
          await db
            .insert(schema.prayerLog)
            .values(rowsToInsert)
            .onConflictDoNothing({
              target: [schema.prayerLog.userId, schema.prayerLog.date, schema.prayerLog.prayerName],
            });
          assumedResolved += rowsToInsert.length;
        }

        // Auto-resolution can complete a day without any check-in — record it
        // so shared streaks, races, and challenges stay consistent with the
        // personal streak (which already counts assumed_prayed).
        if (logIdsToUpdate.length > 0 || rowsToInsert.length > 0) {
          await recordDayCompletion(s.userId, yesterdayStr);
        }
      }

      // 2. Homework deadline digest — one push per user per day. Only sent
      // during the user's local waking hours (6:00–21:00) since this cron
      // runs once at midnight UTC; the client-side scheduler covers the rest.
      const userHw = homeworkMap.get(s.userId);
      const otherPref = prefsMap.get(s.userId)?.otherReminders || "push";
      if (otherPref !== "none" && userHw && userHw.length > 0) {
        const hour = userNow.getHours();
        if (hour >= 6 && hour < 21) {
          const tomorrowStr = fmtLocal(new Date(userNow.getTime() + DAY_MS));
          const plus3Str = fmtLocal(new Date(userNow.getTime() + 3 * DAY_MS));
          const due: Array<{ hw: typeof userHw[number]; stage: "3d" | "1d" | "morning"; label: string }> = [];
          for (const hw of userHw) {
            const stage =
              hw.dueDate === today ? "morning" as const
              : hw.dueDate === tomorrowStr ? "1d" as const
              : hw.dueDate === plus3Str ? "3d" as const
              : null;
            if (!stage) continue;
            const already = stage === "3d" ? hw.notified3dAt : stage === "1d" ? hw.notified1dAt : hw.notifiedMorningAt;
            if (already) continue;
            const label = stage === "morning" ? "due today" : stage === "1d" ? "due tomorrow" : "due in 3 days";
            due.push({ hw, stage, label });
          }
          // No push subs → skip entirely (don't mark notified): the client
          // scheduler can still fire the stage locally while the app is open.
          const subs = subsMap.get(s.userId) ?? [];
          if (due.length > 0 && subs.length > 0) {
            const body = due.slice(0, 3).map((d) => `${d.hw.title} — ${d.label}`).join(" · ")
              + (due.length > 3 ? ` · +${due.length - 3} more` : "");
            const payload = JSON.stringify({
              title: due.length === 1 ? `Homework ${due[0].label}` : `${due.length} deadlines coming up`,
              body,
              tag: `hw-digest-${today}`,
              data: { url: "/goals" },
            });
            await Promise.allSettled(
              subs.map(async (sub) => {
                try {
                  const result = await sendPrayerPush(sub, payload, { topic: `hw-digest-${today}` });
                  if (result.delivered) notificationsSent++;
                  else if (result.expired) {
                    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id)).catch(() => {});
                  }
                } catch (err) {
                  logError(err, { route: "cron/checkin-scheduler", phase: "hw-push", subId: sub.id });
                }
              }),
            );
            // Mark stages sent — dedupes across reruns and lets the client
            // scheduler skip stages the server already pushed.
            const now = new Date();
            const byCol = { "3d": [] as string[], "1d": [] as string[], morning: [] as string[] };
            for (const d of due) byCol[d.stage].push(d.hw.id);
            await Promise.all([
              byCol["3d"].length && db.update(schema.homeworks).set({ notified3dAt: now })
                .where(and(inArray(schema.homeworks.id, byCol["3d"]), eq(schema.homeworks.userId, s.userId))),
              byCol["1d"].length && db.update(schema.homeworks).set({ notified1dAt: now })
                .where(and(inArray(schema.homeworks.id, byCol["1d"]), eq(schema.homeworks.userId, s.userId))),
              byCol.morning.length && db.update(schema.homeworks).set({ notifiedMorningAt: now })
                .where(and(inArray(schema.homeworks.id, byCol.morning), eq(schema.homeworks.userId, s.userId))),
            ]);
          }
        }
      }

      // 3. Jumu'ah eve reminder — Thursday 18:00–21:00 local, once per week.
      //    Tag dedupes across cron reruns. Generic wording, no generated content.
      {
        const hour = userNow.getHours();
        const isThursday = userNow.getDay() === 4;
        const subs = subsMap.get(s.userId) ?? [];
        if (isThursday && hour >= 18 && hour < 21 && otherPref !== "none" && subs.length > 0 && !haydToday) {
          const payload = JSON.stringify({
            title: "Jumu'ah tomorrow",
            body: "Friday is almost here — a good night for Surah Al-Kahf and salawat.",
            tag: `jumuah-${today}`,
            data: { url: "/calendar/day" },
          });
          await Promise.allSettled(
            subs.map(async (sub) => {
              try {
                const result = await sendPrayerPush(sub, payload, { topic: `jumuah-${today}` });
                if (result.delivered) notificationsSent++;
                else if (result.expired) {
                  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id)).catch(() => {});
                }
              } catch (err) {
                logError(err, { route: "cron/checkin-scheduler", phase: "jumuah-push", subId: sub.id });
              }
            }),
          );
        }
      }

      // 4. Send daily prayer schedule push — skipped entirely on hayd days
      if (haydToday) continue;
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
