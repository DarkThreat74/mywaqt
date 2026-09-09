"use client";

import { useEffect, useRef, useCallback } from "react";
import { isNativeApp, requestPushPermission, getPushToken, getPlatform } from "@/lib/native-bridge";
import { getOfflineDB } from "@/lib/offline/db";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";

/**
 * Client-side notification scheduler.
 *
 * Schedules local notifications using the service worker's showNotification():
 * 1. Prayer time notifications — fires at each prayer's start time
 * 2. Reminder notifications — fires 15 min before each reminder's start time
 *
 * LIMITATION: This only works while the app tab is open or in a background tab.
 * If the browser/app is fully closed, timers die and no notification fires.
 * This is a known constraint of the client-only approach (Vercel Hobby cron
 * is limited to once-daily, so server-side real-time pushes aren't possible
 * without upgrading to Pro or using an external cron service).
 *
 * Mitigations:
 * - Re-schedules every 5 minutes to catch any drift
 * - Re-schedules on visibility change (tab refocus)
 * - Sends a "catch-up" notification if a prayer window is open when the tab
 *   regains focus and the user hasn't been notified yet
 * - Schedules today's + tomorrow's prayers (so early-morning Fajr is covered
 *   if the tab stays open overnight)
 * - Uses the user's prayer timezone (from /api/prayer-times), not browser-local
 *
 * Does NOT request notification permission — that must be done from a user
 * gesture (button tap in Settings). This component only schedules if
 * permission is already granted.
 */

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  details?: string | null;
  startAt: string;
  type: "block" | "task" | "reminder";
  notify?: boolean;
}

const PRAYER_NOTIFICATIONS: Array<{ key: keyof PrayerTimes; label: string }> = [
  { key: "fajr", label: "Fajr" },
  { key: "dhuhr", label: "Dhuhr" },
  { key: "asr", label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha", label: "Isha" },
];

// Track which prayer notifications have already fired this session
// so we don't double-fire on re-schedule.
const firedNotifications = new Set<string>();

export default function NotificationScheduler() {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const showNotification = useCallback(async (title: string, body: string, tag: string, url: string) => {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          tag,
          data: { url },
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          requireInteraction: false,
          ...(/* vibrate + renotify are valid but not in DOM lib types */ { vibrate: [200, 100, 200], renotify: true } as NotificationOptions),
        });
      } else if (!/iPad|iPhone|iPod|Android/i.test(navigator.userAgent)) {
        // new Notification() only works reliably on desktop — mobile requires SW
        new Notification(title, { body, tag, data: { url }, icon: "/icon-192.png" });
      }
    } catch (err) {
      console.warn("[Waqt] Notification failed:", err);
    }
  }, []);

  /**
   * Parse a prayer time string ("HH:MM:SS" or "HH:MM") into hours and minutes.
   * No Asr +1 hour adjustment — the AlAdhan API returns the correct Asr time
   * based on the user's madhab setting (see stateMachine.ts).
   */
  function parseTimeParts(rawTime: string): { hours: number; minutes: number } {
    const parts = rawTime.split(":").map(Number);
    return { hours: parts[0] || 0, minutes: parts[1] || 0 };
  }

  const schedulePrayerNotifications = useCallback(async (date: string) => {
    try {
      // ── Read from IndexedDB first (works offline) ──
      let data: PrayerTimes & { madhab?: string | null } | null = null;
      try {
        const db = getOfflineDB();
        const cached = await db.prayerTimes.get(date);
        if (cached && cached.fajr) {
          data = {
            fajr: cached.fajr,
            sunrise: cached.sunrise,
            dhuhr: cached.dhuhr,
            asr: cached.asr,
            maghrib: cached.maghrib,
            isha: cached.isha,
            madhab: cached.madhab,
          };
        }
      } catch {
        // IndexedDB read failed — fall through to API
      }

      // ── If not in IndexedDB, fetch from API ──
      if (!data) {
        let res = await fetch(`/api/prayer-times?date=${date}`);
        if (!res.ok) {
          // Prayer times not cached — trigger a sync, then retry
          try {
            await fetch("/api/prayer-times/sync", { method: "POST" });
            await new Promise((r) => setTimeout(r, 2000));
            res = await fetch(`/api/prayer-times?date=${date}`);
          } catch {
            return;
          }
        }
        if (!res.ok) return;

        data = await res.json().catch(() => null);
      }

      if (!data) return;
      // The API returns { ...cached, madhab, timezone } — extract prayer times + tz
      const times: PrayerTimes = {
        fajr: data.fajr,
        sunrise: data.sunrise,
        dhuhr: data.dhuhr,
        asr: data.asr,
        maghrib: data.maghrib,
        isha: data.isha,
      };
      const prayerTimezone = (data as PrayerTimes & { timezone?: string | null }).timezone;
      if (!times || !times.fajr) return;

      const now = new Date();

      for (const prayer of PRAYER_NOTIFICATIONS) {
        const rawTime = times[prayer.key];
        if (!rawTime) continue;

        const { hours, minutes } = parseTimeParts(rawTime);
        const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

        // Convert prayer time (wall-clock in user's prayer timezone) to an
        // absolute UTC instant. If we have the timezone, use it; otherwise fall
        // back to browser local time (original behavior).
        let prayerDate: Date;
        if (prayerTimezone) {
          // Parse the date as if it's in the prayer timezone, then get its UTC instant
          // by formatting it and reading back. This handles DST correctly.
          const dateTimeStr = `${date}T${timeStr}:00`;
          // Use Intl to get the offset for that date in the prayer timezone
          const dtf = new Intl.DateTimeFormat("en-US", {
            timeZone: prayerTimezone,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false,
          });
          // Get the parts for "now" in the prayer timezone to find the offset
          const nowParts = dtf.formatToParts(now);
          const nowInTz: Record<string, string> = {};
          for (const p of nowParts) { if (p.type !== "literal") nowInTz[p.type] = p.value; }
          const nowUtcMs = now.getTime();
          const nowTzDate = new Date(
            parseInt(nowInTz.year),
            parseInt(nowInTz.month) - 1,
            parseInt(nowInTz.day),
            parseInt(nowInTz.hour === "24" ? "00" : nowInTz.hour),
            parseInt(nowInTz.minute),
            parseInt(nowInTz.second),
          ).getTime();
          const offsetMs = nowTzDate - nowUtcMs;
          // Now compute the prayer time as a local date and subtract the offset
          prayerDate = new Date(new Date(`${dateTimeStr}`).getTime() - offsetMs);
        } else {
          prayerDate = new Date(`${date}T${timeStr}:00`);
        }

        const diffMs = prayerDate.getTime() - now.getTime();

        // Only schedule if it's in the future (within next 48 hours to cover tomorrow too)
        if (diffMs <= 0 || diffMs > 48 * 60 * 60 * 1000) continue;

        const notifTag = `prayer-${prayer.key}-${date}`;

        // Skip if we already fired this notification this session
        if (firedNotifications.has(notifTag)) continue;

        const timer = setTimeout(() => {
          firedNotifications.add(notifTag);
          showNotification(
            `${prayer.label} prayer time`,
            `It's time to pray ${prayer.label}.`,
            notifTag,
            "/calendar/day",
          );
        }, diffMs);

        timersRef.current.push(timer);
      }
    } catch (err) {
      console.warn("[Waqt] Prayer notification scheduling failed:", err);
    }
  }, [showNotification]);

  /**
   * Check if any prayer is currently in its window and we haven't notified yet.
   * If so, fire a catch-up notification immediately. This handles the case where
   * the tab was closed during a prayer time and reopened mid-window.
   */
  const checkMissedPrayers = useCallback(async () => {
    try {
      // Get the user's prayer timezone from the cached settings (localStorage)
      // so we compute "today" and "now" in the prayer timezone, not browser-local.
      const cachedSettings = getCachedPrayerSettings();
      const prayerTimezone = cachedSettings?.timezone || null;

      // Compute "today" in the prayer timezone (or browser-local as fallback)
      const now = new Date();
      const today = prayerTimezone
        ? now.toLocaleDateString("en-CA", { timeZone: prayerTimezone })
        : now.toLocaleDateString("en-CA");

      // ── Read from IndexedDB first (works offline) ──
      let data: PrayerTimes | null = null;
      try {
        const db = getOfflineDB();
        const cached = await db.prayerTimes.get(today);
        if (cached && cached.fajr) {
          data = {
            fajr: cached.fajr,
            sunrise: cached.sunrise,
            dhuhr: cached.dhuhr,
            asr: cached.asr,
            maghrib: cached.maghrib,
            isha: cached.isha,
          };
        }
      } catch {
        // IndexedDB read failed — fall through to API
      }

      // ── If not in IndexedDB, fetch from API ──
      if (!data) {
        const res = await fetch(`/api/prayer-times?date=${today}`);
        if (!res.ok) return;
        data = await res.json().catch(() => null);
      }

      if (!data) return;
      const times: PrayerTimes = {
        fajr: data.fajr,
        sunrise: data.sunrise,
        dhuhr: data.dhuhr,
        asr: data.asr,
        maghrib: data.maghrib,
        isha: data.isha,
      };
      if (!times || !times.fajr) return;

      // Compute "now" in minutes, in the prayer timezone (not browser-local)
      let nowMinutes: number;
      if (prayerTimezone) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: prayerTimezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(now);
        const h = parts.find((p) => p.type === "hour")?.value || "0";
        const m = parts.find((p) => p.type === "minute")?.value || "0";
        nowMinutes = parseInt(h === "24" ? "0" : h) * 60 + parseInt(m);
      } else {
        nowMinutes = now.getHours() * 60 + now.getMinutes();
      }

      for (const prayer of PRAYER_NOTIFICATIONS) {
        const { hours, minutes } = parseTimeParts(times[prayer.key]);
        const prayerMinutes = hours * 60 + minutes;

        // Get the end of this prayer's window
        let endMinutes: number;
        switch (prayer.key) {
          case "fajr": {
            const s = parseTimeParts(times.sunrise);
            endMinutes = s.hours * 60 + s.minutes;
            break;
          }
          case "dhuhr": {
            const s = parseTimeParts(times.asr);
            endMinutes = s.hours * 60 + s.minutes;
            break;
          }
          case "asr": {
            const s = parseTimeParts(times.maghrib);
            endMinutes = s.hours * 60 + s.minutes;
            break;
          }
          case "maghrib": {
            const s = parseTimeParts(times.isha);
            endMinutes = s.hours * 60 + s.minutes;
            break;
          }
          case "isha":
            // Isha window extends to next day's Fajr — just check if we're past Isha start
            endMinutes = 24 * 60; // end of day
            break;
          default:
            continue;
        }

        const notifTag = `prayer-${prayer.key}-${today}`;

        // If we're in the prayer window and haven't fired the notification yet
        if (nowMinutes >= prayerMinutes && nowMinutes < endMinutes && !firedNotifications.has(notifTag)) {
          // Only fire catch-up if the prayer started recently (within 10 min)
          // — otherwise the user probably knows already and a late notification is annoying
          const minutesSinceStart = nowMinutes - prayerMinutes;
          if (minutesSinceStart <= 10) {
            firedNotifications.add(notifTag);
            showNotification(
              `${prayer.label} prayer time`,
              `It's time to pray ${prayer.label}.`,
              notifTag,
              "/calendar/day",
            );
          } else {
            // Mark as fired so we don't fire a stale notification later
            firedNotifications.add(notifTag);
          }
        }
      }
    } catch (err) {
      console.warn("[Waqt] Missed prayer check failed:", err);
    }
  }, [showNotification]);

  const scheduleReminderNotifications = useCallback(async (date: string) => {
    try {
      // ── Read from IndexedDB first (works offline) ──
      let events: CalendarEvent[] | null = null;
      try {
        const db = getOfflineDB();
        const cached = await db.events.where("_dateKey").equals(date).toArray();
        if (cached.length > 0) {
          events = cached.map((e) => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt,
            type: e.type as "block" | "task" | "reminder",
            // notify flag not stored in cache — default to allowing notifications
          }));
        }
      } catch {
        // IndexedDB read failed — fall through to API
      }

      // ── If not in IndexedDB (or empty), fetch from API ──
      if (!events || events.length === 0) {
        const res = await fetch(`/api/events?date=${date}`);
        if (!res.ok) return;
        events = await res.json().catch(() => null);
      }

      if (!events || !Array.isArray(events)) return;

      const now = new Date();

      for (const event of events) {
        // Skip events where the user disabled notifications
        if (event.notify === false) continue;
        const eventStart = new Date(event.startAt);
        const notifyTime = new Date(eventStart.getTime() - 15 * 60 * 1000);
        const diffMs = notifyTime.getTime() - now.getTime();

        if (diffMs <= 1000 || diffMs > 48 * 60 * 60 * 1000) continue;

        const notifTag = `event-${event.id}-${date}`;
        if (firedNotifications.has(notifTag)) continue;

        // If the event is less than 15 min away, notify immediately
        const eventDiffMs = eventStart.getTime() - now.getTime();
        if (eventDiffMs > 0 && eventDiffMs < 15 * 60 * 1000) {
          const typeLabel = event.type === "reminder" ? "Reminder" : event.type === "task" ? "Task" : "Event";
          firedNotifications.add(notifTag);
          showNotification(
            `${typeLabel}: ${event.title}`,
            `Starting in ${Math.round(eventDiffMs / 60000)} min`,
            notifTag,
            "/calendar/day",
          );
          continue;
        }

        const timer = setTimeout(() => {
          firedNotifications.add(notifTag);
          const typeLabel = event.type === "reminder" ? "Reminder" : event.type === "task" ? "Task" : "Event";
          showNotification(
            `${typeLabel}: ${event.title}`,
            `Starting in 15 min`,
            notifTag,
            "/calendar/day",
          );
        }, diffMs);

        timersRef.current.push(timer);
      }
    } catch (err) {
      console.warn("[Waqt] Reminder notification scheduling failed:", err);
    }
  }, [showNotification]);

  const scheduleAll = useCallback(async () => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    // Compute today/tomorrow in the user's prayer timezone, not browser-local.
    // Prayer times are cached for dates in the prayer timezone.
    const cachedSettings = getCachedPrayerSettings();
    const prayerTimezone = cachedSettings?.timezone || null;
    const now = new Date();
    const today = prayerTimezone
      ? now.toLocaleDateString("en-CA", { timeZone: prayerTimezone })
      : now.toLocaleDateString("en-CA");
    const tomorrow = prayerTimezone
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: prayerTimezone })
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
    try {
      await Promise.all([
        schedulePrayerNotifications(today),
        schedulePrayerNotifications(tomorrow),
        scheduleReminderNotifications(today),
        scheduleReminderNotifications(tomorrow),
      ]);
    } catch {
      // will retry on next interval
    }
  }, [schedulePrayerNotifications, scheduleReminderNotifications]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

    // Only schedule if permission is already granted
    // Permission is requested from the Settings page (user gesture required)
    if (Notification.permission !== "granted") return;

    // On initial mount + when tab regains focus, check for missed prayers
    checkMissedPrayers();
    scheduleAll();

    // Re-schedule when the page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearAllTimers();
        checkMissedPrayers();
        scheduleAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Re-schedule every 5 minutes (tighter than 30 min for better timing)
    const interval = setInterval(() => {
      clearAllTimers();
      scheduleAll();
    }, 5 * 60 * 1000);

    return () => {
      clearAllTimers();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [scheduleAll, clearAllTimers, checkMissedPrayers]);

  // Listen for permission changes — when user enables notifications in Settings,
  // immediately schedule
  useEffect(() => {
    const handlePermissionGranted = () => {
      clearAllTimers();
      checkMissedPrayers();
      scheduleAll();
    };
    window.addEventListener("waqt:notifications-enabled", handlePermissionGranted);
    return () => window.removeEventListener("waqt:notifications-enabled", handlePermissionGranted);
  }, [scheduleAll, clearAllTimers, checkMissedPrayers]);

  // ── Native push registration ──
  // Inside the Capacitor shell, register for native push notifications
  // (APNs on iOS, FCM on Android) and store the device token on the server.
  // On web, this effect is a no-op — web push uses the service worker path above.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;

    (async () => {
      try {
        const granted = await requestPushPermission();
        if (!granted || cancelled) return;
        const token = await getPushToken();
        if (!token || cancelled) return;

        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            platform: getPlatform(),
            token,
            native: true,
          }),
        }).catch(() => {});
      } catch {
        // Silent — push is best-effort, not critical for prayer tracking
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return null;
}
