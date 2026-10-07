"use client";

/**
 * Sidebar salah status — a quiet line above Tools/Logout showing the live
 * prayer state: "Asr ends in 10m" while a window is open and unmarked, or
 * "Maghrib starts in 42m" once prayed / between windows.
 *
 * Times come from the IndexedDB month cache first (instant, offline-safe),
 * /api/prayer-times as fallback; prayed/excused comes from the prayer log.
 * Same window math as the study-session banner.
 */

import { useEffect, useRef, useState } from "react";
import { Moon } from "lucide-react";

const LABEL: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Zuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};
const ORDER: [string, string][] = [
  ["fajr", "sunrise"], ["dhuhr", "asr"], ["asr", "maghrib"], ["maghrib", "isha"], ["isha", "fajr"],
];
const START_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

function fmtLeft(min: number) {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

interface Status {
  /** "Asr ends in 10m" | "Maghrib starts in 42m" */
  text: string;
  /** Prayer window closing soon — shift to warmth. */
  urgent: boolean;
}

export default function SidebarSalah() {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const base = useRef<{ dateStr: string; times: Record<string, string>; unmarked: Set<string> } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        let times: Record<string, string> | null = null;
        try {
          const { getOfflineDB } = await import("@/lib/offline/db");
          const cached = await getOfflineDB().prayerTimes.get(dateStr);
          if (cached?.fajr) times = cached as unknown as Record<string, string>;
        } catch { /* fall through to API */ }
        if (!times) {
          const r = await fetch(`/api/prayer-times?date=${dateStr}`);
          if (r.ok) times = await r.json();
        }
        if (!times || cancelled) return;

        const logsRes = await fetch(`/api/prayer-log?date=${dateStr}`).catch(() => null);
        const logs: { prayerName: string; status: string }[] = logsRes?.ok ? await logsRes.json() : [];
        const unmarked = new Set(
          ORDER.map(([p]) => p).filter(
            (p) => !logs.some((l) => l.prayerName === p && (l.status === "prayed" || l.status === "excused")),
          ),
        );
        base.current = { dateStr, times, unmarked };
        setNow(Date.now());
      } catch { /* best-effort — the sidebar line just stays hidden */ }
    }
    void load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Recompute the line on every 30s tick from the loaded times.
  useEffect(() => {
    const b = base.current;
    if (!b) { setStatus(null); return; }
    const d = new Date(`${b.dateStr}T00:00:00`);
    const toTs = (hhmm: string | undefined, dayOffset = 0) => {
      if (!hhmm) return NaN;
      const [h, m] = hhmm.split(":").map(Number);
      const t = new Date(d);
      t.setHours(h, m, 0, 0);
      return t.getTime() + dayOffset * 86400000;
    };
    // Open window?
    for (const [p, endKey] of ORDER) {
      const s = toTs(b.times[p]);
      const e = endKey === "fajr" ? toTs(b.times.fajr, 1) : toTs(b.times[endKey]);
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      if (now >= s && now < e) {
        if (b.unmarked.has(p)) {
          const left = Math.max(1, Math.round((e - now) / 60000));
          setStatus({ text: `${LABEL[p]} ends in ${fmtLeft(left)}`, urgent: left < 30 });
        } else {
          // Prayed — count down to the next prayer's start.
          const nextIdx = START_ORDER.indexOf(p) + 1;
          const nStart = nextIdx < START_ORDER.length
            ? toTs(b.times[START_ORDER[nextIdx]])
            : toTs(b.times.fajr, 1);
          const nName = nextIdx < START_ORDER.length ? START_ORDER[nextIdx] : "fajr";
          setStatus(
            Number.isNaN(nStart) || nStart <= now
              ? null
              : { text: `${LABEL[nName]} starts in ${fmtLeft(Math.round((nStart - now) / 60000))}`, urgent: false },
          );
        }
        return;
      }
    }
    // Between windows (e.g. sunrise→dhuhr) — next prayer's start.
    for (const p of START_ORDER) {
      const s = toTs(b.times[p]);
      if (!Number.isNaN(s) && s > now) {
        setStatus({ text: `${LABEL[p]} starts in ${fmtLeft(Math.round((s - now) / 60000))}`, urgent: false });
        return;
      }
    }
    // After Isha's start… post-midnight covered by the isha window above.
    const f = toTs(b.times.fajr, 1);
    setStatus(Number.isNaN(f) ? null : { text: `Fajr starts in ${fmtLeft(Math.round((f - now) / 60000))}`, urgent: false });
  }, [now]);

  if (!status) return null;
  return (
    <p
      className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium tabular-nums"
      style={{
        color: status.urgent ? "var(--color-warmth)" : "var(--color-ink-muted)",
        backgroundColor: status.urgent ? "var(--color-warmth-faint)" : "var(--color-paper-2)",
      }}
      aria-live="polite"
    >
      <Moon className="h-3 w-3 shrink-0" />
      {status.text}
    </p>
  );
}
