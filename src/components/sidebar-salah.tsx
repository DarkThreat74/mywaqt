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
import Link from "next/link";
import { Ban, Moon } from "lucide-react";
import { activeMakruh, makruhWindows, type PrayerTimings } from "@/lib/prayer/checkin";

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
  /** "Asr ends in 10m" | "Maghrib starts in 42m" | "Makruh — ends in 8m" */
  text: string;
  /** Prayer window closing soon — shift to warmth. */
  urgent: boolean;
  /** Inside a makruh window — red shade, no praying. */
  makruh?: boolean;
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
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        let times: Record<string, string> | null = null;
        try {
          const { getOfflineDB } = await import("@/lib/offline/db");
          const cached = await getOfflineDB().prayerTimes.get(dateStr);
          // sunrise is Fajr's window end — a cached row without it makes the
          // Fajr window unresolvable, so only accept complete rows.
          if (cached?.fajr && cached?.sunrise) times = cached as unknown as Record<string, string>;
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
            (p) => !logs.some(
              (l) => l.prayerName === p &&
                (l.status === "prayed" || l.status === "excused" || l.status === "assumed_prayed"),
            ),
          ),
        );
        base.current = { dateStr, times, unmarked };
        setNow(Date.now());
      } catch { /* best-effort — the sidebar line just stays hidden */ }
    }
    void load();
    const t = setInterval(load, 60_000);
    const onVis = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
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
    const minToTs = (mins: number) => {
      const t = new Date(d);
      t.setHours(0, mins, 0, 0);
      return t.getTime();
    };
    const cur = new Date(now);
    const curMin = cur.getHours() * 60 + cur.getMinutes();
    // Only trust makruh math when every timing it needs is present — a
    // partial cached row would crash parseMinutes and kill the effect.
    const timings = (b.times.fajr && b.times.sunrise && b.times.maghrib)
      ? (b.times as unknown as PrayerTimings)
      : null;

    // Makruh overrides everything — even an open prayer window pauses for it.
    const mk = timings ? activeMakruh(curMin, timings) : null;
    if (mk) {
      const left = Math.max(1, Math.round((minToTs(mk.end) - now) / 60000));
      setStatus({ text: `Makruh — ends in ${fmtLeft(left)}`, urgent: true, makruh: true });
      return;
    }
    // Makruh windows as timestamps so an open window can clamp to them.
    const mkTs = timings
      ? makruhWindows(timings).map((w) => ({ ...w, sTs: minToTs(w.start) }))
      : [];

    // Open window?
    for (const [p, endKey] of ORDER) {
      const s = toTs(b.times[p]);
      let e = endKey === "fajr" ? toTs(b.times.fajr, 1) : toTs(b.times[endKey]);
      // Missing window end (e.g. no sunrise in the row) — fall back to the
      // next prayer's start so the open window still reads "ends in Xm"
      // instead of silently skipping to a "starts in" line.
      if (Number.isNaN(e)) {
        const ni = START_ORDER.indexOf(p) + 1;
        e = ni < START_ORDER.length ? toTs(b.times[START_ORDER[ni]]) : toTs(b.times.fajr, 1);
      }
      if (Number.isNaN(s) || Number.isNaN(e)) continue;
      if (now >= s && now < e) {
        // While ANY window is open the line belongs to it — "Maghrib ends in
        // 58m" — never the next prayer. Prayed only quiets the color.
        const bound = mkTs.find((w) => w.sTs > now && w.sTs < e);
        const target = bound ? bound.sTs : e;
        const left = Math.max(1, Math.round((target - now) / 60000));
        const unmarked = b.unmarked.has(p);
        setStatus({
          text: bound
            ? `${LABEL[p]} — ${fmtLeft(left)} left until makruh`
            : `${LABEL[p]} ends in ${fmtLeft(left)}`,
          urgent: unmarked && left < 30,
        });
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
    <Link
      href="/prayer"
      className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium tabular-nums transition-colors hover:bg-[var(--color-paper-3)]"
      style={{
        color: status.makruh ? "var(--color-error)" : status.urgent ? "var(--color-warmth)" : "var(--color-ink-muted)",
        backgroundColor: status.makruh
          ? "color-mix(in oklab, var(--color-error) 10%, transparent)"
          : status.urgent ? "var(--color-warmth-faint)" : "var(--color-paper-2)",
      }}
      aria-live="polite"
      title="Open prayer check-ins"
    >
      {status.makruh
        ? <Ban className="h-3 w-3 shrink-0" />
        : <Moon className="h-3 w-3 shrink-0" />}
      {status.text}
    </Link>
  );
}
