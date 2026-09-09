"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getOfflineDB } from "@/lib/offline/db";

interface CalendarEvent {
  id: string;
  title: string;
  details?: string | null;
  startAt: string;
  endAt: string;
  type: "block" | "task" | "reminder";
  color?: string | null;
  recurrenceRule?: string | null;
  seriesId?: string | null;
}

// Color palette for reminders — must match DayViewClient
const REMINDER_COLORS = [
  "#c2410c", "#0e7490", "#7c3aed", "#be185d",
  "#15803d", "#b45309", "#1e40af", "#9f1239",
];

function getReminderColor(title: string, chosenColor?: string | null): string {
  if (chosenColor && chosenColor.length >= 4) return chosenColor;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return REMINDER_COLORS[Math.abs(hash) % REMINDER_COLORS.length];
}

// Manual time formatter — avoids toLocaleTimeString which produces different
// output on Node.js (server) vs browser (client), causing hydration mismatches.
function formatEventTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  const hour = h % 12 || 12;
  const period = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

interface PrayerLogEntry {
  date: string;
  prayerName: string;
  status: string;
}

interface HomeworkDot {
  id: string;
  classColor: string | null;
}

export default function MonthViewClient({ year, month }: { year: number; month: number }) {
  const [eventsByDate, setEventsByDate] = useState<Record<string, CalendarEvent[]>>({});
  const [prayerLogsByDate, setPrayerLogsByDate] = useState<Record<string, PrayerLogEntry[]>>({});
  const [homeworkByDate, setHomeworkByDate] = useState<Record<string, HomeworkDot[]>>({});
  const [maxVisibleEvents, setMaxVisibleEvents] = useState(2);

  // Responsive event count — show more events on larger screens
  useEffect(() => {
    const updateMaxEvents = () => {
      const w = window.innerWidth;
      if (w >= 1280) setMaxVisibleEvents(5);      // xl: 5
      else if (w >= 1024) setMaxVisibleEvents(4);  // lg: 4
      else if (w >= 768) setMaxVisibleEvents(3);   // md: 3
      else if (w >= 640) setMaxVisibleEvents(3);   // sm: 3
      else setMaxVisibleEvents(2);                  // mobile: 2
    };
    updateMaxEvents();
    window.addEventListener("resize", updateMaxEvents);
    return () => window.removeEventListener("resize", updateMaxEvents);
  }, []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fromStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const toStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      // ── Step 1: Read from IndexedDB instantly (if cached) ──
      // Build date keys for the whole month and query IndexedDB
      try {
        const db = getOfflineDB();
        const dateKeys: string[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
          dateKeys.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        }

        const [cachedEvents, cachedLogs] = await Promise.all([
          db.events.where("_dateKey").anyOf(dateKeys).toArray(),
          db.prayerLogs.where("date").anyOf(dateKeys).toArray(),
        ]);

        if (cancelled) return;

        if (cachedEvents.length > 0) {
          const grouped: Record<string, CalendarEvent[]> = {};
          for (const e of cachedEvents) {
            const eventDate = e._dateKey;
            if (!grouped[eventDate]) grouped[eventDate] = [];
            grouped[eventDate].push({
              id: e.id,
              title: e.title,
              startAt: e.startAt,
              endAt: e.endAt ?? "",
              type: e.type as "block" | "task" | "reminder",
              color: e.color,
            });
          }
          for (const date of Object.keys(grouped)) {
            grouped[date].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
          }
          setEventsByDate(grouped);
        }

        if (cachedLogs.length > 0) {
          const grouped: Record<string, PrayerLogEntry[]> = {};
          for (const l of cachedLogs) {
            if (!grouped[l.date]) grouped[l.date] = [];
            grouped[l.date].push({
              date: l.date,
              prayerName: l.prayerName,
              status: l.status,
            });
          }
          setPrayerLogsByDate(grouped);
        }

        // If we have cached data, stop showing the spinner
        if (cachedEvents.length > 0 || cachedLogs.length > 0) {
          if (!cancelled) setLoading(false);
        }
      } catch {
        // IndexedDB read failed — continue to API fetch
      }

      // ── Step 2: Fetch from API in background ──
      try {
        const [eventsRes, logRes, hwRes] = await Promise.all([
          fetch(`/api/events?from=${fromStr}&to=${toStr}`),
          fetch(`/api/prayer-log/range?from=${fromStr}&to=${toStr}`).catch(() => null),
          fetch(`/api/homework?from=${fromStr}&to=${toStr}`).catch(() => null),
        ]);

        if (eventsRes.ok && !cancelled) {
          const events: CalendarEvent[] = await eventsRes.json().catch(() => []);
          if (!Array.isArray(events)) return;
          const grouped: Record<string, CalendarEvent[]> = {};
          for (const event of events) {
            const d = new Date(event.startAt);
            const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (!grouped[eventDate]) grouped[eventDate] = [];
            grouped[eventDate].push(event);
          }
          for (const date of Object.keys(grouped)) {
            grouped[date].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
          }
          if (!cancelled) setEventsByDate(grouped);

          // Cache events in IndexedDB
          try {
            const db = getOfflineDB();
            // Delete old events for this month's date range
            const dateKeys: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
              dateKeys.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
            }
            await db.events.where("_dateKey").anyOf(dateKeys).delete();
            await db.events.bulkPut(events.map((e) => {
              const d = new Date(e.startAt);
              const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return {
                id: e.id,
                userId: "",
                title: e.title,
                startAt: e.startAt,
                endAt: e.endAt,
                type: e.type,
                color: e.color || null,
                recurrenceRule: e.recurrenceRule || null,
                seriesId: e.seriesId || null,
                _dateKey: eventDate,
                _cachedAt: Date.now(),
              };
            }));
          } catch { /* non-critical */ }
        }

        if (logRes?.ok && !cancelled) {
          const logs: PrayerLogEntry[] = await logRes.json().catch(() => []);
          if (!Array.isArray(logs)) return;
          const grouped: Record<string, PrayerLogEntry[]> = {};
          for (const log of logs) {
            if (!grouped[log.date]) grouped[log.date] = [];
            grouped[log.date].push(log);
          }
          if (!cancelled) setPrayerLogsByDate(grouped);

          // Cache prayer logs in IndexedDB
          try {
            const db = getOfflineDB();
            const dateKeys: string[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
              dateKeys.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
            }
            await db.prayerLogs.where("date").anyOf(dateKeys).delete();
            await db.prayerLogs.bulkPut(logs.map((l) => ({
              id: `${l.date}_${l.prayerName}`,
              userId: "",
              date: l.date,
              prayerName: l.prayerName,
              status: l.status,
              wentToMasjid: null,
              lastCheckinAt: null,
              _cachedAt: Date.now(),
            })));
          } catch { /* non-critical */ }
        }

        // ── Fetch homework for calendar dots ──
        if (hwRes?.ok && !cancelled) {
          const hwData = await hwRes.json().catch(() => []);
          if (Array.isArray(hwData)) {
            // Fetch classes to get colors
            const classColors: Record<string, string> = {};
            try {
              const clsRes = await fetch("/api/classes");
              if (clsRes.ok) {
                const clsData = await clsRes.json();
                if (Array.isArray(clsData)) {
                  for (const c of clsData) {
                    classColors[c.id] = c.color;
                  }
                }
              }
            } catch { /* non-critical */ }

            const grouped: Record<string, HomeworkDot[]> = {};
            for (const hw of hwData) {
              if (hw.status === "completed") continue;
              if (!grouped[hw.dueDate]) grouped[hw.dueDate] = [];
              grouped[hw.dueDate].push({
                id: hw.id,
                classColor: hw.classId ? classColors[hw.classId] || null : null,
              });
            }
            if (!cancelled) setHomeworkByDate(grouped);
          }
        }
      } catch {
        // ignore — cached data is already showing
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [year, month]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const [today, setToday] = useState("");
  useEffect(() => {
    // Defer setState outside the effect body to avoid cascading renders
    Promise.resolve().then(() => {
      const now = new Date();
      setToday(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    });
  }, []);

  // Determine which days are "done" (past days in the current month)
  // A day is done if it's before today (in the current month)
  function isDayDone(dateStr: string): boolean {
    return dateStr < today;
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: Array<{ day: number | null; dateStr: string | null }> = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, dateStr });
  }

  const typeColors: Record<string, string> = {
    block: "var(--color-accent)",
    task: "var(--color-warmth)",
    reminder: "var(--color-ink-muted)",
  };

  return (
    <div>
      {/* Month header with day/month toggle */}
      <div className="border-b" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 overflow-x-hidden px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href={`/calendar/month?year=${prevYear}&month=${prevMonth}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-4">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-lg" style={{ color: "var(--color-ink)" }}>
              {monthNames[month - 1]} {year}
            </h1>

            <div
              className="flex shrink-0 rounded-lg border"
              style={{ borderColor: "var(--color-paper-3)" }}
            >
              <Link
                href="/calendar/day"
                className="min-h-11 rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                Day
              </Link>
              <Link
                href={`/calendar/month?year=${year}&month=${month}`}
                className="min-h-11 px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                Month
              </Link>
              <Link
                href="/calendar/list"
                className="min-h-11 rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                List
              </Link>
            </div>
          </div>

          <Link
            href={`/calendar/month?year=${nextYear}&month=${nextMonth}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 gap-0.5 sm:gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {cells.map((cell, i) => {
            if (!cell.day) {
              return <div key={i} className="min-h-[70px] sm:min-h-[100px] lg:min-h-[120px]" />;
            }

            const isToday = cell.dateStr === today;
            const done = cell.dateStr ? isDayDone(cell.dateStr) : false;
            const dayEvents = cell.dateStr ? eventsByDate[cell.dateStr] || [] : [];
            const blockEvents = dayEvents.filter((e) => e.type !== "reminder");
            const reminderEvents = dayEvents.filter((e) => e.type === "reminder");
            const dayLogs = cell.dateStr ? prayerLogsByDate[cell.dateStr] || [] : [];
            const prayedCount = dayLogs.filter((l) => l.status === "prayed" || l.status === "assumed_prayed").length;
            const allPrayed = prayedCount === 5;

            return (
              <Link
                key={i}
                href={`/calendar/day?date=${cell.dateStr}`}
                className="relative flex min-h-[70px] flex-col rounded-lg border p-1 text-xs transition-colors hover:bg-[var(--color-paper-2)] sm:min-h-[100px] sm:p-1.5 lg:min-h-[120px]"
                style={{
                  borderColor: isToday ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: isToday ? "var(--color-accent-faint)" : done ? "var(--color-paper-2)" : "var(--color-paper)",
                  opacity: done ? 0.6 : 1,
                }}
              >
                {/* Day number + homework squares + all-prayed check */}
                <span
                  className="mb-0.5 flex items-center justify-between gap-1 font-medium tabular-nums"
                  style={{
                    color: isToday ? "var(--color-accent)" : done ? "var(--color-ink-muted)" : "var(--color-ink)",
                    fontSize: 11,
                  }}
                >
                  <span className="flex items-center gap-1">
                    {cell.day}
                    {/* Homework squares — next to the number, distinct from notification dots */}
                    {cell.dateStr && homeworkByDate[cell.dateStr] && homeworkByDate[cell.dateStr].length > 0 && (
                      <span className="flex items-center gap-0.5">
                        {homeworkByDate[cell.dateStr].slice(0, 3).map((hw) => (
                          <span
                            key={hw.id}
                            className="h-1.5 w-1.5 shrink-0 rounded-[1px]"
                            style={{ backgroundColor: hw.classColor || "var(--color-warmth)" }}
                            title="Homework due"
                          />
                        ))}
                        {homeworkByDate[cell.dateStr].length > 3 && (
                          <span className="text-[9px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                            +{homeworkByDate[cell.dateStr].length - 3}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {allPrayed && (
                    <Check className="h-3 w-3" style={{ color: "var(--color-success)" }} />
                  )}
                </span>

                {/* Event blocks — show up to maxVisibleEvents, then "+N more" */}
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {blockEvents.slice(0, maxVisibleEvents).map((event) => {
                    const fmt = formatEventTime(event.startAt);
                    const color = (event.color && event.color.length >= 4 ? event.color : null) || typeColors[event.type] || "var(--color-accent)";
                    return (
                      <div
                        key={event.id}
                        className="truncate rounded px-1 py-0.5 text-[11px] font-medium leading-tight sm:text-[10px]"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
                          color: color,
                          borderLeft: `2px solid ${color}`,
                        }}
                      >
                        <span className="tabular-nums">{fmt}</span> {event.title}
                      </div>
                    );
                  })}
                  {blockEvents.length > maxVisibleEvents && (
                    <span
                      className="px-1 text-[11px] font-medium sm:text-[10px]"
                      style={{ color: "var(--color-ink-muted)" }}
                    >
                      +{blockEvents.length - maxVisibleEvents} more
                    </span>
                  )}

                  {/* Reminder indicators — colored dot + title on one line */}
                  {reminderEvents.length > 0 && (
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {reminderEvents.slice(0, maxVisibleEvents).map((event) => (
                        <div key={event.id} className="flex items-center gap-1 truncate">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: getReminderColor(event.title, event.color) }}
                          />
                          <span className="truncate text-[11px] leading-tight sm:text-[10px]" style={{ color: "var(--color-ink-soft)" }}>
                            {event.title}
                          </span>
                        </div>
                      ))}
                      {reminderEvents.length > maxVisibleEvents && (
                        <span className="text-[11px] sm:text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                          +{reminderEvents.length - maxVisibleEvents} more
                        </span>
                      )}
                    </div>
                  )}

                </div>

                {/* X overlay for done days — nice diagonal X */}
                {done && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 40 40"
                      className="h-full w-full"
                      preserveAspectRatio="xMidYMid meet"
                      style={{ opacity: 0.15 }}
                    >
                      <line x1="8" y1="8" x2="32" y2="32" stroke="var(--color-ink-muted)" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1="32" y1="8" x2="8" y2="32" stroke="var(--color-ink-muted)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {loading && (
          <p className="mt-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Loading events...
          </p>
        )}

        {/* Today link */}
        <div className="mt-6 text-center">
          <Link
            href="/calendar/day"
            className="text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--color-accent)" }}
          >
            Go to today
          </Link>
        </div>
      </div>
    </div>
  );
}
