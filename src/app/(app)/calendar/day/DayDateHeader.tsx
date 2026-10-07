"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { todayInTimezone } from "@/lib/prayer/checkin";
import { getDiscipline } from "@/lib/study/session";
import { fmtDur } from "@/lib/blocks/gaps";
import StudyStatsSheet, { weekMinutes } from "@/components/study-stats-sheet";

/**
 * Client-side date header for the day calendar.
 *
 * Why client-side? The server computes "today" in the user's timezone, but
 * when the PWA is served from cache offline (possibly the next day), a
 * server-rendered date would be stale. This component computes "today"
 * on the client using the cached prayer timezone, so the cached shell
 * works correctly across days.
 *
 * HYDRATION-SAFE PATTERN:
 * `toLocaleDateString` and `Intl.DateTimeFormat` (Islamic calendar) produce
 * different output on the server (Node.js ICU) vs the client (browser ICU).
 * In React 19 / Next.js 16, this mismatch triggers the error boundary.
 * We compute ALL locale-dependent strings in useEffect and render a stable
 * fallback during SSR. This prevents hydration mismatches entirely.
 */
export default function DayDateHeader({ date }: { date: string }) {
  const [today, setToday] = useState<string | null>(null);
  // Locale-dependent strings — computed AFTER mount to avoid hydration mismatch
  const [formattedDate, setFormattedDate] = useState<string>("");
  const [hijriDate, setHijriDate] = useState<string | null>(null);
  // "2h 12m this wk" — local history only; the stats sheet merges the server
  // copy when it opens, so a cross-device gap here is cosmetic.
  const [weekMin, setWeekMin] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const cached = getCachedPrayerSettings();
    const tz = cached?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      try {
        setToday(todayInTimezone(tz));
      } catch {
        const now = new Date();
        setToday(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
      }

      // Compute locale-dependent date strings on the client only
      const [y, m, d] = date.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      setFormattedDate(dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }));

      // Hijri date — computed client-side via Intl.DateTimeFormat (islamic calendar)
      try {
        const hijri = new Intl.DateTimeFormat("en-US-u-ca-islamic", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(dateObj) + " AH";
        setHijriDate(hijri);
      } catch {
        setHijriDate(null);
      }

      try {
        setWeekMin(weekMinutes(getDiscipline().history));
      } catch { /* zero-state */ }
    });
  }, [date]);

  // Calculate prev/next days — pure arithmetic, no locale dependency, SSR-safe
  const [y, m, d] = date.split("-").map(Number);
  const prevDate = new Date(y, m - 1, d - 1);
  const nextDate = new Date(y, m - 1, d + 1);
  const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(prevDate.getDate()).padStart(2, "0")}`;
  const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

  const dateObj = new Date(y, m - 1, d);
  const isToday = today !== null && date === today;

  // Rendered twice — once beside the hijri line on mobile, once beside the
  // date on desktop. Only one instance is visible per breakpoint.
  const viewToggle = (
    <div
      className="flex shrink-0 rounded-lg border"
      style={{ borderColor: "var(--color-paper-3)" }}
    >
      <Link
        href={`/calendar/day?date=${date}`}
        className="rounded-l-lg px-3 py-1.5 text-xs font-medium"
        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
      >
        Day
      </Link>
      <Link
        href={`/calendar/month?year=${dateObj.getFullYear()}&month=${dateObj.getMonth() + 1}`}
        className="px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        Month
      </Link>
      <Link
        href="/calendar/list"
        className="rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        List
      </Link>
    </div>
  );

  return (
    <div className="overflow-x-hidden border-b" style={{ borderColor: "var(--color-paper-3)" }}>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
        {/* Prev day */}
        <Link
          href={`/calendar/day?date=${prevStr}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        {/* Date + view toggle — mobile: 2 compact rows (date+chips, hijri+toggle) */}
        <div className="flex min-w-0 flex-1 flex-col items-center sm:flex-row sm:justify-center sm:gap-4">
          <div className="w-full text-center sm:w-auto">
            {/* Render stable fallback during SSR, real value after mount */}
            <h1 className="flex items-center justify-center gap-1.5 text-sm font-semibold tracking-tight sm:text-lg" style={{ color: "var(--color-ink)" }}>
              <span className="truncate">{formattedDate || `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`}</span>
              {isToday && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold"
                  style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                >
                  Today
                </span>
              )}
              {dateObj.getDay() === 5 && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold"
                  style={{ backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)" }}
                >
                  Jumu&apos;ah
                </span>
              )}
            </h1>
            {hijriDate && (
              <p
                className="truncate text-[11px] leading-tight"
                style={{ color: "var(--color-accent)", fontFamily: "var(--font-amiri, serif)" }}
              >
                {hijriDate}
              </p>
            )}
            {/* Week's focused time + entry point to the full stats sheet */}
            {weekMin > 0 && (
              <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] leading-tight tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                <span style={{ color: "var(--color-accent)" }}>{fmtDur(weekMin)}</span> studied this wk
                <button
                  onClick={() => setStatsOpen(true)}
                  className="rounded-full border px-2 py-px text-[10px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                >
                  <BarChart3 className="mr-0.5 inline h-2.5 w-2.5 -translate-y-px" />
                  Stats
                </button>
              </p>
            )}
            {/* View toggle — own centered row on mobile */}
            <div className="mt-0.5 flex justify-center sm:hidden">{viewToggle}</div>
          </div>

          {/* Day/Month/List toggle — desktop sits beside the date */}
          <div className="hidden sm:flex">{viewToggle}</div>
        </div>

        {statsOpen && <StudyStatsSheet onClose={() => setStatsOpen(false)} />}

        {/* Next day */}
        <Link
          href={`/calendar/day?date=${nextStr}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)" }}
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
