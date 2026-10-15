"use client";

/**
 * Study stats sheet — opened from the day header's compact "Stats" button.
 * Owns its own data: local session history merged with the server copy
 * (cross-device), homework→class rollup, month/year/all-time ranges.
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, LayoutGrid, Loader2, X } from "lucide-react";
import type { Class, Homework } from "@/lib/db/schema";
import { fmtDur } from "@/lib/blocks/gaps";
import { getDiscipline, mergeSessionHistory, type SessionEntry } from "@/lib/study/session";

export type StatsRange = "week" | "month" | "year" | "all";

export function rangeStart(range: StatsRange, now: Date): Date | null {
  if (range === "week") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
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
  const subjects = new Map<string, { min: number; days: Set<string> }>();
  const daySet = new Set<string>();
  // Minutes per weekday, Mon-first — powers the "you usually study on…" line
  // and the weekly day strip.
  const weekdayMin = new Array<number>(7).fill(0);
  let breaks = 0, switches = 0, tracked = 0, longest = 0;
  for (const e of rows) {
    const min = entryMinutes(e);
    daySet.add(e.date);
    weekdayMin[(new Date(`${e.date}T12:00:00`).getDay() + 6) % 7] += min;
    if (min > longest) longest = min;
    if (e.method) methods.set(e.method, (methods.get(e.method) ?? 0) + 1);
    // Only sessions written after break/switch telemetry existed count toward
    // the average — pre-telemetry entries carried 0 and dragged it to "0.0".
    if (e.breaks !== undefined || e.switches !== undefined) {
      tracked++;
      breaks += e.breaks ?? 0;
      switches += e.switches ?? 0;
    }
    for (const s of e.subjects ?? []) {
      const label = classOf(s);
      const cur = subjects.get(label) ?? { min: 0, days: new Set<string>() };
      cur.min += s.min;
      cur.days.add(e.date);
      subjects.set(label, cur);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    totalMin, sessions: rows.length, finished,
    methods: top(methods),
    subjects: [...subjects.entries()]
      .map(([label, v]) => ({ label, min: v.min, days: [...v.days].sort().reverse() }))
      .sort((a, b) => b.min - a.min),
    daysActive: daySet.size,
    weekdayMin,
    longest,
    avgSession: rows.length ? Math.round(totalMin / rows.length) : 0,
    avgBreaks: tracked ? breaks / tracked : null,
    avgSwitches: tracked ? switches / tracked : null,
    trackedSessions: tracked,
  };
}

export default function StudyStatsSheet({ onClose }: { onClose: () => void }) {
  // Week (Mon–Sun, resets when Sunday ends 11:59pm) is the default view —
  // the loop users actually live in.
  const [range, setRange] = useState<StatsRange>("week");
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<SessionEntry[]>(() => getDiscipline().history);
  const [hwClass, setHwClass] = useState<Map<string, string>>(new Map());
  // Homework title (lowercased) → classId — resolves subjects recorded before
  // hw-tagging, where only the assignment title made it into the label.
  const [hwByTitle, setHwByTitle] = useState<Map<string, string>>(new Map());
  const [classMap, setClassMap] = useState<Map<string, Class>>(new Map());
  // Full homework list — powers the per-class grades rollup.
  const [hwItems, setHwItems] = useState<Homework[]>([]);

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
            setHwItems(data);
            setHwClass(new Map(data.map((h: Homework) => [h.id, h.classId ?? ""]).filter(([, c]) => c) as [string, string][]));
            setHwByTitle(new Map(data.map((h: Homework) => [h.title.trim().toLowerCase(), h.classId ?? ""]).filter(([, c]) => c) as [string, string][]));
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
    // 1. Homework id → class. 2. Label → homework title → class (older sessions
    //    and derived labels like "Chem Quiz 6 — page 3" / "Review Chem Quiz 6").
    // 3. Fall back to the raw label.
    const clsId = s.hw ? hwClass.get(s.hw) : undefined;
    if (clsId && classMap.has(clsId)) return classMap.get(clsId)!.name;
    const clean = s.label.replace(/^Review\s+/i, "").replace(/\s+—\s+(page\s+\d+|keep going)$/i, "").replace(/( \(finish\))+$/i, "").trim().toLowerCase();
    const cls2 = hwByTitle.get(clean);
    return (cls2 ? classMap.get(cls2)?.name : undefined) ?? s.label;
  }), [history, range, hwClass, hwByTitle, classMap]);

  // Grades per class — A=4 / B=3 / C=2 / fail=0 averaged to a letter. The item
  // list stays collapsed until the row is expanded.
  const gradeGroups = useMemo(() => {
    const LETTER = ["Fail", "D", "C", "B", "A"] as const;
    const PTS: Record<string, number> = { A: 4, B: 3, C: 2, fail: 0 };
    const groups = new Map<string, { name: string; items: { id: string; title: string; grade: string; kind: string }[] }>();
    for (const h of hwItems) {
      if (!h.grade || !(h.grade in PTS)) continue;
      const name = (h.classId && classMap.get(h.classId)?.name) || "No class";
      const g = groups.get(name) ?? { name, items: [] };
      g.items.push({ id: h.id, title: h.title, grade: h.grade, kind: h.kind });
      groups.set(name, g);
    }
    return [...groups.values()]
      .map((g) => ({
        ...g,
        avg: LETTER[Math.max(0, Math.round(g.items.reduce((s, i) => s + PTS[i.grade], 0) / g.items.length))],
        items: g.items,
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [hwItems, classMap]);

  const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

  // Sessions that paused for salah — from salahBreaks on the session history.
  const salahPauses = useMemo(() => {
    const from = rangeStart(range, new Date());
    return history
      .filter((e) => !from || new Date(`${e.date}T12:00:00`) >= from)
      .reduce((s, e) => s + (e.salahBreaks ?? 0), 0);
  }, [history, range]);

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
            {(["week", "month", "year", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: range === r ? "var(--color-ink)" : "transparent",
                  color: range === r ? "var(--color-paper)" : "var(--color-ink-muted)",
                }}
              >
                {r === "week" ? "Week" : r === "month" ? "Month" : r === "year" ? "Year" : "All time"}
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

              {/* Day strip — Mon–Sun dots filled for days with sessions */}
              <div className="mt-3 flex items-center justify-between">
                {WEEKDAYS.map((d, i) => {
                  const on = stats.weekdayMin[i] > 0;
                  const best = stats.weekdayMin[i] === Math.max(...stats.weekdayMin);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: on ? (best ? "var(--color-accent)" : "var(--color-ink-soft)") : "var(--color-paper-3)" }}
                      />
                      <span className="text-[9px] font-medium" style={{ color: on ? "var(--color-ink)" : "var(--color-ink-muted)" }}>{d}</span>
                    </div>
                  );
                })}
              </div>

              {/* Range calendar — key={range} resets the month cursor + view
                  mode when the range changes. */}
              <SessionCalendar key={range} history={history} range={range} />

              {/* Your rhythm — averages once there's enough data to mean
                  something (5+ tracked sessions in range). */}
              {stats.sessions >= 5 && (
                <>
                  <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                    Your rhythm
                  </p>
                  <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-ink-soft)" }}>
                    <p>a session runs <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{fmtDur(stats.avgSession)}</span> on average{stats.daysActive > 0 ? `, ~${fmtDur(Math.round(stats.totalMin / stats.daysActive))} each study day` : ""}</p>
                    {stats.trackedSessions > 0 && (
                      <p className="tabular-nums">avg {stats.avgBreaks!.toFixed(1)} breaks · {stats.avgSwitches!.toFixed(1)} mid-session switches</p>
                    )}
                    <p className="tabular-nums">longest single session {fmtDur(stats.longest)}
                      {(() => { const b = stats.weekdayMin.indexOf(Math.max(...stats.weekdayMin)); return stats.weekdayMin[b] > 0 ? ` · ${["Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays","Sundays"][b]} are your day` : ""; })()}
                    </p>
                    {salahPauses > 0 && <p className="tabular-nums">left the desk for salah ×{salahPauses}</p>}
                  </div>
                </>
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
                    {stats.subjects.slice(0, 12).map((s) => (
                      <div key={s.label} className="flex items-baseline gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink)" }}>{s.label}
                          <span className="ml-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                            {[...new Set(s.days.map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(`${d}T12:00:00`).getDay()]))].join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{fmtDur(s.min)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Grades per class — collapsed to "Chemistry · avg B · 3 graded";
                  expanding lists exactly which items earned which grade. */}
              {gradeGroups.length > 0 && (
                <>
                  <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
                    Grades
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {gradeGroups.map((g) => (
                      <details key={g.name} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                        <summary className="flex cursor-pointer items-baseline gap-2 text-xs list-none [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>{g.name}</span>
                          <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{g.items.length} graded</span>
                          <span className="shrink-0 text-[11px] font-bold" style={{ color: g.avg === "Fail" ? "var(--color-warmth)" : "var(--color-accent)" }}>avg {g.avg}</span>
                        </summary>
                        <div className="mt-2 flex flex-col gap-1 border-t pt-2" style={{ borderColor: "var(--color-paper-3)" }}>
                          {g.items.map((i) => (
                            <div key={i.id} className="flex items-baseline gap-2 text-[11px]">
                              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink-soft)" }}>{i.title}</span>
                              <span className="shrink-0 text-[9px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{i.kind}</span>
                              <span className="shrink-0 font-semibold tabular-nums" style={{ color: i.grade === "fail" ? "var(--color-warmth)" : "var(--color-ink)" }}>
                                {i.grade === "fail" ? "Fail" : i.grade}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
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

/** Minutes compressed to fit a day cell — "45m", "2h", "1.5h". */
function compactMin(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}

/** Calendar of study days for the selected range — week = 7-day strip,
 *  month = this month's grid. Year/all-time get a month switcher plus a
 *  heatmap toggle (every month in range as a mini grid). Colored cells show
 *  the minutes studied in tiny type instead of the day number. */
function SessionCalendar({ history, range }: { history: SessionEntry[]; range: StatsRange }) {
  const byDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of history) m.set(e.date, (m.get(e.date) ?? 0) + entryMinutes(e));
    return m;
  }, [history]);
  const maxMin = useMemo(() => Math.max(1, ...byDate.values()), [byDate]);
  const [heat, setHeat] = useState(false);
  const [monthIdx, setMonthIdx] = useState<number | null>(null);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const cell = (dateStr: string, dayNum: number | null) => {
    const min = dayNum !== null ? (byDate.get(dateStr) ?? 0) : 0;
    const pct = min > 0 ? Math.max(0.18, Math.min(1, min / maxMin)) : 0;
    return (
      <span
        key={dateStr}
        title={min > 0 ? `${fmtDur(Math.round(min))} studied` : undefined}
        className="flex aspect-square items-center justify-center rounded-[4px] text-[9px] tabular-nums"
        style={{
          backgroundColor: min > 0 ? `color-mix(in oklab, var(--color-accent) ${Math.round(pct * 85)}%, transparent)` : "var(--color-paper-2)",
          color: min > 0 ? "var(--color-ink)" : "var(--color-ink-muted)",
          outline: dateStr === todayStr ? "1.5px solid var(--color-accent)" : "none",
          outlineOffset: -1.5,
        }}
      >
        {min > 0 ? compactMin(min) : (dayNum ?? "")}
      </span>
    );
  };

  const monthGrid = (y: number, mo: number, label: string) => {
    const first = new Date(y, mo, 1);
    const days = new Date(y, mo + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Mon-first
    return (
      <div key={`${y}-${mo}`}>
        {label && <p className="mb-1 text-[10px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>{label}</p>}
        <div className="grid grid-cols-7 gap-[3px]">
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const ds = `${y}-${String(mo + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
            return cell(ds, i + 1);
          })}
        </div>
      </div>
    );
  };

  if (range === "week") {
    const start = rangeStart("week", today)!;
    return (
      <div className="mt-3 grid grid-cols-7 gap-[3px]">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start); d.setDate(start.getDate() + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return cell(ds, d.getDate());
        })}
      </div>
    );
  }

  const monthName = (y: number, mo: number, showYear: boolean) =>
    new Date(y, mo, 1).toLocaleDateString([], { month: "short", ...(showYear ? { year: "numeric" } : {}) });

  if (range === "month") {
    return <div className="mt-4">{monthGrid(today.getFullYear(), today.getMonth(), monthName(today.getFullYear(), today.getMonth(), true))}</div>;
  }

  // Year + all-time — months in range, navigable one at a time or as a
  // heatmap of mini-grids.
  const firstEntry = history.length ? history.map((e) => e.date).sort()[0] : todayStr;
  const [fy, fm] = range === "all" ? firstEntry.split("-").map(Number) : [today.getFullYear(), 1];
  const months: [number, number][] = [];
  for (let y = fy, mo = fm - 1; y < today.getFullYear() || (y === today.getFullYear() && mo <= today.getMonth()); mo === 11 ? (y++, mo = 0) : mo++) {
    months.push([y, mo]);
  }
  const multiYear = months.some(([y]) => y !== months[0][0]);
  const idx = Math.min(monthIdx ?? months.length - 1, months.length - 1);
  const [cy, cm] = months[Math.max(0, idx)];

  return (
    <div className="mt-4">
      {/* Month ‹ › switcher + heatmap toggle */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthIdx(Math.max(0, idx - 1))}
            disabled={heat || idx <= 0}
            className="rounded-md p-1 transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-30"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-16 text-center text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
            {heat ? "Heatmap" : monthName(cy, cm, true)}
          </span>
          <button
            onClick={() => setMonthIdx(Math.min(months.length - 1, idx + 1))}
            disabled={heat || idx >= months.length - 1}
            className="rounded-md p-1 transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-30"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => setHeat((h) => !h)}
          aria-pressed={heat}
          className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
          style={{
            borderColor: heat ? "var(--color-accent)" : "var(--color-paper-3)",
            backgroundColor: heat ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
            color: heat ? "var(--color-accent)" : "var(--color-ink-muted)",
          }}
        >
          <LayoutGrid className="h-3 w-3" /> Heatmap
        </button>
      </div>

      {heat ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {months.map(([y, mo]) => monthGrid(y, mo, monthName(y, mo, multiYear || range === "all")))}
        </div>
      ) : (
        monthGrid(cy, cm, "")
      )}
    </div>
  );
}
