"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "waqt:workout-live";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Live { dayId: string; name: string; startedAt: number }

const readLocal = (): Live | null => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    return d?.dayId && d?.startedAt ? d : null;
  } catch { return null; }
};

// Floating elapsed-time pill — DB is the source of truth (an open session row
// survives reloads + other devices); localStorage is the offline fallback so
// the pill still appears when the fetch can't reach the server.
export default function WorkoutPill() {
  const [live, setLive] = useState<Live | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // 1s tick — elapsed counter + instant local read (covers offline starts).
    const t1 = setInterval(() => {
      const l = readLocal();
      if (l) { setLive(l); setElapsed((Date.now() - l.startedAt) / 1000); }
      else setLive((prev) => (prev ? { ...prev } : null)); // keep DB state if live
    }, 1000);
    // 10s DB tick — authoritative open-session check; survives reload + devices.
    const dbTick = async () => {
      try {
        const r = await fetch("/api/workout/sessions");
        if (!r.ok) return;
        const { sessions } = await r.json();
        const open = (sessions || []).find((s: { endedAt: string | null }) => !s.endedAt);
        if (open) {
          const l = { dayId: open.dayId, name: open.dayName, startedAt: new Date(open.startedAt).getTime() };
          setLive(l); setElapsed((Date.now() - l.startedAt) / 1000);
        } else if (!readLocal()) setLive(null);
      } catch { /* offline — local copy carries the pill */ }
    };
    void dbTick();
    const t2 = setInterval(() => void dbTick(), 10 * 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
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
