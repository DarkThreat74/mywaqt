"use client";

import { useEffect, useRef, useCallback } from "react";
import { isNativeApp, isIOS, requestPushPermission, getPushToken, getPlatform } from "@/lib/native-bridge";
import { getOfflineDB } from "@/lib/offline/db";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { wallClockToUtc } from "@/lib/timezone";

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

// Dhuhr displays as Jumu'ah on Fridays — the notification should match.
function prayerLabel(dateStr: string, prayer: { key: keyof PrayerTimes; label: string }): string {
  return prayer.key === "dhuhr" && new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 5
    ? "Jumu'ah"
    : prayer.label;
}

// Track which prayer notifications have already fired this session
// so we don't double-fire on re-schedule.
const firedNotifications = new Set<string>();
// Homework reminder tags persist in localStorage (cleared on logout with the
// other waqt-* keys) — survives page reloads so stages fire once per day.
const HW_FIRED_KEY = "waqt-hw-fired";

type PerPrayerPrefs = Partial<Record<
  "fajr" | "dhuhr" | "asr" | "maghrib" | "isha",
  { mode: "push" | "silent" | "off"; beforeMin: number }
>>;

export default function NotificationScheduler() {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const perPrayerRef = useRef<PerPrayerPrefs | null | undefined>(undefined);

  // Per-prayer prefs fetched once per mount (settings changes apply on reload)
  const getPerPrayerPrefs = useCallback(async (): Promise<PerPrayerPrefs | null> => {
    if (perPrayerRef.current !== undefined) return perPrayerRef.current;
    try {
      const res = await fetch("/api/notifications/prefs");
      const data = res.ok ? await res.json() : null;
      perPrayerRef.current = (data?.perPrayer as PerPrayerPrefs) ?? null;
    } catch {
      perPrayerRef.current = null;
    }
    return perPrayerRef.current;
  }, []);

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
      } else if (!isIOS() && !/Android/i.test(navigator.userAgent)) {
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
      // The API returns { ...cached, madhab, timezone, masjidIqamah, ... }
      const times: PrayerTimes = {
        fajr: data.fajr,
        sunrise: data.sunrise,
        dhuhr: data.dhuhr,
        asr: data.asr,
        maghrib: data.maghrib,
        isha: data.isha,
      };
      const extra = data as PrayerTimes & {
        timezone?: string | null;
        masjidIqamah?: {
          manual?: Partial<Record<keyof PrayerTimes, string>>;
          fixed?: (string | null)[];
          offsets?: (number | null)[];
          jummah?: string | null;
        } | null;
        useIqamahReminders?: boolean;
      };
      const prayerTimezone = extra.timezone;
      if (!times || !times.fajr) return;

      const perPrayer = await getPerPrayerPrefs();
      const now = new Date();
      // For the widget writer: collect upcoming prayer instants today
      const upcoming: Array<{ key: string; at: Date }> = [];

      for (const prayer of PRAYER_NOTIFICATIONS) {
        // Per-prayer mode: 'off' and 'silent' get no notifications at all
        const cfg = perPrayer?.[prayer.key as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"];
        if (cfg && cfg.mode !== "push") continue;

        const rawTime = times[prayer.key];
        if (!rawTime) continue;

        const { hours, minutes } = parseTimeParts(rawTime);

        // Convert prayer time (wall-clock in user's prayer timezone) to an
        // absolute UTC instant — DST-safe via the shared helper.
        const [y, mo, d] = date.split("-").map(Number);
        const prayerDate = prayerTimezone
          ? wallClockToUtc(y, mo, d, hours, minutes, 0, prayerTimezone)
          : new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);

        const diffMs = prayerDate.getTime() - now.getTime();

        if (diffMs > 0) upcoming.push({ key: prayer.key, at: prayerDate });

        // Only schedule if it's in the future (within next 48 hours to cover tomorrow too)
        if (diffMs <= 0 || diffMs > 48 * 60 * 60 * 1000) continue;

        // Optional "X min before" reminder for this prayer
        if (cfg && cfg.beforeMin > 0) {
          const beforeTag = `prayer-before-${prayer.key}-${date}`;
          const beforeDiffMs = diffMs - cfg.beforeMin * 60 * 1000;
          if (beforeDiffMs > 0 && !firedNotifications.has(beforeTag)) {
            const t = setTimeout(() => {
              firedNotifications.add(beforeTag);
              showNotification(
                `${prayerLabel(date, prayer)} in ${cfg.beforeMin} min`,
                `${prayerLabel(date, prayer)} starts soon.`,
                beforeTag,
                "/calendar/day",
              );
            }, beforeDiffMs);
            timersRef.current.push(t);
          }
        }

        const notifTag = `prayer-${prayer.key}-${date}`;

        // Skip if we already fired this notification this session
        if (firedNotifications.has(notifTag)) continue;

        const timer = setTimeout(() => {
          firedNotifications.add(notifTag);
          showNotification(
            `${prayerLabel(date, prayer)} prayer time`,
            `It's time to pray ${prayerLabel(date, prayer)}.`,
            notifTag,
            "/calendar/day",
          );
        }, diffMs);

        timersRef.current.push(timer);

        // Iqamah reminder — masjid's iqamah time when configured. Resolved
        // order: manual HH:MM → directory fixed → adhan + offset minutes.
        let iqamah: { h: number; mi: number } | null = null;
        const iq = extra.useIqamahReminders ? extra.masjidIqamah : null;
        if (iq) {
          const idx = PRAYER_NOTIFICATIONS.findIndex((p) => p.key === prayer.key);
          const manual = iq.manual?.[prayer.key];
          const fixed = iq.fixed?.[idx];
          const offset = iq.offsets?.[idx];
          if (manual) {
            const p = parseTimeParts(manual);
            iqamah = { h: p.hours, mi: p.minutes };
          } else if (fixed) {
            const p = parseTimeParts(fixed);
            iqamah = { h: p.hours, mi: p.minutes };
          } else if (typeof offset === "number") {
            const total = hours * 60 + minutes + offset;
            iqamah = { h: Math.floor(total / 60) % 24, mi: total % 60 };
          }
        }
        if (iqamah) {
          const iqTag = `iqamah-${prayer.key}-${date}`;
          const iqDate = prayerTimezone
            ? wallClockToUtc(y, mo, d, iqamah.h, iqamah.mi, 0, prayerTimezone)
            : new Date(`${date}T${String(iqamah.h).padStart(2, "0")}:${String(iqamah.mi).padStart(2, "0")}:00`);
          const iqDiff = iqDate.getTime() - now.getTime();
          if (iqDiff > 0 && iqDiff <= 48 * 60 * 60 * 1000 && !firedNotifications.has(iqTag)) {
            const t = setTimeout(() => {
              firedNotifications.add(iqTag);
              showNotification(
                `${prayerLabel(date, prayer)} iqamah`,
                `Iqamah for ${prayerLabel(date, prayer)} is now${extra.masjidIqamah ? " at your masjid" : ""}.`,
                iqTag,
                "/calendar/day",
              );
            }, iqDiff);
            timersRef.current.push(t);
          }
        }
      }

      // Widget payload — write the next prayer so native wrappers (and the
      // PWA badge) can show it without recomputing. Only today's invocation
      // writes, so tomorrow's schedule can't clobber a still-upcoming prayer.
      const todayStr = prayerTimezone
        ? now.toLocaleDateString("en-CA", { timeZone: prayerTimezone })
        : now.toLocaleDateString("en-CA");
      if (date === todayStr) {
        const next = upcoming.sort((a, b) => a.at.getTime() - b.at.getTime())[0];
        if (next) {
          try {
            localStorage.setItem(
              "waqt-next-prayer",
              JSON.stringify({ prayer: next.key, at: next.at.toISOString(), date }),
            );
            const badge = (navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> }).setAppBadge;
            if (badge) badge.call(navigator, 1).catch(() => {});
          } catch { /* non-critical */ }
        }
      }
    } catch (err) {
      console.warn("[Waqt] Prayer notification scheduling failed:", err);
    }
  }, [showNotification, getPerPrayerPrefs]);

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
      const perPrayer = await getPerPrayerPrefs();

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
        const cfg = perPrayer?.[prayer.key as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"];
        if (cfg && cfg.mode !== "push") continue;
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
              `${prayerLabel(today, prayer)} prayer time`,
              `It's time to pray ${prayerLabel(today, prayer)}.`,
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
  }, [showNotification, getPerPrayerPrefs]);

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
            notify: e.notify,
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

  /**
   * Homework deadline reminders — "due in 3 days" / "due tomorrow" / "due
   * today" local notifications fired at 9am device-local on the trigger day.
   * Runs while the app is open like the event reminders; if the trigger time
   * has already passed today it fires immediately once (stable notification
   * tags make re-fires replace rather than stack).
   */
  const scheduleHomeworkNotifications = useCallback(async (today: string) => {
    try {
      let items: Array<{
        id: string; title: string; dueDate: string; status: string;
        notified3dAt?: string | null; notified1dAt?: string | null; notifiedMorningAt?: string | null;
      }> | null = null;
      try {
        const db = getOfflineDB();
        const cached = await db.homework.toArray();
        items = cached.map((h) => ({
          id: h.id, title: h.title, dueDate: h.dueDate, status: h.status,
          notified3dAt: h.notified3dAt, notified1dAt: h.notified1dAt, notifiedMorningAt: h.notifiedMorningAt,
        }));
      } catch {
        // IndexedDB unavailable — fall through to API
      }
      if (!items || items.length === 0) {
        // Need the whole 3-day window, not just today — fetch a range.
        const horizon = new Date(`${today}T12:00:00`);
        horizon.setDate(horizon.getDate() + 3);
        const res = await fetch(`/api/homework?from=${today}&to=${horizon.toLocaleDateString("en-CA")}`);
        if (res.ok) items = await res.json().catch(() => null);
      }
      if (!items || !Array.isArray(items)) return;

      // Persistent fired-tags so reopening the app doesn't re-fire the same
      // stage the same day (in-memory set alone resets each page load).
      let fired = new Set<string>();
      try { fired = new Set(JSON.parse(localStorage.getItem(HW_FIRED_KEY) ?? "[]")); } catch { /* fresh */ }
      const markFired = (tag: string) => {
        fired.add(tag);
        try { localStorage.setItem(HW_FIRED_KEY, JSON.stringify([...fired].slice(-300))); } catch { /* full/blocked */ }
      };

      // Local "today" in the prayer timezone, then per-homework day delta
      const dayMs = 24 * 60 * 60 * 1000;
      const todayMidnight = new Date(`${today}T00:00:00`);
      const now = new Date();

      for (const hw of items) {
        if (hw.status !== "pending") continue;
        const dueMidnight = new Date(`${hw.dueDate}T00:00:00`);
        const diffDays = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / dayMs);
        // Stages: 3 days out, tomorrow, today (skip 2-day gap and overdue)
        if (diffDays < 0 || diffDays > 3 || diffDays === 2) continue;

        // Skip stages the server-side digest already pushed for this user.
        const serverSent = diffDays === 0 ? hw.notifiedMorningAt : diffDays === 1 ? hw.notified1dAt : hw.notified3dAt;
        if (serverSent) continue;

        const label = diffDays === 0 ? "Due today" : diffDays === 1 ? "Due tomorrow" : "Due in 3 days";
        const tag = `hw-${hw.id}-${diffDays}d-${hw.dueDate}`;
        if (firedNotifications.has(tag) || fired.has(tag)) continue;

        // Fire at 9am device-local; if that's already past, fire now
        const fireAt = new Date(todayMidnight);
        fireAt.setHours(9, 0, 0, 0);
        const diffMs = fireAt.getTime() - now.getTime();
        if (diffMs <= 60 * 1000) {
          firedNotifications.add(tag);
          markFired(tag);
          showNotification("Homework", `${label}: ${hw.title}`, tag, "/goals");
        } else {
          const timer = setTimeout(() => {
            firedNotifications.add(tag);
            markFired(tag);
            showNotification("Homework", `${label}: ${hw.title}`, tag, "/goals");
          }, diffMs);
          timersRef.current.push(timer);
        }
      }
    } catch (err) {
      console.warn("[Waqt] Homework notification scheduling failed:", err);
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
        scheduleHomeworkNotifications(today),
      ]);
    } catch {
      // will retry on next interval
    }
  }, [schedulePrayerNotifications, scheduleReminderNotifications, scheduleHomeworkNotifications]);

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
