"use client";

import { useState } from "react";
import DayDateHeader from "./DayDateHeader";
import DayViewClient from "./DayViewClient";

/**
 * Owns the viewed date so prev/next day navigation is a client-side state
 * change — one API refetch, no SSR round-trip, no remount. The URL stays in
 * sync via replaceState so refresh/share still lands on the right day.
 */
export default function DayShell({ date: initialDate }: { date: string }) {
  const [date, setDate] = useState(initialDate);
  const [lastProp, setLastProp] = useState(initialDate);

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
      <DayViewClient date={date} />
    </div>
  );
}
