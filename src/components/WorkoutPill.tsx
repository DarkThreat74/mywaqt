"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "waqt:workout-live";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Floating elapsed-time pill — set by the active workout page, cleared on
// finish/cancel. Shows on every app route while a session is live.
export default function WorkoutPill() {
  const [live, setLive] = useState<{ dayId: string; name: string; startedAt: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(KEY);
        const d = raw ? JSON.parse(raw) : null;
        setLive(d?.dayId && d?.startedAt ? d : null);
      } catch { setLive(null); }
    };
    read();
    const t = setInterval(() => {
      read();
      try {
        const d = JSON.parse(localStorage.getItem(KEY) || "null");
        if (d?.startedAt) setElapsed((Date.now() - d.startedAt) / 1000);
      } catch { /* noop */ }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!live) return null;
  return (
    <Link href={`/workout/active?day=${live.dayId}`}
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border px-3 py-2 shadow-lg lg:bottom-6"
      style={{ borderColor: "var(--color-accent)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}>
      <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
      <span className="text-xs font-medium tabular-nums">{fmt(elapsed)}</span>
      <span className="max-w-24 truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{live.name}</span>
    </Link>
  );
}
