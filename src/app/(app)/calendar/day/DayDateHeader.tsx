"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";

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

  useEffect(() => {
    const cached = getCachedPrayerSettings();
    const tz = cached?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      try {
        const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
        const computed = new Date(nowInTz).toISOString().split("T")[0];
        setToday(computed);
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

        {/* Date + view toggle */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-4">
          <div className="text-center">
            {/* Render stable fallback during SSR, real value after mount */}
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-lg" style={{ color: "var(--color-ink)" }}>
              {formattedDate || `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`}
            </h1>
            {hijriDate && (
              <p
                className="mt-0.5 truncate text-xs"
                style={{ color: "var(--color-accent)", fontFamily: "var(--font-amiri, serif)" }}
              >
                {hijriDate}
              </p>
            )}
            {isToday && (
              <p className="text-xs" style={{ color: "var(--color-accent)" }}>Today</p>
            )}
          </div>

          {/* Day/Month/List toggle */}
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
        </div>

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
