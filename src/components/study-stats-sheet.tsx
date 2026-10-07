"use client";

/**
 * Study stats sheet — opened from the day header's compact "Stats" button.
 * Owns its own data: local session history merged with the server copy
 * (cross-device), homework→class rollup, month/year/all-time ranges.
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, X } from "lucide-react";
import type { Class, Homework } from "@/lib/db/schema";
import { fmtDur } from "@/lib/blocks/gaps";
import { getDiscipline, mergeSessionHistory, type SessionEntry } from "@/lib/study/session";

export type StatsRange = "month" | "year" | "all";

export function rangeStart(range: StatsRange, now: Date): Date | null {
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export function entryMinutes(e: SessionEntry): number {
  // Locked-in minutes are the honest study number; fall back to elapsed for
  // history entries written before the habit fields existed.
  return e.focusMin ?? e.minutes;
}

/** Minutes studied this calendar week (Mon–Sun) — the header line. */
export function weekMinutes(history: SessionEntry[]): number {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return history
    .filter((e) => new Date(`${e.date}T12:00:00`) >= monday)
    .reduce((s, e) => s + entryMinutes(e), 0);
}

/** `classOf` rolls a subject entry up to its class name when the homeworkId
 *  resolves ("Chemistry 4h" instead of "Chem lab 90m + Chem exam 2h"). */
export function studyStats(history: SessionEntry[], range: StatsRange, classOf: (s: { label: string; hw?: string }) => string) {
  const from = rangeStart(range, new Date());
  const rows = history.filter((e) => !from || new Date(`${e.date}T12:00:00`) >= from);
  const totalMin = rows.reduce((s, e) => s + entryMinutes(e), 0);
  const finished = rows.filter((e) => e.finished).length;
  const methods = new Map<string, number>();
  const subjects = new Map<string, number>();
  let breaks = 0, switches = 0, tracked = 0;
  for (const e of rows) {
    if (e.method) methods.set(e.method, (methods.get(e.method) ?? 0) + 1);
    // Only sessions written after break/switch telemetry existed count toward
    // the average — pre-telemetry entries carried 0 and dragged it to "0.0".
    if (e.breaks !== undefined || e.switches !== undefined) {
      tracked++;
      breaks += e.breaks ?? 0;
      switches += e.switches ?? 0;
    }
    for (const s of e.subjects ?? []) subjects.set(classOf(s), (subjects.get(classOf(s)) ?? 0) + s.min);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    totalMin, sessions: rows.length, finished,
    methods: top(methods), subjects: top(subjects),
    avgBreaks: tracked ? breaks / tracked : null,
    avgSwitches: tracked ? switches / tracked : null,
  };
}

export default function StudyStatsSheet({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<StatsRange>("month");
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<SessionEntry[]>(() => getDiscipline().history);
  const [hwClass, setHwClass] = useState<Map<string, string>>(new Map());
  const [classMap, setClassMap] = useState<Map<string, Class>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hwRes, classRes, histRes] = await Promise.all([
          fetch("/api/homework?all=1").catch(() => null),
          fetch("/api/classes").catch(() => null),
          fetch("/api/study-history").catch(() => null),
        ]);
        if (cancelled) return;
        if (hwRes?.ok) {
          const data = await hwRes.json();
          if (Array.isArray(data)) {
            setHwClass(new Map(data.map((h: Homework) => [h.id, h.classId ?? ""]).filter(([, c]) => c) as [string, string][]));
          }
        }
        if (classRes?.ok) {
          const data = await classRes.json();
          const list: Class[] = Array.isArray(data) ? data : (data.classes ?? []);
          setClassMap(new Map(list.map((c) => [c.id, c])));
        }
        if (histRes?.ok) {
          const data = await histRes.json();
          if (Array.isArray(data) && data.length > 0) setHistory(mergeSessionHistory(data));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = original; };
  }, [onClose]);

  const stats = useMemo(() => studyStats(history, range, (s) => {
    const clsId = s.hw ? hwClass.get(s.hw) : undefined;
    return (clsId ? classMap.get(clsId)?.name : undefined) ?? s.label;
  }), [history, range, hwClass, classMap]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Study stats"
    >
      <button
        className="absolute inset-0"
        style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }}
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            <BarChart3 className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            Study stats
          </p>
          <div className="flex items-center gap-1">
            {(["month", "year", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: range === r ? "var(--color-ink)" : "transparent",
                  color: range === r ? "var(--color-paper)" : "var(--color-ink-muted)",
                }}
              >
                {r === "month" ? "Month" : r === "year" ? "Year" : "All time"}
              </button>
            ))}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close stats"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
            </div>
          ) : stats.sessions === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
              No sessions logged yet{range !== "all" ? " in this range" : ""}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { v: fmtDur(stats.totalMin), l: "studied" },
                  { v: String(stats.sessions), l: "sessions" },
                  { v: `${Math.round((stats.finished / stats.sessions) * 100)}%`, l: "finished" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border px-2 py-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.v}</p>
                    <p className="text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>{s.l}</p>
                  </div>
                ))}
              </div>
              {stats.avgBreaks !== null && (
                <p className="mt-3 text-[11px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  avg {stats.avgBreaks.toFixed(1)} breaks · {stats.avgSwitches!.toFixed(1)} switches per session
                </p>
              )}
              {stats.methods.length > 0 && (
                <>
                  <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                    How you study
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.methods.map(([m, n]) => (
                      <span key={m} className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
                        {m} ×{n}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {stats.subjects.length > 0 && (
                <>
                  <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                    Time per subject
                  </p>
                  <div className="flex flex-col gap-1">
                    {stats.subjects.slice(0, 12).map(([label, min]) => (
                      <div key={label} className="flex items-baseline gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink)" }}>{label}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{fmtDur(min)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
