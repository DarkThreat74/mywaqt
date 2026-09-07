"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar, Clock, Bell } from "lucide-react";
import { getOfflineDB } from "@/lib/offline/db";

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  type: "block" | "task" | "reminder";
  color?: string | null;
  notify?: boolean;
  seriesId?: string | null;
}

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

const PRAYER_NAMES: Array<{ key: keyof PrayerTimes; label: string; isPrayer: boolean }> = [
  { key: "fajr", label: "Fajr", isPrayer: true },
  { key: "sunrise", label: "Sunrise", isPrayer: false },
  { key: "dhuhr", label: "Dhuhr", isPrayer: true },
  { key: "asr", label: "Asr", isPrayer: true },
  { key: "maghrib", label: "Maghrib", isPrayer: true },
  { key: "isha", label: "Isha", isPrayer: true },
];

const TYPE_LABELS: Record<string, string> = {
  block: "Event",
  task: "Task",
  reminder: "Reminder",
};

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatTimeFromDate(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const hour = h % 12 || 12;
  const period = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function formatTimeRange(startAt: string, endAt: string, type: string): string {
  const start = new Date(startAt);
  if (type === "reminder") {
    return formatTimeFromDate(start);
  }
  const end = new Date(endAt);
  // If start and end are at the same time, show just the start
  if (start.getTime() === end.getTime()) {
    return formatTimeFromDate(start);
  }
  return `${formatTimeFromDate(start)} - ${formatTimeFromDate(end)}`;
}

function getEventLocalDate(startAt: string): string {
  const d = new Date(startAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(startAt: string, endAt: string): boolean {
  return getEventLocalDate(startAt) === getEventLocalDate(endAt);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ListViewClient({ today }: { today: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, 1 = next week, etc.
  // Locale-dependent label — computed AFTER mount to avoid hydration mismatch
  // (toLocaleDateString produces different output on Node.js vs browser)
  const [weekLabel, setWeekLabel] = useState<string>("");

  const weekStart = useMemo(() => addDays(today, weekOffset * 7), [today, weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  // Generate the 7 days of the current week view
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    // Load from IndexedDB cache first for instant display
    try {
      const db = getOfflineDB();
      const cached = await db.events.toArray();
      const filtered = cached.filter((e) => {
        const eventDate = getEventLocalDate(e.startAt);
        return eventDate >= weekStart && eventDate <= weekEnd;
      });
      if (filtered.length > 0) {
        setEvents(filtered.map((e) => ({
          id: e.id,
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt || e.startAt,
          type: e.type as CalendarEvent["type"],
          color: e.color,
          seriesId: e.seriesId,
        })));
      }
    } catch { /* IndexedDB not available yet */ }

    // Then fetch from API to get fresh data
    try {
      const res = await fetch(`/api/events?from=${weekStart}&to=${weekEnd}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEvents(data);
        }
      }
    } catch {
      // Offline — cached data is already showing from above
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  // Fetch prayer times for the week
  const fetchPrayerTimes = useCallback(async () => {
    try {
      const res = await fetch(`/api/prayer-times?date=${weekStart}`);
      if (res.ok) {
        const data = await res.json();
        // API returns flat object with fajr/sunrise/dhuhr/asr/maghrib/isha
        if (data.fajr) {
          setPrayerTimes({
            fajr: data.fajr,
            sunrise: data.sunrise,
            dhuhr: data.dhuhr,
            asr: data.asr,
            maghrib: data.maghrib,
            isha: data.isha,
          });
        }
      }
    } catch { /* non-critical */ }
  }, [weekStart]);

  useEffect(() => {
    // Defer to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      fetchEvents();
      fetchPrayerTimes();
    });
  }, [fetchEvents, fetchPrayerTimes]);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      map.set(day, []);
    }
    const now = new Date();
    for (const event of events) {
      const eventDate = getEventLocalDate(event.startAt);
      if (map.has(eventDate)) {
        // For today only: hide events that have already ended
        // (current time is past the event's end time)
        if (eventDate === today) {
          const end = new Date(event.endAt);
          if (end.getTime() < now.getTime()) continue;
        }
        map.get(eventDate)!.push(event);
      } else {
        // Event might be on a day outside our week — skip
      }
    }
    // Sort events within each day by start time
    for (const [, eventList] of map) {
      eventList.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return map;
  }, [events, weekDays, today]);

  const totalEvents = useMemo(() => {
    let count = 0;
    for (const [, eventList] of eventsByDay) {
      count += eventList.length;
    }
    return count;
  }, [eventsByDay]);

  // Format week range label — computed in useEffect to avoid hydration mismatch
  // (toLocaleDateString output differs between Node.js server and browser client)
  useEffect(() => {
    Promise.resolve().then(() => {
      const start = new Date(weekStart + "T00:00:00");
      const end = new Date(weekEnd + "T00:00:00");
      const startFmt = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endFmt = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      if (weekOffset === 0) setWeekLabel(`This Week · ${startFmt} - ${endFmt}`);
      else if (weekOffset === 1) setWeekLabel(`Next Week · ${startFmt} - ${endFmt}`);
      else if (weekOffset === -1) setWeekLabel(`Last Week · ${startFmt} - ${endFmt}`);
      else setWeekLabel(`${startFmt} - ${endFmt}`);
    });
  }, [weekStart, weekEnd, weekOffset]);

  return (
    <div className="overflow-x-hidden">
      {/* Header with week navigation and view toggle */}
      <div className="border-b" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          {/* Prev week */}
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Title + view toggle */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-4">
            <div className="text-center">
              <h1 className="truncate text-sm font-semibold tracking-tight sm:text-lg" style={{ color: "var(--color-ink)" }}>
                {weekLabel}
              </h1>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {totalEvents} {totalEvents === 1 ? "event" : "events"}
              </p>
            </div>

            {/* Day/Month/List toggle */}
            <div
              className="flex shrink-0 rounded-lg border"
              style={{ borderColor: "var(--color-paper-3)" }}
            >
              <Link
                href="/calendar/day"
                className="rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                Day
              </Link>
              <Link
                href="/calendar/month"
                className="px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                Month
              </Link>
              <span
                className="rounded-r-lg px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                List
              </span>
            </div>
          </div>

          {/* Next week */}
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-soft)" }}
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* List content */}
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--color-paper-3)", borderTopColor: "var(--color-accent)" }}
            />
            <p className="mt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading events...</p>
          </div>
        ) : totalEvents === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="mb-3 h-10 w-10" style={{ color: "var(--color-ink-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-ink-muted)" }}>
              No events {weekOffset === 0 ? "this week" : weekOffset > 0 ? "that week" : "that week"}.
            </p>
            <Link
              href="/calendar/day"
              className="mt-3 rounded-lg px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Go to Day view to add events
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {weekDays.map((day) => {
              const dayEvents = eventsByDay.get(day) || [];
              if (dayEvents.length === 0) return null;

              const [y, m, d] = day.split("-").map(Number);
              const dateObj = new Date(y, m - 1, d);
              const dayName = DAY_NAMES[dateObj.getDay()];
              const isToday = day === today;
              const isTomorrow = day === addDays(today, 1);
              const isYesterday = day === addDays(today, -1);

              // Prayer times for this day (if available and same as fetched day)
              const dayPrayerTimes = prayerTimes && day === weekStart ? prayerTimes : null;

              return (
                <div key={day}>
                  {/* Day header */}
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: isToday ? "var(--color-accent)" : "var(--color-paper-2)",
                        color: isToday ? "var(--color-paper)" : "var(--color-ink)",
                      }}
                    >
                      <span className="text-[10px] font-semibold uppercase leading-none">
                        {DAY_SHORT[dateObj.getDay()]}
                      </span>
                      <span className="text-lg font-bold leading-none mt-0.5">
                        {dateObj.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {dayName}
                      </h2>
                      <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                        {dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                        {isToday && <span className="ml-1.5 font-medium" style={{ color: "var(--color-accent)" }}>· Today</span>}
                        {isTomorrow && <span className="ml-1.5" style={{ color: "var(--color-ink-muted)" }}>· Tomorrow</span>}
                        {isYesterday && <span className="ml-1.5" style={{ color: "var(--color-ink-muted)" }}>· Yesterday</span>}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
                    >
                      {dayEvents.length}
                    </span>
                  </div>

                  {/* Events for this day */}
                  <div className="ml-2 border-l-2 pl-4 space-y-2" style={{ borderColor: "var(--color-paper-3)" }}>
                    {/* Prayer times row (only on the first day if available) */}
                    {dayPrayerTimes && (
                      <div
                        className="flex flex-wrap gap-1 rounded-lg border px-2 py-1.5"
                        style={{
                          borderColor: "var(--color-paper-3)",
                          backgroundColor: "color-mix(in oklab, var(--color-accent) 3%, var(--color-paper))",
                        }}
                      >
                        {PRAYER_NAMES.filter((p) => p.isPrayer).map((prayer) => {
                          const time = dayPrayerTimes[prayer.key];
                          if (!time) return null;
                          const [h, m] = time.split(":").map(Number);
                          const hour = h % 12 || 12;
                          const period = h < 12 ? "AM" : "PM";
                          return (
                            <span
                              key={prayer.key}
                              className="text-[10px] font-medium"
                              style={{ color: "var(--color-ink-muted)" }}
                            >
                              {prayer.label} {hour}:{String(m).padStart(2, "0")}{period.charAt(0).toLowerCase()}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {dayEvents.map((event) => {
                      const eventColor = event.color || "var(--color-accent)";
                      const multiDay = !isSameDay(event.startAt, event.endAt);
                      return (
                        <Link
                          key={event.id}
                          href={`/calendar/day?date=${day}`}
                          className="flex items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-[var(--color-paper-2)]"
                          style={{
                            borderColor: "var(--color-paper-3)",
                            borderLeft: `3px solid ${eventColor}`,
                          }}
                        >
                          {/* Time column */}
                          <div className="shrink-0 w-20 sm:w-28">
                            <div className="flex items-center gap-1 text-xs font-medium tabular-nums" style={{ color: "var(--color-ink)" }}>
                              <Clock className="h-3 w-3" style={{ color: "var(--color-ink-muted)" }} />
                              <span className="truncate">
                                {formatTimeRange(event.startAt, event.endAt, event.type)}
                              </span>
                            </div>
                            {multiDay && (
                              <span className="mt-0.5 block text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                                Multi-day
                              </span>
                            )}
                          </div>

                          {/* Event content */}
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-medium leading-snug truncate" style={{ color: "var(--color-ink)" }}>
                              {event.title}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: "var(--color-paper-2)",
                                  color: "var(--color-ink-muted)",
                                }}
                              >
                                {TYPE_LABELS[event.type]}
                              </span>
                              {event.notify && (
                                <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                                  <Bell className="h-2.5 w-2.5" />
                                  Notify
                                </span>
                              )}
                              {event.seriesId && (
                                <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                                  <Calendar className="h-2.5 w-2.5" />
                                  Recurring
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
