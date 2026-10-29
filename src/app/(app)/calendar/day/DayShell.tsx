"use client";

import { useState, useEffect } from "react";
import DayDateHeader from "./DayDateHeader";
import DayViewClient from "./DayViewClient";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";

/**
 * Owns the viewed date so prev/next day navigation is a client-side state
 * change — one API refetch, no SSR round-trip, no remount. The URL stays in
 * sync via replaceState so refresh/share still lands on the right day.
 */
export default function DayShell({ date: initialDate }: { date: string }) {
  const [date, setDate] = useState(initialDate);
  const [lastProp, setLastProp] = useState(initialDate);

  // A cached page/RSC payload carries yesterday's server-computed date —
  // when the URL has no explicit ?date=, recompute "today" client-side so a
  // stale snapshot never shows the day before.
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        if (new URLSearchParams(window.location.search).get("date")) return;
        const tz = getCachedPrayerSettings()?.timezone;
        const today = tz
          ? new Date().toLocaleDateString("en-CA", { timeZone: tz })
          : new Date().toLocaleDateString("en-CA");
        if (today !== initialDate) setDate(today);
      } catch { /* keep the server date */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt a new server-driven date prop (adjust-during-render pattern —
  // no effect, no cascade).
  if (initialDate !== lastProp) {
    setLastProp(initialDate);
    setDate(initialDate);
  }

  const go = (d: string) => {
    if (d === date) return;
    setDate(d);
    window.history.replaceState(null, "", `/calendar/day?date=${d}`);
  };

  return (
    <div className="overflow-x-hidden">
      <DayDateHeader date={date} onNavigate={go} />
      {/* key forces a clean remount per day — otherwise open modals, edit
          state, and the pending-add draft leak onto the next day. Still
          instant: no server round-trip, just client refetch. */}
      <DayViewClient key={date} date={date} />
    </div>
  );
}
