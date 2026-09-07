"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, X, MapPin, Repeat, ChevronDown, ChevronUp, Check, Bell, BellOff, BookOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import PrayerCheckinPopup from "@/components/prayer-checkin-popup";
import { useUISFX } from "@/components/uisfx-provider";
import { getDisplayAsrTime, type PrayerKey } from "@/lib/prayer/checkin";
import { clearApiCache } from "@/lib/sw-helpers";
import { getOfflineDB } from "@/lib/offline/db";
import { getCachedPrayerSettings, setCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { syncEventsToCache, addEventToCache, updateEventInCache, deleteEventFromCache, upsertPrayerLogToCache } from "@/lib/offline/cache-writers";

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  type: "block" | "task" | "reminder";
  color?: string | null;
  notify?: boolean;
  recurrenceRule?: string | null;
  seriesId?: string | null;
  _pending?: boolean;
}

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 12 AM to 11 PM (all 24 hours)
const HOUR_HEIGHT = 56; // px per hour
const TIME_COL = 44; // px — time label column
const DEFAULT_START_HOUR = 5; // 5 AM — default visible start

const PRAYER_NAMES: Array<{
  key: keyof PrayerTimes;
  label: string;
  color: string;
  isPrayer: boolean;
}> = [
  { key: "fajr", label: "Fajr", color: "var(--color-accent)", isPrayer: true },
  { key: "sunrise", label: "Sunrise", color: "var(--color-warmth)", isPrayer: false },
  { key: "dhuhr", label: "Dhuhr", color: "var(--color-accent)", isPrayer: true },
  { key: "asr", label: "Asr", color: "var(--color-accent)", isPrayer: true },
  { key: "maghrib", label: "Maghrib", color: "var(--color-warmth)", isPrayer: true },
  { key: "isha", label: "Isha", color: "var(--color-accent)", isPrayer: true },
];

// Color palette for reminders — each reminder gets a distinct color
const REMINDER_COLORS = [
  "#c2410c", // burnt orange
  "#0e7490", // teal
  "#7c3aed", // violet
  "#be185d", // rose
  "#15803d", // forest green
  "#b45309", // amber
  "#1e40af", // deep blue
  "#9f1239", // crimson
];

// Color palette for event blocks — user-selectable (36 visually distinct colors)
const EVENT_COLORS = [
  { label: "Teal", value: "#0e7490" },
  { label: "Burnt Orange", value: "#c2410c" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Rose", value: "#be185d" },
  { label: "Forest Green", value: "#15803d" },
  { label: "Amber", value: "#b45309" },
  { label: "Royal Blue", value: "#1e40af" },
  { label: "Crimson", value: "#9f1239" },
  { label: "Indigo", value: "#4338ca" },
  { label: "Mustard", value: "#a16207" },
  { label: "Magenta", value: "#a21caf" },
  { label: "Pine", value: "#166534" },
  { label: "Rust", value: "#7c2d12" },
  { label: "Slate Blue", value: "#3730a3" },
  { label: "Plum", value: "#86198f" },
  { label: "Olive", value: "#4d7c0f" },
  { label: "Coral", value: "#e11d48" },
  { label: "Cyan", value: "#0891b2" },
  { label: "Lime", value: "#65a30d" },
  { label: "Periwinkle", value: "#6366f1" },
  { label: "Salmon", value: "#f43f5e" },
  { label: "Turquoise", value: "#0d9488" },
  { label: "Brick", value: "#991b1b" },
  { label: "Lavender", value: "#8b5cf6" },
  { label: "Gold", value: "#ca8a04" },
  { label: "Moss", value: "#3f6212" },
  { label: "Navy", value: "#1e3a8a" },
  { label: "Ruby", value: "#b91c1c" },
  { label: "Sage", value: "#84a98c" },
  { label: "Mauve", value: "#a4778e" },
  { label: "Clay", value: "#a8453b" },
  { label: "Steel", value: "#475569" },
  { label: "Marigold", value: "#d97706" },
  { label: "Emerald", value: "#059669" },
  { label: "Bronze", value: "#92400e" },
  { label: "Mulberry", value: "#7e22ce" },
];

const TYPE_COLORS: Record<string, string> = {
  block: "var(--color-accent)",
  task: "var(--color-warmth)",
  reminder: "var(--color-ink-muted)",
};

const TYPE_BG: Record<string, string> = {
  block: "color-mix(in oklab, var(--color-accent) 14%, transparent)",
  task: "color-mix(in oklab, var(--color-warmth) 14%, transparent)",
  reminder: "transparent",
};

// Deterministic color assignment for reminders based on title
// Falls back to user-chosen color if set
function getReminderColor(title: string, chosenColor?: string | null): string {
  if (chosenColor && chosenColor.length >= 4) return chosenColor;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return REMINDER_COLORS[Math.abs(hash) % REMINDER_COLORS.length];
}

export default function DayViewClient({ date }: { date: string }) {
  const { play } = useUISFX();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("10:00");
  const [newType, setNewType] = useState<"block" | "task" | "reminder">("block");
  const [enableRecurrence, setEnableRecurrence] = useState(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showEarlyHours, setShowEarlyHours] = useState(false);
  const [newColor, setNewColor] = useState<string | null>(null);
  const [newNotify, setNewNotify] = useState(true);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editAllInSeries, setEditAllInSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CalendarEvent | null>(null);
  const [showSeriesList, setShowSeriesList] = useState(false);
  const [seriesEvents, setSeriesEvents] = useState<CalendarEvent[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [prayerLogs, setPrayerLogs] = useState<Array<{ prayerName: string; status: string; wentToMasjid: boolean | null }>>([]);
  const [checkinPopup, setCheckinPopup] = useState<{ prayer: PrayerKey; label: string } | null>(null);
  const [userTimezone, setUserTimezone] = useState("America/Chicago");
  const [userMadhab, setUserMadhab] = useState<string>("standard");
  const [locationSet, setLocationSet] = useState(true);
  const [dayHomeworkCount, setDayHomeworkCount] = useState<number>(0);

  // ── Load cached prayer settings from localStorage instantly ──
  // This avoids a network round-trip for timezone/madhab on every page load
  useEffect(() => {
    const cached = getCachedPrayerSettings();
    if (cached) {
      // Defer setState to avoid cascading renders
      Promise.resolve().then(() => {
        setUserTimezone(cached.timezone);
        setUserMadhab(cached.madhab || "standard");
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ── Step 1: Read from IndexedDB instantly (if cached) ──
      // This makes the page render immediately with cached data, no spinner
      try {
        const db = getOfflineDB();
        const [cachedEvents, cachedTimes, cachedLogs] = await Promise.all([
          db.events.where("_dateKey").equals(date).toArray(),
          db.prayerTimes.get(date),
          db.prayerLogs.where("date").equals(date).toArray(),
        ]);

        if (cancelled) return;

        if (cachedEvents.length > 0) {
          setEvents(cachedEvents.map((e) => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt,
            endAt: e.endAt ?? "",
            type: e.type as "block" | "task" | "reminder",
            color: e.color,
            recurrenceRule: e.recurrenceRule,
            seriesId: e.seriesId,
          })));
        }

        if (cachedTimes) {
          setPrayerTimes({
            fajr: cachedTimes.fajr,
            sunrise: cachedTimes.sunrise,
            dhuhr: cachedTimes.dhuhr,
            asr: cachedTimes.asr,
            maghrib: cachedTimes.maghrib,
            isha: cachedTimes.isha,
          });
          if (cachedTimes.madhab) setUserMadhab(cachedTimes.madhab);
          if (cachedTimes.locationSet === false) setLocationSet(false);
        }

        if (cachedLogs.length > 0) {
          setPrayerLogs(cachedLogs.map((l) => ({
            prayerName: l.prayerName,
            status: l.status,
            wentToMasjid: l.wentToMasjid,
          })));
        }

        // If we have ANY cached data, stop showing the loading spinner
        if (cachedEvents.length > 0 || cachedTimes || cachedLogs.length > 0) {
          if (!cancelled) setLoading(false);
        }
      } catch {
        // IndexedDB read failed — continue to API fetch
      }

      // ── Step 2: Fetch from API in background ──
      try {
        const [eventsRes, prayerRes, logRes, hwRes] = await Promise.all([
          fetch(`/api/events?date=${date}`).catch(() => null),
          fetch(`/api/prayer-times?date=${date}`).catch(() => null),
          fetch(`/api/prayer-log?date=${date}`).catch(() => null),
          fetch(`/api/homework?date=${date}`).catch(() => null),
        ]);

        if (cancelled) return;

        if (eventsRes?.ok) {
          const eventsData = await eventsRes.json();
          const filtered = eventsData.filter((e: { startAt: string }) => {
            const d = new Date(e.startAt);
            const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return localDateStr === date;
          });
          if (!cancelled) setEvents(filtered);

          // Cache events in IndexedDB for offline use
          try {
            const db = getOfflineDB();
            // Delete old events for this date, then insert fresh ones
            await db.events.where("_dateKey").equals(date).delete();
            await db.events.bulkPut(filtered.map((e: CalendarEvent & { id: string }) => ({
              id: e.id,
              userId: "", // not needed for client-side cache
              title: e.title,
              startAt: e.startAt,
              endAt: e.endAt,
              type: e.type,
              color: e.color || null,
              recurrenceRule: e.recurrenceRule || null,
              seriesId: e.seriesId || null,
              _dateKey: date,
              _cachedAt: Date.now(),
            })));
          } catch {
            // IndexedDB write failed — non-critical
          }
        }

        // ── Count homework due on this day for the badge ──
        if (hwRes?.ok && !cancelled) {
          try {
            const hwData = await hwRes.json();
            if (Array.isArray(hwData)) {
              const dueToday = hwData.filter((h: { dueDate: string; status: string }) =>
                h.dueDate === date && h.status === "pending"
              );
              if (!cancelled) setDayHomeworkCount(dueToday.length);
            }
          } catch {
            // non-critical
          }
        }

        if (prayerRes?.ok) {
          const prayerData = await prayerRes.json();
          if (!cancelled) {
            setPrayerTimes(prayerData);
            if (prayerData.madhab) setUserMadhab(prayerData.madhab);
            if (prayerData.locationSet === false) setLocationSet(false);
            else setLocationSet(true);
          }

          // Cache prayer times in IndexedDB
          try {
            const db = getOfflineDB();
            await db.prayerTimes.put({
              date,
              fajr: prayerData.fajr,
              sunrise: prayerData.sunrise,
              dhuhr: prayerData.dhuhr,
              asr: prayerData.asr,
              maghrib: prayerData.maghrib,
              isha: prayerData.isha,
              madhab: prayerData.madhab || null,
              locationSet: prayerData.locationSet !== false,
              _cachedAt: Date.now(),
            });
          } catch {
            // non-critical
          }
        } else {
          // Read locationSet from the 404 response body if available
          let apiLocationSet = true;
          if (prayerRes) {
            try {
              const errData = await prayerRes.json();
              if (errData.locationSet === false) apiLocationSet = false;
            } catch {
              // non-JSON response (e.g. 401, 429) — assume location is set
            }
          }
          // Only overwrite prayerTimes to null if we don't already have
          // cached data from IndexedDB. When offline, the API returns null
          // (the .catch(() => null) in the Promise.all), so we must NOT
          // wipe the cached value that was set in Step 1.
          if (!cancelled && !prayerRes) {
            // Offline (prayerRes is null) — keep cached prayerTimes if we have them
            setLocationSet(apiLocationSet);
          } else if (!cancelled) {
            // API responded but with an error (e.g. 404, 400) — clear prayer times
            setPrayerTimes(null);
            setLocationSet(apiLocationSet);
          }
          // Only attempt sync if location is actually set
          if (apiLocationSet) {
            try {
              const syncRes = await fetch("/api/prayer-times/sync", { method: "POST" });
              if (syncRes.ok && !cancelled) {
                const retryRes = await fetch(`/api/prayer-times?date=${date}`);
                if (retryRes.ok) {
                  const retryData = await retryRes.json();
                  if (!cancelled) {
                    setPrayerTimes(retryData);
                    if (retryData.madhab) setUserMadhab(retryData.madhab);
                    setLocationSet(true);
                  }
                }
              } else if (syncRes?.status === 400) {
                if (!cancelled) setLocationSet(false);
              }
            } catch {
              // Network error — don't change locationSet, leave as-is
            }
          }
        }

        // Parse prayer logs
        if (logRes?.ok) {
          const logData = await logRes.json();
          if (!cancelled) setPrayerLogs(logData);

          // Cache prayer logs in IndexedDB
          try {
            const db = getOfflineDB();
            await db.prayerLogs.where("date").equals(date).delete();
            await db.prayerLogs.bulkPut(logData.map((l: { prayerName: string; status: string; wentToMasjid: boolean | null; id?: string }) => ({
              id: l.id || `${date}_${l.prayerName}`,
              userId: "",
              date,
              prayerName: l.prayerName,
              status: l.status,
              wentToMasjid: l.wentToMasjid,
              lastCheckinAt: null,
              _cachedAt: Date.now(),
            })));
          } catch {
            // non-critical
          }
        }

        // Fetch user timezone from settings — update localStorage cache
        try {
          const settingsRes = await fetch("/api/settings/prayer-settings");
          if (settingsRes.ok && !cancelled) {
            const settingsData = await settingsRes.json();
            if (settingsData.timezone) {
              setUserTimezone(settingsData.timezone);
              // Cache in localStorage for instant offline access
              setCachedPrayerSettings({
                timezone: settingsData.timezone,
                calculationMethod: settingsData.calculationMethod,
                madhab: settingsData.madhab,
                latitude: settingsData.latitude,
                longitude: settingsData.longitude,
              });
            }
          }
        } catch {
          // Use default timezone or cached value
        }

        if (!cancelled) setError(null);
      } catch {
        if (!cancelled && !navigator.onLine) {
          setError(null);
        } else if (!cancelled) {
          setError("Failed to load calendar data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [date]);

  // ── Online/offline + sync listeners ──
  useEffect(() => {
    // After mount, sync the real online status (avoids hydration mismatch)
    // Using a Promise to defer the setState outside the effect body
    Promise.resolve().then(() => {
      setMounted(true);
      setIsOnline(navigator.onLine);
    });

    const handleOnline = () => {
      setIsOnline(true);
      // Refetch events to get any synced changes
      (async () => {
        try {
          const res = await fetch(`/api/events?date=${date}`);
          if (res.ok) {
            const data = await res.json().catch(() => []);
            if (!Array.isArray(data)) return;
            const filtered = data.filter((e: { startAt: string }) => {
              const d = new Date(e.startAt);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return localDateStr === date;
            });
            setEvents(filtered);
            syncEventsToCache(date, filtered);
          }
        } catch {
          // ignore
        }
      })();
    };
    const handleOffline = () => setIsOnline(false);

    const handleSynced = () => {
      // Events were synced from the outbox — refetch to get real data
      (async () => {
        try {
          const res = await fetch(`/api/events?date=${date}`);
          if (res.ok) {
            const data = await res.json().catch(() => []);
            if (!Array.isArray(data)) return;
            const filtered = data.filter((e: { startAt: string }) => {
              const d = new Date(e.startAt);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return localDateStr === date;
            });
            setEvents(filtered);
            syncEventsToCache(date, filtered);
            setError(null);
          }
        } catch {
          // ignore
        }
      })();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("waqt:events-synced", handleSynced);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("waqt:events-synced", handleSynced);
    };
  }, [date]);

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function minutesToTop(minutes: number): number {
    const startMinutes = HOURS[0] * 60;
    return ((minutes - startMinutes) / 60) * HOUR_HEIGHT;
  }

  function isoToLocalTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "00:00";
    // Use the user's stored timezone, not the browser timezone
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: userTimezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === "hour")?.value ?? "00";
      const m = parts.find((p) => p.type === "minute")?.value ?? "00";
      return `${h}:${m}`;
    } catch {
      // Fallback to browser timezone if Intl fails
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
  }

  function formatTime(time: string): string {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const hour = h % 12 || 12;
    const period = h < 12 ? "AM" : "PM";
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  }

  // Compact format for mobile prayer bar: "4:47a" instead of "4:47 AM"
  function formatTimeCompact(time: string): string {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const hour = h % 12 || 12;
    const period = h < 12 ? "a" : "p";
    return `${hour}:${String(m).padStart(2, "0")}${period}`;
  }

  function formatHour(hour: number): string {
    if (hour === 0) return "12a";
    if (hour === 12) return "12p";
    if (hour > 12) return `${hour - 12}p`;
    return `${hour}a`;
  }

  // Separate blocks (take time slots) from reminders (lines)
  const blockEvents = events.filter((e) => e.type !== "reminder");
  const reminderEvents = events.filter((e) => e.type === "reminder");

  // ── Greedy lane clustering for overlap layout ──
  // Computes a global column index + column count for each event based on
  // the maximum concurrent events in its connected overlap cluster.
  // This replaces the old per-event width calculation that produced
  // inconsistent widths for partial overlaps (A-B-C chains).
  const overlapLayout = useMemo(() => {
    const layout = new Map<string, { colIndex: number; colCount: number }>();

    // Sort by start time for deterministic ordering
    const sorted = [...blockEvents].sort((a, b) => {
      const aStart = timeToMinutes(isoToLocalTime(a.startAt));
      const bStart = timeToMinutes(isoToLocalTime(b.startAt));
      return aStart - bStart;
    });

    // Assign each event to a lane (column) using a greedy algorithm:
    // For each event, find the first lane whose last event ends before
    // this event starts. If none, create a new lane.
    const lanes: Array<{ endTime: number }> = [];

    for (const event of sorted) {
      const start = timeToMinutes(isoToLocalTime(event.startAt));
      let end = timeToMinutes(isoToLocalTime(event.endAt));
      if (end <= start) end += 24 * 60;

      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i].endTime <= start) {
          assignedLane = i;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push({ endTime: 0 });
      }
      lanes[assignedLane].endTime = end;
      layout.set(event.id, { colIndex: assignedLane, colCount: 0 });
    }

    // Now compute the max concurrent events (colCount) for each event.
    // For each event, find all events that overlap it and take the max
    // of their lane counts + 1.
    for (const event of sorted) {
      const start = timeToMinutes(isoToLocalTime(event.startAt));
      let end = timeToMinutes(isoToLocalTime(event.endAt));
      if (end <= start) end += 24 * 60;

      // Count how many events overlap this one
      let maxCols = 1;
      for (const other of sorted) {
        if (other.id === event.id) continue;
        const oStart = timeToMinutes(isoToLocalTime(other.startAt));
        let oEnd = timeToMinutes(isoToLocalTime(other.endAt));
        if (oEnd <= oStart) oEnd += 24 * 60;
        if (oStart < end && oEnd > start) {
          maxCols = Math.max(maxCols, (layout.get(other.id)?.colIndex ?? 0) + 1);
        }
      }
      const entry = layout.get(event.id);
      if (entry) {
        entry.colCount = Math.max(entry.colCount, maxCols);
      }
    }

    // Normalize: ensure all events in the same overlap cluster share
    // the same colCount (the max across the cluster)
    for (const event of sorted) {
      const start = timeToMinutes(isoToLocalTime(event.startAt));
      let end = timeToMinutes(isoToLocalTime(event.endAt));
      if (end <= start) end += 24 * 60;

      let clusterMax = layout.get(event.id)?.colCount ?? 1;
      for (const other of sorted) {
        if (other.id === event.id) continue;
        const oStart = timeToMinutes(isoToLocalTime(other.startAt));
        let oEnd = timeToMinutes(isoToLocalTime(other.endAt));
        if (oEnd <= oStart) oEnd += 24 * 60;
        if (oStart < end && oEnd > start) {
          clusterMax = Math.max(clusterMax, layout.get(other.id)?.colCount ?? 1);
        }
      }
      const entry = layout.get(event.id);
      if (entry) entry.colCount = clusterMax;
    }

    return layout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockEvents]);

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    // For blocks/tasks, validate end > start
    if (newType !== "reminder" && timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
      setError("End time must be after start time.");
      return;
    }

    // Convert local times to proper ISO strings (with timezone offset)
    // so the server stores correct UTC timestamps regardless of server timezone
    const startISO = new Date(`${date}T${newStart}:00`).toISOString();
    const endISO = newType === "reminder"
      ? new Date(`${date}T${newStart}:00`).toISOString()
      : new Date(`${date}T${newEnd}:00`).toISOString();

    // Add recurrence end date if enabled
    const body: Record<string, unknown> = {
      title: newTitle,
      startAt: startISO,
      endAt: endISO,
      type: newType,
      color: newColor,
      notify: newNotify,
    };
    if (enableRecurrence && recurrenceEndDate) {
      body.recurrenceEndDate = recurrenceEndDate;
      if (recurrenceDays.length > 0) {
        body.recurrenceDays = recurrenceDays;
      }
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        clearApiCache();

        // Offline response — event was queued in the SW outbox
        if (data.offline && data._pending) {
          // Add the temporary event to the UI so it shows immediately
          const tempEvent: CalendarEvent = {
            id: data.id,
            title: data.title,
            startAt: data.startAt,
            endAt: data.endAt,
            type: data.type,
            color: data.color,
            notify: data.notify,
            _pending: true,
          };
          // Only add if it falls on the currently viewed date
          const d = new Date(tempEvent.startAt);
          const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (localDateStr === date) {
            setEvents((prev) => [...prev, tempEvent]);
            addEventToCache(date, tempEvent);
          }
          setSuccessMsg("Saved offline — will sync when online.");
          play("success");
          setShowAddForm(false);
          setNewTitle("");
          setNewColor(null);
          setNewNotify(true);
          setEnableRecurrence(false);
          setRecurrenceEndDate("");
          setRecurrenceDays([]);
          setError(null);
          setTimeout(() => setSuccessMsg(null), 3000);
          return;
        }

        // If recurring, API returns { created, events }
        if (data.events && Array.isArray(data.events)) {
          // Clear SW API cache then refetch events for this date
          if ("caches" in window) {
            await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
          }
          const refetch = await fetch(`/api/events?date=${date}`);
          if (refetch.ok) {
            const refreshed = await refetch.json();
            const filtered = refreshed.filter((e: { startAt: string }) => {
              const d = new Date(e.startAt);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return localDateStr === date;
            });
            setEvents(filtered);
            syncEventsToCache(date, filtered);
          }
          setSuccessMsg(`Created ${data.created} recurring events.`);
        } else {
          // Single event
          setEvents((prev) => [...prev, data]);
          addEventToCache(date, data);
          // Clear SW API cache so next refetch includes the new event
          if ("caches" in window) {
            await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
          }
          setSuccessMsg(null);
        }
        setShowAddForm(false);
        setNewTitle("");
        setNewColor(null);
        setNewNotify(true);
        setEnableRecurrence(false);
        setRecurrenceEndDate("");
        setRecurrenceDays([]);
        setError(null);
        // Clear success message after 3 seconds
        if (data.events) {
          setTimeout(() => setSuccessMsg(null), 3000);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create event.");
        play("error");
      }
    } catch {
      setError("Network error.");
      play("error");
    }
  }

  async function handleDeleteEvent(id: string) {
    // If it's a pending offline event, just remove it from local state
    if (id.startsWith("offline-")) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      play("delete");
      return;
    }
    // Optimistically remove from UI immediately
    setEvents((prev) => prev.filter((e) => e.id !== id));
    deleteEventFromCache(id);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (res.ok) {
        play("delete");
        clearApiCache();
      } else {
        // Delete failed — refetch to restore the event
        const refetch = await fetch(`/api/events?date=${date}`);
        if (refetch.ok) {
          const data = await refetch.json();
          const filtered = data.filter((e: { startAt: string }) => {
            const d = new Date(e.startAt);
            const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return localDateStr === date;
          });
          setEvents(filtered);
        }
      }
    } catch {
      // Network error — event stays removed from UI (offline queue will handle it)
    }
  }

  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent || !newTitle.trim()) return;

    if (newType !== "reminder" && timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
      setError("End time must be after start time.");
      return;
    }

    const startISO = new Date(`${date}T${newStart}:00`).toISOString();
    const endISO = newType === "reminder"
      ? new Date(`${date}T${newStart}:00`).toISOString()
      : new Date(`${date}T${newEnd}:00`).toISOString();

    // Bulk update — update all events in the recurring series
    if (editAllInSeries && editingEvent.seriesId) {
      try {
        const res = await fetch("/api/events/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seriesId: editingEvent.seriesId,
            title: newTitle,
            type: newType,
            color: newColor,
            notify: newNotify,
          }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          clearApiCache();
          // Refetch events for this date to reflect the bulk update
          if ("caches" in window) {
            await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
          }
          const refetch = await fetch(`/api/events?date=${date}`);
          if (refetch.ok) {
            const refreshed = await refetch.json();
            const filtered = refreshed.filter((ev: { startAt: string }) => {
              const d = new Date(ev.startAt);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return localDateStr === date;
            });
            setEvents(filtered);
            syncEventsToCache(date, filtered);
          }
          setSuccessMsg(`Updated ${data.updated} events in series.`);
          play("success");
          setEditingEvent(null);
          setNewTitle("");
          setNewColor(null);
          setNewNotify(true);
          setEditAllInSeries(false);
          setError(null);
          setTimeout(() => setSuccessMsg(null), 3000);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to update series.");
        }
      } catch {
        setError("Network error.");
      }
      return;
    }

    // Single event update
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          startAt: startISO,
          endAt: endISO,
          type: newType,
          color: newColor,
          notify: newNotify,
        }),
      });

      if (res.ok) {
        const updated = await res.json().catch(() => ({}));
        clearApiCache();
        // Offline response — update was queued in the SW outbox
        if (updated.offline) {
          // Update the local event with the new values and mark as pending
          const localUpdated: CalendarEvent = {
            ...editingEvent,
            title: newTitle,
            startAt: startISO,
            endAt: endISO,
            type: newType,
            color: newColor,
            notify: newNotify,
            _pending: true,
          };
          setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? localUpdated : e)));
          updateEventInCache(localUpdated);
          setSuccessMsg("Saved offline — will sync when online.");
          play("success");
          setEditingEvent(null);
          setNewTitle("");
          setNewColor(null);
          setNewNotify(true);
          setEditAllInSeries(false);
          setError(null);
          setTimeout(() => setSuccessMsg(null), 3000);
          return;
        }
        setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? updated : e)));
        updateEventInCache(updated);
        play("success");
        // Clear SW API cache so stale events data isn't served on next refetch
        if ("caches" in window) {
          await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
        }
        setEditingEvent(null);
        setNewTitle("");
        setNewColor(null);
        setNewNotify(true);
        setEditAllInSeries(false);
        setError(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update event.");
      }
    } catch {
      setError("Network error.");
    }
  }

  function openEditForm(event: CalendarEvent) {
    const startStr = isoToLocalTime(event.startAt);
    const endStr = isoToLocalTime(event.endAt);
    setEditingEvent(event);
    setNewTitle(event.title);
    setNewStart(startStr);
    setNewEnd(endStr);
    setNewType(event.type);
    setNewColor(event.color || null);
    setNewNotify(event.notify !== false); // default to true if undefined
    setEnableRecurrence(false);
    setRecurrenceEndDate("");
    setRecurrenceDays([]);
    setEditAllInSeries(false);
    setSeriesCount(null);
    setError(null);
    setShowAddForm(false);

    // Fetch the count of future events in this series for the delete label
    if (event.seriesId) {
      fetch(`/api/events/bulk?seriesId=${event.seriesId}&fromDate=${date}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.count != null) setSeriesCount(data.count);
        })
        .catch(() => { /* non-critical */ });
    }
  }

  function closeForm() {
    setShowAddForm(false);
    setEditingEvent(null);
    setNewTitle("");
    setNewColor(null);
    setNewNotify(true);
    setError(null);
    setEnableRecurrence(false);
    setRecurrenceEndDate("");
    setRecurrenceDays([]);
    setEditAllInSeries(false);
    setShowSeriesList(false);
    setSeriesEvents([]);
  }

  // Fetch all events in a series for the series list view
  async function fetchSeriesEvents(seriesId: string) {
    setLoadingSeries(true);
    try {
      const res = await fetch(`/api/events?seriesId=${seriesId}`);
      if (res.ok) {
        const series = await res.json();
        if (Array.isArray(series)) {
          series.sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
          setSeriesEvents(series);
        }
      }
    } catch {
      // Offline fallback: filter from IndexedDB cache
      try {
        const db = getOfflineDB();
        const cached = await db.events.toArray();
        const series = cached
          .filter((e) => e.seriesId === seriesId)
          .map((e) => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt,
            endAt: e.endAt || e.startAt,
            type: e.type as CalendarEvent["type"],
            color: e.color,
            seriesId: e.seriesId,
          }))
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        setSeriesEvents(series);
      } catch { /* IndexedDB not available */ }
    } finally {
      setLoadingSeries(false);
    }
  }

  // Delete a single event from the series list
  async function deleteSingleEvent(eventId: string, eventDate: string) {
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (res.ok) {
        clearApiCache();
        if ("caches" in window) {
          await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
        }
        // Remove from series list
        setSeriesEvents((prev) => prev.filter((e) => e.id !== eventId));
        // Update series count
        if (editingEvent?.seriesId) {
          setSeriesCount((prev) => (prev != null ? prev - 1 : prev));
        }
        // Refresh day events if we're viewing that date
        if (eventDate === date) {
          const refetch = await fetch(`/api/events?date=${date}`);
          if (refetch.ok) {
            const refreshed = await refetch.json();
            const filtered = refreshed.filter((ev: { startAt: string }) => {
              const d = new Date(ev.startAt);
              const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return localDateStr === date;
            });
            setEvents(filtered);
            syncEventsToCache(date, filtered);
          }
        }
        play("delete");
      }
    } catch {
      setError("Network error.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl overflow-x-hidden px-3 py-3 sm:px-6 sm:py-6">
      {/* Offline banner — only show after mount to avoid hydration mismatch */}
      {mounted && !isOnline && (
        <div
          className="mb-3 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium sm:mb-4"
          style={{
            borderColor: "var(--color-warmth)",
            backgroundColor: "color-mix(in oklab, var(--color-warmth) 10%, transparent)",
            color: "var(--color-warmth)",
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-warmth)" }} />
          You&apos;re offline — changes will sync when you reconnect.
        </div>
      )}

      {/* Prayer times bar — compact horizontal strip on mobile, cards on desktop */}
      {prayerTimes && (
        <div
          className="mb-3 sm:mb-4"
          role="group"
          aria-label="Prayer times"
        >
          {/* Mobile: single-row scrollable strip with inline label+time */}
          <div className="flex gap-1 overflow-x-auto lg:hidden" style={{ scrollbarWidth: "none" }}>
            {PRAYER_NAMES.map((prayer) => {
              const rawTime = prayerTimes[prayer.key];
              if (!rawTime) return null;
              const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
              const log = prayerLogs.find((l) => l.prayerName === prayer.key);
              const isPrayed = log?.status === "prayed" || log?.status === "assumed_prayed";
              const isClickable = prayer.isPrayer;
              return (
                <button
                  key={prayer.key}
                  onClick={isClickable ? () => setCheckinPopup({ prayer: prayer.key as PrayerKey, label: prayer.label }) : undefined}
                  className="flex shrink-0 flex-col items-center justify-center rounded-lg border px-2 py-1.5 transition-colors"
                  style={{
                    minWidth: 52,
                    minHeight: 44,
                    borderColor: isPrayed ? "var(--color-success)" : "var(--color-paper-3)",
                    backgroundColor: isPrayed ? "color-mix(in oklab, var(--color-success) 8%, var(--color-paper))" : "var(--color-paper)",
                    cursor: isClickable ? "pointer" : "default",
                  }}
                  disabled={!isClickable}
                >
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold leading-none" style={{ color: prayer.color }}>
                    {prayer.label === "Sunrise" ? "Sunrise" : prayer.label}
                    {isPrayed && <Check className="h-2.5 w-2.5" style={{ color: "var(--color-success)" }} />}
                  </span>
                  <span className="mt-0.5 text-[10px] tabular-nums leading-none" style={{ color: "var(--color-ink-muted)" }}>
                    {formatTimeCompact(time)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop: cards with full label and time */}
          <div className="hidden flex-wrap gap-1.5 lg:flex">
            {PRAYER_NAMES.map((prayer) => {
              const rawTime = prayerTimes[prayer.key];
              if (!rawTime) return null;
              const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
              const log = prayerLogs.find((l) => l.prayerName === prayer.key);
              const isPrayed = log?.status === "prayed" || log?.status === "assumed_prayed";
              const isClickable = prayer.isPrayer;
              return (
                <button
                  key={prayer.key}
                  onClick={isClickable ? () => setCheckinPopup({ prayer: prayer.key as PrayerKey, label: prayer.label }) : undefined}
                  className="flex flex-col items-center gap-0 rounded-lg border px-3 py-1.5 transition-colors"
                  style={{
                    minHeight: 44,
                    borderColor: isPrayed ? "var(--color-success)" : "var(--color-paper-3)",
                    backgroundColor: isPrayed ? "color-mix(in oklab, var(--color-success) 8%, var(--color-paper))" : "var(--color-paper)",
                    cursor: isClickable ? "pointer" : "default",
                  }}
                  disabled={!isClickable}
                >
                  <span className="flex items-center gap-0.5 text-xs font-medium leading-tight" style={{ color: prayer.color }}>
                    {prayer.label}
                    {isPrayed && <Check className="h-3 w-3" style={{ color: "var(--color-success)" }} />}
                  </span>
                  <span className="text-xs tabular-nums leading-tight" style={{ color: "var(--color-ink-muted)" }}>
                    {formatTime(time)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Homework badge — shows count of pending homework due this day */}
      {dayHomeworkCount > 0 && (
        <Link
          href="/goals#homework"
          className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80 sm:mb-4"
          style={{
            borderColor: "var(--color-warmth)",
            backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, var(--color-paper))",
            color: "var(--color-ink)",
          }}
        >
          <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--color-warmth)" }} />
          <span className="flex-1">
            {dayHomeworkCount} assignment{dayHomeworkCount > 1 ? "s" : ""} due today
          </span>
          <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>View →</span>
        </Link>
      )}

      {/* No location message — only when location is actually not set */}
      {!prayerTimes && !loading && !locationSet && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border p-3 text-sm sm:mb-4"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}
        >
          <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          <span>
            Set your location in{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2" style={{ color: "var(--color-accent)" }}>
              Settings
            </Link>{" "}
            to see prayer times.
          </span>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div
          className="mb-3 rounded-xl border p-3 text-sm sm:mb-4"
          style={{ borderColor: "var(--color-success)", backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)", color: "var(--color-success)" }}
        >
          {successMsg}
        </div>
      )}

      {/* Day grid */}
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        {/* View More / Hide button for early hours */}
        <button
          onClick={() => setShowEarlyHours(!showEarlyHours)}
          className="flex w-full items-center justify-center gap-1 border-b py-1.5 text-[11px] font-medium"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          {showEarlyHours ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Hide 12 AM – 4 AM
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show 12 AM – 4 AM
            </>
          )}
        </button>
        {/* Grid container — clips early hours when collapsed */}
        <div
          className="relative overflow-hidden"
          style={{
            height: showEarlyHours
              ? HOURS.length * HOUR_HEIGHT
              : (HOURS.length - DEFAULT_START_HOUR) * HOUR_HEIGHT,
          }}
        >
          <div
            className="relative"
            style={{
              height: HOURS.length * HOUR_HEIGHT,
              transform: showEarlyHours ? "none" : `translateY(-${DEFAULT_START_HOUR * HOUR_HEIGHT}px)`,
            }}
          >
          {/* Hour lines + labels */}
          {HOURS.map((hour, i) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex"
              style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <div
                className="shrink-0 pt-0.5 pr-1.5 text-right text-[11px] font-medium tabular-nums sm:pr-2"
                style={{ color: "var(--color-ink-muted)", width: TIME_COL }}
              >
                {formatHour(hour)}
              </div>
              <div
                className="flex-1 border-t"
                style={{ borderColor: "var(--color-paper-3)" }}
              />
            </div>
          ))}

          {/* Prayer window background bands — translucent, behind events (z-0) */}
          {prayerTimes &&
            PRAYER_NAMES.filter((p) => p.isPrayer).map((prayer, i, arr) => {
              const rawTime = prayerTimes[prayer.key];
              if (!rawTime) return null;
              const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
              const startMin = timeToMinutes(time);
              // Window ends at the next prayer time
              const nextPrayer = arr[i + 1];
              const nextRaw = nextPrayer ? prayerTimes[nextPrayer.key] : null;
              const nextTime = nextPrayer && nextRaw
                ? (nextPrayer.key === "asr" ? getDisplayAsrTime(nextRaw) : nextRaw)
                : null;
              const endMin = nextTime ? timeToMinutes(nextTime) : startMin + 60;
              if (startMin < HOURS[0] * 60 && endMin < HOURS[0] * 60) return null;
              if (startMin > (HOURS[HOURS.length - 1] + 1) * 60) return null;
              const top = minutesToTop(startMin);
              const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 8);
              return (
                <div
                  key={`band-${prayer.key}`}
                  className="absolute z-0 pointer-events-none"
                  style={{
                    top,
                    height,
                    left: TIME_COL,
                    right: 0,
                    backgroundColor: `color-mix(in oklab, ${prayer.color} 2%, transparent)`,
                    borderTop: `1px dashed color-mix(in oklab, ${prayer.color} 12%, transparent)`,
                  }}
                />
              );
            })}

          {/* Prayer time lines — colored line with label pill (z-10, behind events at z-20) */}
          {prayerTimes &&
            PRAYER_NAMES.map((prayer) => {
              const rawTime = prayerTimes[prayer.key];
              if (!rawTime) return null;
              // Asr time: display API time + 1 hour
              const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
              const minutes = timeToMinutes(time);
              if (minutes < HOURS[0] * 60 || minutes > (HOURS[HOURS.length - 1] + 1) * 60) return null;
              const top = minutesToTop(minutes);
              const log = prayerLogs.find((l) => l.prayerName === prayer.key);
              const isPrayed = log?.status === "prayed" || log?.status === "assumed_prayed";
              const isClickable = prayer.isPrayer;
              return (
                <div
                  key={prayer.key}
                  className="absolute z-10 flex items-center pr-1 pointer-events-none"
                  style={{ top: top - 7, left: TIME_COL, right: 0 }}
                >
                  <div className="h-px flex-1" style={{ backgroundColor: prayer.color, opacity: 0.3 }} />
                  <button
                    onClick={isClickable ? (e: React.MouseEvent) => { e.stopPropagation(); setCheckinPopup({ prayer: prayer.key as PrayerKey, label: prayer.label }); } : undefined}
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium transition-transform sm:px-2 sm:text-[10px] pointer-events-auto"
                    style={{
                      backgroundColor: isPrayed ? "color-mix(in oklab, var(--color-success) 10%, var(--color-paper))" : "var(--color-paper)",
                      color: prayer.color,
                      border: `1px solid ${isPrayed ? "var(--color-success)" : prayer.color}`,
                      cursor: isClickable ? "pointer" : "default",
                    }}
                  >
                    {prayer.label} {formatTime(time)}
                    {isPrayed && " ✓"}
                  </button>
                </div>
              );
            })}

          {/* Reminder lines — each reminder is a horizontal line with its own color */}
          {reminderEvents.map((event) => {
            const startStr = isoToLocalTime(event.startAt);
            const minutes = timeToMinutes(startStr);
            if (minutes < HOURS[0] * 60 || minutes > (HOURS[HOURS.length - 1] + 1) * 60) return null;
            const top = minutesToTop(minutes);
            const color = getReminderColor(event.title, event.color);

            return (
              <div
                key={event.id}
                className="absolute z-25 flex items-center pr-1 group"
                style={{ top: top - 7, left: TIME_COL, right: 0 }}
              >
                <div className="h-0.5 flex-1" style={{ backgroundColor: color, opacity: 0.7 }} />
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEditForm(event); }}
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 sm:px-2 sm:text-[10px]"
                  style={{
                    backgroundColor: "var(--color-paper)",
                    color: color,
                    border: `1px solid ${color}`,
                    cursor: "pointer",
                  }}
                >
                  {event.title} · {formatTime(startStr)}
                </button>
                <div className="h-0.5 w-3 sm:w-4" style={{ backgroundColor: color, opacity: 0.7 }} />
                {/* Delete button — appears on hover */}
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                  className="ml-1 hidden shrink-0 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:block"
                  aria-label="Delete reminder"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Tap-to-add zones — 44px touch targets */}
          {HOURS.map((hour, i) => (
            <button
              key={`add-${hour}`}
              className="absolute flex items-center justify-center opacity-0 transition-opacity hover:opacity-100"
              style={{
                top: i * HOUR_HEIGHT,
                height: HOUR_HEIGHT,
                left: TIME_COL,
                right: 0,
              }}
              onClick={() => {
                setNewStart(`${String(hour).padStart(2, "0")}:00`);
                setNewEnd(`${String(hour + 1).padStart(2, "0")}:00`);
                setNewType("block");
                setShowAddForm(true);
              }}
              aria-label={`Add event at ${hour}:00`}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}

          {/* Block events — take up time slots */}
          {blockEvents.map((event) => {
            const startStr = isoToLocalTime(event.startAt);
            const endStr = isoToLocalTime(event.endAt);
            const startMin = timeToMinutes(startStr);
            const endMin = timeToMinutes(endStr);
            const top = minutesToTop(startMin);
            const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);

            const layout = overlapLayout.get(event.id) ?? { colIndex: 0, colCount: 1 };
            const widthPct = 100 / layout.colCount;
            const leftPct = layout.colIndex * widthPct;

            const eventColor = event.color && event.color.length >= 4 ? event.color : null;
            const borderColor = eventColor || TYPE_COLORS[event.type] || "var(--color-accent)";
            const bgColor = eventColor
              ? `color-mix(in oklab, ${eventColor} 18%, transparent)`
              : TYPE_BG[event.type] || TYPE_BG.block;

            return (
              <div
                key={event.id}
                onClick={() => openEditForm(event)}
                className="absolute z-20 cursor-pointer overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
                style={{
                  top,
                  height,
                  left: `calc(${TIME_COL}px + (100% - ${TIME_COL}px) * ${leftPct / 100})`,
                  width: `calc((100% - ${TIME_COL}px) * ${widthPct / 100} - 3px)`,
                  backgroundColor: bgColor,
                  borderColor,
                  borderLeftWidth: 3,
                }}
              >
                <div className="relative flex h-full flex-col items-center justify-center gap-0.5 px-1.5 py-1 sm:px-2">
                  <p className="w-full truncate text-center text-[11px] font-medium leading-tight sm:text-xs" style={{ color: "var(--color-ink)" }}>
                    {event.title}
                    {event._pending && (
                      <span className="ml-1 inline-block text-[11px] align-middle" style={{ color: "var(--color-warmth)" }} title="Pending sync">
                        ●
                      </span>
                    )}
                  </p>
                  {endStr && (
                    <p className="w-full truncate text-center text-[11px] font-normal leading-tight sm:text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      {formatTime(startStr)} – {formatTime(endStr)}
                    </p>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(event); }}
                    className="absolute right-0.5 top-0.5 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100 sm:opacity-40"
                    aria-label="Delete event"
                    style={{ minHeight: 44, minWidth: 44 }}
                  >
                    <X className="h-3 w-3" style={{ color: "var(--color-ink-muted)" }} />
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Floating action button — sits above mobile bottom nav, top-right on desktop */}
      <button
        onClick={() => {
          setNewTitle("");
          setNewStart("09:00");
          setNewEnd("10:00");
          setNewType("block");
          setNewColor(null);
          setNewNotify(true);
          setEnableRecurrence(false);
          setRecurrenceEndDate("");
          setRecurrenceDays([]);
          setEditingEvent(null);
          setShowAddForm(true);
          play("open");
        }}
        className="fixed right-5 bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 lg:bottom-6"
        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        aria-label="Add event"
      >
        <Plus className="h-5 w-5" />
      </button>

      {loading && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Loading...
        </p>
      )}
      {error && !showAddForm && !editingEvent && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-error)" }}>{error}</p>
      )}

      {/* Add/Edit event modal dialog */}
      {(showAddForm || editingEvent) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={closeForm}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label={editingEvent ? "Edit event" : "New event"}
            onSubmit={editingEvent ? handleUpdateEvent : handleAddEvent}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl border p-5 sm:rounded-2xl"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", maxHeight: "90dvh", overflowY: "auto", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                {editingEvent ? "Edit event" : "New event"}
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="flex -mr-1 -mt-1 h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" style={{ color: "var(--color-ink-muted)" }} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {/* Title */}
              <input
                type="text"
                placeholder="What's this about?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                required
                aria-label="Event title"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
              />

              {/* Type toggle: Block vs Reminder */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewType("block")}
                  className="rounded-lg border-2 px-2 py-2 text-xs font-medium transition-colors"
                  style={{
                    borderColor: newType === "block" ? "var(--color-ink)" : "var(--color-paper-3)",
                    backgroundColor: newType === "block" ? "var(--color-ink)" : "var(--color-paper-2)",
                    color: newType === "block" ? "var(--color-paper)" : "var(--color-ink-soft)",
                    minHeight: 44,
                  }}
                >
                  Block
                </button>
                <button
                  type="button"
                  onClick={() => setNewType("reminder")}
                  className="rounded-lg border-2 px-2 py-2 text-xs font-medium transition-colors"
                  style={{
                    borderColor: newType === "reminder" ? "var(--color-ink)" : "var(--color-paper-3)",
                    backgroundColor: newType === "reminder" ? "var(--color-ink)" : "var(--color-paper-2)",
                    color: newType === "reminder" ? "var(--color-paper)" : "var(--color-ink-soft)",
                    minHeight: 44,
                  }}
                >
                  Reminder
                </button>
              </div>

              {/* Color picker — polished grid with label and check indicator */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
                    Color
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {newColor === null ? "Auto" : EVENT_COLORS.find((c) => c.value === newColor)?.label || "Custom"}
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                  <button
                    type="button"
                    onClick={() => setNewColor(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] font-medium transition-all"
                    style={{
                      borderColor: newColor === null ? "var(--color-ink)" : "var(--color-paper-3)",
                      backgroundColor: "var(--color-paper-2)",
                      color: "var(--color-ink-muted)",
                      transform: newColor === null ? "scale(1.1)" : "scale(1)",
                      outline: newColor === null ? "2px solid var(--color-ink)" : "none",
                      outlineOffset: "1px",
                    }}
                    aria-label="Default color (auto)"
                    title="Auto"
                  >
                    Auto
                  </button>
                  {EVENT_COLORS.map((c) => {
                    const isSelected = newColor === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setNewColor(c.value)}
                        className="relative h-8 w-8 rounded-lg transition-all"
                        style={{
                          backgroundColor: c.value,
                          transform: isSelected ? "scale(1.1)" : "scale(1)",
                          outline: isSelected ? `2px solid ${c.value}` : "none",
                          outlineOffset: "1px",
                          boxShadow: isSelected ? `0 0 0 1px var(--color-paper)` : "none",
                        }}
                        aria-label={c.label}
                        title={c.label}
                  >
                        {isSelected && (
                          <Check
                            className="absolute inset-0 m-auto h-4 w-4"
                            style={{
                              color: "var(--color-paper)",
                              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time inputs — hide end time for reminders */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    aria-label="Start time"
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
                  />
                </div>
                {newType !== "reminder" && (
                  <div className="flex-1">
                    <input
                      type="time"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      aria-label="End time"
                      className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
                    />
                  </div>
                )}
              </div>

              {/* Notify toggle — per-event push notification control */}
              <button
                type="button"
                onClick={() => setNewNotify(!newNotify)}
                aria-pressed={newNotify}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors"
                style={{
                  borderColor: newNotify ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: newNotify ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "var(--color-paper-2)",
                }}
              >
                <span className="flex items-center gap-2" style={{ color: "var(--color-ink)" }}>
                  {newNotify ? <Bell className="h-4 w-4" style={{ color: "var(--color-accent)" }} /> : <BellOff className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />}
                  Notify 15 min before
                </span>
                <span
                  className="relative h-5 w-9 rounded-full transition-colors"
                  style={{ backgroundColor: newNotify ? "var(--color-accent)" : "var(--color-paper-3)" }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ transform: newNotify ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </span>
              </button>

              {/* Recurrence option — only for new events, not editing */}
              {!editingEvent && (
                <div
                  className="rounded-lg border p-2.5"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enableRecurrence}
                      onChange={(e) => {
                        setEnableRecurrence(e.target.checked);
                        if (e.target.checked && recurrenceDays.length === 0) {
                          // Default to the current day of the week (in user's local timezone)
                          const dow = new Date(date + "T00:00:00").getDay();
                          setRecurrenceDays([dow]);
                        }
                      }}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: "var(--color-accent)" }}
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-ink)" }}>
                      <Repeat className="h-3.5 w-3.5" style={{ color: "var(--color-ink-muted)" }} />
                      Repeat
                    </span>
                  </label>

                  {enableRecurrence && (
                    <div className="mt-2.5 flex flex-col gap-2.5">
                      {/* Day-of-week picker */}
                      <div>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {["S", "M", "T", "W", "T", "F", "S"].map((dayLabel, idx) => {
                            const isSelected = recurrenceDays.includes(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setRecurrenceDays(recurrenceDays.filter((d) => d !== idx));
                                  } else {
                                    setRecurrenceDays([...recurrenceDays, idx].sort((a, b) => a - b));
                                  }
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-medium transition-colors"
                                style={{
                                  backgroundColor: isSelected ? "var(--color-ink)" : "var(--color-paper)",
                                  color: isSelected ? "var(--color-paper)" : "var(--color-ink-muted)",
                                  border: `1px solid ${isSelected ? "var(--color-ink)" : "var(--color-paper-3)"}`,
                                }}
                                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx]}
                              >
                                {dayLabel}
                              </button>
                            );
                          })}
                        </div>
                        {recurrenceDays.length === 0 && (
                          <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-error)" }}>
                            Select at least one day.
                          </p>
                        )}
                      </div>

                      {/* End date */}
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        required={enableRecurrence}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 44 }}
                      />

                      {/* Summary */}
                      {recurrenceDays.length > 0 && recurrenceEndDate && (
                        <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                          Every{" "}
                          {recurrenceDays
                            .sort((a, b) => a - b)
                            .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                            .join(", ")}{" "}
                          until {new Date(recurrenceEndDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Edit-all-in-series toggle for recurring events */}
              {editingEvent && editingEvent.seriesId && (
                <>
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs"
                    style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
                  >
                    <input
                      type="checkbox"
                      checked={editAllInSeries}
                      onChange={(e) => setEditAllInSeries(e.target.checked)}
                      className="h-4 w-4"
                      style={{ accentColor: "var(--color-ink)" }}
                    />
                    <span style={{ color: "var(--color-ink-soft)" }}>
                      Apply changes to <strong style={{ color: "var(--color-ink)" }}>all {seriesCount != null ? `${seriesCount} ` : ""}events</strong> in this series
                    </span>
                    {/* Clickable link to view all events in series */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!showSeriesList) {
                          fetchSeriesEvents(editingEvent.seriesId!);
                        }
                        setShowSeriesList(!showSeriesList);
                      }}
                      className="ml-auto shrink-0 text-[11px] font-medium underline underline-offset-2"
                      style={{ color: "var(--color-accent)" }}
                    >
                      {showSeriesList ? "Hide list" : "View all"}
                    </button>
                  </label>

                  {/* Series events list — expandable list of all occurrences */}
                  {showSeriesList && (
                    <div
                      className="rounded-lg border p-3"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                    >
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                        All events in this series
                      </p>
                      {loadingSeries ? (
                        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading...</p>
                      ) : seriesEvents.length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>No events found.</p>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {seriesEvents.map((ev) => {
                            const evDate = new Date(ev.startAt);
                            const evDateStr = `${evDate.getFullYear()}-${String(evDate.getMonth() + 1).padStart(2, "0")}-${String(evDate.getDate()).padStart(2, "0")}`;
                            const isCurrent = ev.id === editingEvent.id;
                            const evEnd = new Date(ev.endAt);
                            const timeFmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                            return (
                              <div
                                key={ev.id}
                                className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs"
                                style={{
                                  borderColor: isCurrent ? "var(--color-accent)" : "var(--color-paper-3)",
                                  backgroundColor: isCurrent ? "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" : "var(--color-paper)",
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink)" }}>
                                  {evDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                  <span className="ml-1.5 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                                    {timeFmt(evDate)}
                                    {ev.endAt !== ev.startAt && ` - ${timeFmt(evEnd)}`}
                                  </span>
                                  {isCurrent && (
                                    <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "var(--color-accent)" }}>
                                      (editing)
                                    </span>
                                  )}
                                </span>
                                {/* Edit this specific occurrence */}
                                {!isCurrent && (
                                  <Link
                                    href={`/calendar/day?date=${evDateStr}`}
                                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                                    style={{ color: "var(--color-accent)" }}
                                    onClick={() => closeForm()}
                                  >
                                    Open
                                  </Link>
                                )}
                                {/* Delete this specific occurrence */}
                                <button
                                  type="button"
                                  onClick={() => deleteSingleEvent(ev.id, evDateStr)}
                                  className="shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                                  style={{ color: "var(--color-error)" }}
                                  aria-label="Delete this event"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        Tap &ldquo;Open&rdquo; to edit a single occurrence without affecting others.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Error message inside modal */}
              {error && (showAddForm || editingEvent) && (
                <p className="text-xs" style={{ color: "var(--color-error)" }}>{error}</p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enableRecurrence && (recurrenceDays.length === 0 || !recurrenceEndDate)}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
                >
                  {editingEvent ? (editAllInSeries ? "Save all" : "Save") : enableRecurrence ? "Add recurring" : "Add"}
                </button>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(editingEvent)}
                    className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--color-error)", color: "var(--color-error)", minHeight: 44 }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete event"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border p-5 text-center"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="mb-1 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              Delete event?
            </p>
            <p className="mb-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              &ldquo;{deleteConfirm.title}&rdquo; will be permanently removed.
              {deleteConfirm.seriesId && (
                <span className="mt-1 block" style={{ color: "var(--color-ink-muted)" }}>
                  Past events in this series will be preserved.
                </span>
              )}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  handleDeleteEvent(deleteConfirm.id);
                  setDeleteConfirm(null);
                  closeForm();
                }}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)", minHeight: 44 }}
              >
                Delete this one
              </button>
              {deleteConfirm.seriesId && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/events/bulk", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seriesId: deleteConfirm.seriesId, fromDate: date }),
                      });
                      if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        clearApiCache();
                        if ("caches" in window) {
                          await caches.keys().then((names) => Promise.all(names.filter((n) => n.includes("-api")).map((n) => caches.delete(n))));
                        }
                        const refetch = await fetch(`/api/events?date=${date}`);
                        if (refetch.ok) {
                          const refreshed = await refetch.json();
                          const filtered = refreshed.filter((ev: { startAt: string }) => {
                            const d = new Date(ev.startAt);
                            const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                            return localDateStr === date;
                          });
                          setEvents(filtered);
                        }
                        setSuccessMsg(`Deleted ${data.deleted} future events. Past events preserved.`);
                        play("delete");
                      } else {
                        const data = await res.json().catch(() => ({}));
                        setError(data.error || "Failed to delete future events.");
                      }
                    } catch {
                      setError("Network error.");
                    }
                    setDeleteConfirm(null);
                    closeForm();
                  }}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: "var(--color-error)", color: "var(--color-error)", minHeight: 44 }}
                >
                  Delete future events{seriesCount != null ? ` (${seriesCount} events)` : ""}
                </button>
              )}
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prayer check-in popup */}
      {checkinPopup && prayerTimes && (
        <PrayerCheckinPopup
          prayer={checkinPopup.prayer}
          prayerLabel={checkinPopup.label}
          date={date}
          timezone={userTimezone}
          madhab={userMadhab}
          timings={{
            fajr: prayerTimes.fajr,
            sunrise: prayerTimes.sunrise,
            dhuhr: prayerTimes.dhuhr,
            asr: prayerTimes.asr,
            maghrib: prayerTimes.maghrib,
            isha: prayerTimes.isha,
          }}
          existingStatus={prayerLogs.find((l) => l.prayerName === checkinPopup.prayer)?.status}
          onClose={() => setCheckinPopup(null)}
          onCheckedIn={(result) => {
            // Update local prayer logs state
            setPrayerLogs((prev) => {
              const filtered = prev.filter((l) => l.prayerName !== checkinPopup.prayer);
              return [...filtered, { prayerName: checkinPopup.prayer, status: result.status, wentToMasjid: result.wentToMasjid }];
            });
            // Update IndexedDB cache so the check-in persists across page navigations
            upsertPrayerLogToCache(date, checkinPopup.prayer, result.status, result.wentToMasjid);
            setCheckinPopup(null);
          }}
        />
      )}
    </div>
  );
}
