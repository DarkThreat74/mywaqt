"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Calendar, ChevronDown, ChevronUp } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  details?: string | null;
  startAt: string;
  endAt: string;
  type: "block" | "task" | "reminder";
  color?: string | null;
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
const HOUR_HEIGHT = 56;
const TIME_COL = 44;
const DEFAULT_START_HOUR = 5; // 5 AM — default visible start

const PRAYER_NAMES: Array<{
  key: keyof PrayerTimes;
  label: string;
  color: string;
}> = [
  { key: "fajr", label: "Fajr", color: "var(--color-accent)" },
  { key: "sunrise", label: "Sunrise", color: "var(--color-warmth)" },
  { key: "dhuhr", label: "Dhuhr", color: "var(--color-accent)" },
  { key: "asr", label: "Asr", color: "var(--color-accent)" },
  { key: "maghrib", label: "Maghrib", color: "var(--color-warmth)" },
  { key: "isha", label: "Isha", color: "var(--color-accent)" },
];

// Asr time is already correct from the API (madhab-aware). No adjustment needed.
function getDisplayAsrTime(apiTime: string): string {
  const parts = apiTime.split(" ")[0].split(":");
  return `${parts[0]}:${parts[1]}`;
}

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

type View = "day" | "month";

export default function PublicCalendarClient({ token, displayName }: { token: string; displayName?: string }) {
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  function navigateToDay(dateStr: string) {
    setSelectedDate(dateStr);
    setView("day");
  }

  // Restrict navigation: can't go to past months, can't go more than 3 months ahead
  const now = new Date();
  const currentMonthNum = now.getFullYear() * 12 + now.getMonth();
  const maxMonthNum = currentMonthNum + 3;
  const viewMonthNum = year * 12 + (month - 1);

  const canGoPrev = viewMonthNum > currentMonthNum;
  const canGoNext = viewMonthNum < maxMonthNum;

  function handlePrevMonth() {
    if (!canGoPrev) return;
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    setMonth(prevM);
    setYear(prevY);
  }

  function handleNextMonth() {
    if (!canGoNext) return;
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    setMonth(nextM);
    setYear(nextY);
  }

  return (
    <div className="min-h-dvh overflow-x-clip" style={{ backgroundColor: "var(--color-paper-2)" }}>
      {/* ── Header ── */}
      <header
        className="border-b"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ backgroundColor: "var(--color-ink)" }}
            >
              <Eye className="h-4 w-4" style={{ color: "var(--color-paper)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
                {displayName ? `${displayName}'s calendar` : "Shared calendar"}
              </p>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Read-only · Current + 3 months
              </p>
            </div>
          </div>

          {/* View toggle */}
          <div
            className="flex rounded-md border"
            style={{ borderColor: "var(--color-paper-3)" }}
          >
            <button
              onClick={() => setView("day")}
              className="flex items-center gap-1.5 rounded-l-md px-3 py-2 text-xs font-medium transition-colors"
              style={{
                minHeight: 40,
                backgroundColor: view === "day" ? "var(--color-ink)" : "transparent",
                color: view === "day" ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              <Calendar className="h-4 w-4" />
              Day
            </button>
            <button
              onClick={() => setView("month")}
              className="flex items-center gap-1.5 rounded-r-md px-3 py-2 text-xs font-medium transition-colors"
              style={{
                minHeight: 40,
                backgroundColor: view === "month" ? "var(--color-ink)" : "transparent",
                color: view === "month" ? "var(--color-paper)" : "var(--color-ink-muted)",
              }}
            >
              <Calendar className="h-4 w-4" />
              Month
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="py-6">
        {view === "day" ? (
          <PublicDayView
            token={token}
            date={selectedDate}
            onNavigateToMonth={() => setView("month")}
            onDateChange={setSelectedDate}
          />
        ) : (
          <PublicMonthView
            token={token}
            year={year}
            month={month}
            onNavigateToDay={navigateToDay}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        className="border-t px-5 py-6 text-center sm:px-6"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          This is a read-only shared calendar from <span style={{ color: "var(--color-ink-soft)" }}>Waqt</span> — a prayer-centered life tracker.
        </p>
        <Link
          href="/"
          className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
          style={{ color: "var(--color-accent)" }}
        >
          Learn more about Waqt
        </Link>
      </footer>
    </div>
  );
}

// ─── Public Day View (read-only) ───

function PublicDayView({ token, date, onNavigateToMonth, onDateChange }: {
  token: string;
  date: string;
  onNavigateToMonth: () => void;
  onDateChange: (date: string) => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEarlyHours, setShowEarlyHours] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [eventsRes, prayerRes] = await Promise.all([
          fetch(`/api/public/${token}/events?date=${date}`),
          fetch(`/api/public/${token}/prayer-times?date=${date}`).catch(() => null),
        ]);

        if (cancelled) return;

        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          // Filter to only events that fall on this date in the viewer's local timezone
          const filtered = eventsData.filter((e: { startAt: string }) => {
            const d = new Date(e.startAt);
            const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return localDateStr === date;
          });
          if (!cancelled) setEvents(filtered);
        } else if (eventsRes.status === 404) {
          if (!cancelled) setError("Calendar not found.");
        } else {
          if (!cancelled) setEvents([]);
        }

        if (prayerRes?.ok) {
          const prayerData = await prayerRes.json();
          if (!cancelled) setPrayerTimes(prayerData);
        } else {
          if (!cancelled) setPrayerTimes(null);
        }

        if (!cancelled) setError(null);
      } catch {
        if (!cancelled) setError("Failed to load calendar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, date]);

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
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function formatTime(time: string): string {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const hour = h % 12 || 12;
    const period = h < 12 ? "AM" : "PM";
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  }

  function formatHour(hour: number): string {
    if (hour === 0) return "12a";
    if (hour === 12) return "12p";
    if (hour > 12) return `${hour - 12}p`;
    return `${hour}a`;
  }

  function getOverlappingEvents(event: CalendarEvent, allEvents: CalendarEvent[]): CalendarEvent[] {
    const start = timeToMinutes(isoToLocalTime(event.startAt));
    let end = timeToMinutes(isoToLocalTime(event.endAt));
    // Handle events spanning midnight — if end < start, it crossed midnight
    if (end < start) end += 24 * 60;
    return allEvents.filter((e) => {
      const eStart = timeToMinutes(isoToLocalTime(e.startAt));
      let eEnd = timeToMinutes(isoToLocalTime(e.endAt));
      if (eEnd < eStart) eEnd += 24 * 60;
      return eStart < end && eEnd > start;
    });
  }

  // Separate blocks from reminders
  const blockEvents = events.filter((e) => e.type !== "reminder");
  const reminderEvents = events.filter((e) => e.type === "reminder");

  // Date navigation
  const currentDate = new Date(date + "T00:00:00");
  const prevDate = new Date(currentDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const prevDateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(prevDate.getDate()).padStart(2, "0")}`;
  const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-2 sm:px-6">
      {/* Date navigation */}
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <button
          onClick={() => onDateChange(prevDateStr)}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper)]"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-semibold tracking-tight sm:text-lg" style={{ color: "var(--color-ink)" }}>
            {formattedDate}
          </h1>
          <button
            onClick={onNavigateToMonth}
            className="mt-0.5 text-xs underline underline-offset-2"
            style={{ color: "var(--color-ink-muted)" }}
          >
            View month
          </button>
        </div>
        <button
          onClick={() => onDateChange(nextDateStr)}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper)]"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Prayer times bar */}
      {prayerTimes && (
        <div className="mb-3 flex flex-wrap gap-1.5 sm:mb-4">
          {PRAYER_NAMES.map((prayer) => {
            const rawTime = prayerTimes[prayer.key];
            if (!rawTime) return null;
            const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
            return (
              <div
                key={prayer.key}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 sm:flex-none sm:px-3"
                style={{
                  borderColor: "var(--color-paper-3)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <span className="text-[11px] font-medium sm:text-xs" style={{ color: prayer.color }}>
                  {prayer.label}
                </span>
                <span className="text-[10px] tabular-nums sm:text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  {formatTime(time)}
                </span>
              </div>
            );
          })}
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
              backgroundColor: "var(--color-paper)",
              transform: showEarlyHours ? "none" : `translateY(-${DEFAULT_START_HOUR * HOUR_HEIGHT}px)`,
            }}
          >
          {/* Hour lines */}
          {HOURS.map((hour, i) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex"
              style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <div
                className="shrink-0 pt-0.5 pr-1.5 text-right text-[10px] font-medium tabular-nums sm:pr-2"
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

          {/* Prayer time lines — colored line with label pill */}
          {prayerTimes &&
            PRAYER_NAMES.map((prayer) => {
              const rawTime = prayerTimes[prayer.key];
              if (!rawTime) return null;
              const time = prayer.key === "asr" ? getDisplayAsrTime(rawTime) : rawTime;
              const minutes = timeToMinutes(time);
              if (minutes < HOURS[0] * 60 || minutes > (HOURS[HOURS.length - 1] + 1) * 60) return null;
              const top = minutesToTop(minutes);
              return (
                <div
                  key={prayer.key}
                  className="absolute z-10 flex items-center pr-1"
                  style={{ top: top - 7, left: TIME_COL, right: 0 }}
                >
                  <div className="h-px flex-1" style={{ backgroundColor: prayer.color, opacity: 0.5 }} />
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium sm:px-2 sm:text-[10px]"
                    style={{
                      backgroundColor: "var(--color-paper)",
                      color: prayer.color,
                      border: `1px solid ${prayer.color}`,
                    }}
                  >
                    {prayer.label} {formatTime(time)}
                  </span>
                </div>
              );
            })}

          {/* Reminder lines — colored lines, no delete buttons (read-only) */}
          {reminderEvents.map((event) => {
            const startStr = isoToLocalTime(event.startAt);
            const minutes = timeToMinutes(startStr);
            if (minutes < HOURS[0] * 60 || minutes > (HOURS[HOURS.length - 1] + 1) * 60) return null;
            const top = minutesToTop(minutes);
            const color = getReminderColor(event.title, event.color);

            return (
              <div
                key={event.id}
                className="absolute z-15 flex items-center pr-1"
                style={{ top: top - 7, left: TIME_COL, right: 0 }}
              >
                <div className="h-0.5 flex-1" style={{ backgroundColor: color, opacity: 0.7 }} />
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium sm:px-2 sm:text-[10px]"
                  style={{
                    backgroundColor: "var(--color-paper)",
                    color: color,
                    border: `1px solid ${color}`,
                  }}
                >
                  {event.title} · {formatTime(startStr)}
                </span>
                <div className="h-0.5 w-3 sm:w-4" style={{ backgroundColor: color, opacity: 0.7 }} />
              </div>
            );
          })}

          {/* Block events (read-only — no delete buttons) */}
          {blockEvents.map((event) => {
            const startStr = isoToLocalTime(event.startAt);
            const endStr = isoToLocalTime(event.endAt);
            const startMin = timeToMinutes(startStr);
            const endMin = timeToMinutes(endStr);
            const top = minutesToTop(startMin);
            const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);

            const overlapping = getOverlappingEvents(event, blockEvents).sort((a, b) => {
              const aStart = timeToMinutes(isoToLocalTime(a.startAt));
              const bStart = timeToMinutes(isoToLocalTime(b.startAt));
              return aStart - bStart;
            });
            const index = overlapping.findIndex((e) => e.id === event.id);
            const widthPct = 100 / overlapping.length;
            const leftPct = index * widthPct;

            const eventColor = event.color && event.color.length >= 4 ? event.color : null;
            const borderColor = eventColor || TYPE_COLORS[event.type] || "var(--color-accent)";
            const bgColor = eventColor
              ? `color-mix(in oklab, ${eventColor} 18%, transparent)`
              : TYPE_BG[event.type] || TYPE_BG.block;

            return (
              <div
                key={event.id}
                className="absolute z-20 overflow-hidden rounded-lg border"
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
                <div className="flex h-full flex-col items-center justify-center gap-0.5 px-1.5 py-1 sm:px-2">
                  <p className="w-full truncate text-center text-[11px] font-medium leading-tight sm:text-xs" style={{ color: "var(--color-ink)" }}>
                    {event.title}
                  </p>
                  {endStr && (
                    <p className="w-full truncate text-center text-[9px] font-normal leading-tight sm:text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      {formatTime(startStr)} – {formatTime(endStr)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!loading && events.length === 0 && !error && (
        <div
          className="mt-4 rounded-lg border border-dashed py-8 text-center text-sm"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          No events scheduled for this day.
        </div>
      )}

      {loading && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading...</p>
      )}
      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-error)" }}>{error}</p>
      )}
    </div>
  );
}

// ─── Public Month View (read-only) ───

function PublicMonthView({ token, year, month, onNavigateToDay, onPrevMonth, onNextMonth, canGoPrev, canGoNext }: {
  token: string;
  year: number;
  month: number;
  onNavigateToDay: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}) {
  const [eventsByDate, setEventsByDate] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [maxVisibleEvents, setMaxVisibleEvents] = useState(2);

  useEffect(() => {
    const updateMaxEvents = () => {
      const w = window.innerWidth;
      if (w >= 1280) setMaxVisibleEvents(5);
      else if (w >= 1024) setMaxVisibleEvents(4);
      else if (w >= 768) setMaxVisibleEvents(3);
      else if (w >= 640) setMaxVisibleEvents(3);
      else setMaxVisibleEvents(2);
    };
    updateMaxEvents();
    window.addEventListener("resize", updateMaxEvents);
    return () => window.removeEventListener("resize", updateMaxEvents);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const fromStr = `${year}-${String(month).padStart(2, "0")}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const toStr = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

        const res = await fetch(`/api/public/${token}/events?from=${fromStr}&to=${toStr}`);
        if (res.ok && !cancelled) {
          const events: CalendarEvent[] = await res.json().catch(() => []);
          if (!Array.isArray(events)) return;
          const grouped: Record<string, CalendarEvent[]> = {};
          for (const event of events) {
            // Use the viewer's local date, not the UTC date from the ISO string
            const d = new Date(event.startAt);
            const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (!grouped[eventDate]) grouped[eventDate] = [];
            grouped[eventDate].push(event);
          }
          for (const date of Object.keys(grouped)) {
            grouped[date].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
          }
          if (!cancelled) setEventsByDate(grouped);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, year, month]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function isDayDone(dateStr: string): boolean {
    return dateStr < today;
  }

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
    <div className="mx-auto w-full max-w-4xl px-3 sm:px-6">
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <button
          onClick={onPrevMonth}
          disabled={!canGoPrev}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper)] disabled:opacity-30 disabled:hover:bg-transparent"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold tracking-tight sm:text-xl" style={{ color: "var(--color-ink)" }}>
          {monthNames[month - 1]} {year}
        </h1>
        <button
          onClick={onNextMonth}
          disabled={!canGoNext}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper)] disabled:opacity-30 disabled:hover:bg-transparent"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

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

          return (
            <button
              key={i}
              onClick={() => cell.dateStr && onNavigateToDay(cell.dateStr)}
              className="relative flex min-h-[70px] flex-col rounded-lg border p-1 text-xs transition-colors hover:bg-[var(--color-paper-2)] sm:min-h-[100px] sm:p-1.5 lg:min-h-[120px]"
              style={{
                borderColor: isToday ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: isToday ? "var(--color-accent-faint)" : done ? "var(--color-paper-2)" : "var(--color-paper)",
                opacity: done ? 0.6 : 1,
              }}
            >
              {/* Day number */}
              <span
                className="mb-0.5 font-medium tabular-nums"
                style={{
                  color: isToday ? "var(--color-accent)" : done ? "var(--color-ink-muted)" : "var(--color-ink)",
                  fontSize: 11,
                }}
              >
                {cell.day}
              </span>

              {/* Event blocks */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {blockEvents.slice(0, maxVisibleEvents).map((event) => {
                  const time = new Date(event.startAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  const color = (event.color && event.color.length >= 4 ? event.color : null) || typeColors[event.type] || "var(--color-accent)";
                  return (
                    <div
                      key={event.id}
                      className="truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight sm:text-[10px]"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
                        color: color,
                        borderLeft: `2px solid ${color}`,
                      }}
                    >
                      <span className="tabular-nums">{time}</span> {event.title}
                    </div>
                  );
                })}
                {blockEvents.length > maxVisibleEvents && (
                  <span
                    className="px-1 text-[9px] font-medium sm:text-[10px]"
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
                        <span className="truncate text-[9px] leading-tight sm:text-[10px]" style={{ color: "var(--color-ink-soft)" }}>
                          {event.title}
                        </span>
                      </div>
                    ))}
                    {reminderEvents.length > maxVisibleEvents && (
                      <span className="text-[9px] sm:text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        +{reminderEvents.length - maxVisibleEvents} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* X overlay for done days */}
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
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Loading events...
        </p>
      )}
    </div>
  );
}
