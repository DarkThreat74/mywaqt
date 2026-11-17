"use client";

import { useMemo, useState } from "react";
import { buildLifetime, PRAYER_KEYS, type CellState, type LifetimeCell, type LifetimeResult, type PrayerKey } from "@/lib/prayer/lifetime";
import BalighSetup from "./BalighSetup";

interface LifetimePayload {
  userId: string;
  setupCompleted: boolean;
  balighDate: string | null;
  balighAge?: number | null;
  initialOwed?: Record<string, number> | null;
  owedNow?: Record<string, number>;
  prayedByPrayer?: Record<string, number>;
  qadaLoggedByPrayer?: Record<string, number>;
}

interface Props {
  analytics: {
    heatmapData?: Record<string, number>;
    missedData?: Record<string, number>;
    lifetime?: LifetimePayload | null;
  } | null;
  onSetupQadaa?: () => void;
  onBalighDone?: () => void;
}

const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

function cellColor(cell: { state: CellState; intensity?: number; pct?: number | null }): string {
  switch (cell.state) {
    case "future":
      return "color-mix(in srgb, var(--color-paper-3) 45%, var(--color-paper))";
    case "neutral":
      return "color-mix(in srgb, var(--color-paper-3) 70%, var(--color-paper))";
    case "filled":
      return "color-mix(in srgb, var(--color-success) 45%, var(--color-paper))";
    case "owed": {
      const a = 30 + Math.round((cell.intensity ?? 0) * 60);
      return `color-mix(in srgb, var(--color-error) ${a}%, var(--color-paper))`;
    }
    case "tracked": {
      const pct = cell.pct ?? 0;
      const err = Math.round((1 - pct) * 100);
      return `color-mix(in srgb, var(--color-error) ${err}%, var(--color-success) ${100 - err}%)`;
    }
  }
}

function fmtRange(start: string, end: string): string {
  const f = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(start)} – ${f(end)}`;
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-[2px] align-middle" style={{ backgroundColor: color }} />;
}

export default function LifetimeView({ analytics, onSetupQadaa, onBalighDone }: Props) {
  const [selected, setSelected] = useState<LifetimeCell | null>(null);

  const lifetime = analytics?.lifetime ?? null;

  const result: LifetimeResult | null = useMemo(() => {
    if (!lifetime?.setupCompleted || !lifetime.balighDate || !analytics) return null;
    return buildLifetime({
      userId: lifetime.userId,
      balighDate: lifetime.balighDate,
      initialOwed: lifetime.initialOwed ?? {},
      owedNow: lifetime.owedNow,
      prayedByPrayer: lifetime.prayedByPrayer,
      qadaLoggedByPrayer: lifetime.qadaLoggedByPrayer,
      prayedByDate: analytics.heatmapData ?? {},
      missedByDate: analytics.missedData,
    });
  }, [analytics, lifetime]);

  if (!lifetime) return null;

  if (!lifetime.setupCompleted) {
    return (
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Lifetime</h2>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
            See your whole prayer life at a glance — every day since you became baligh, including your qada debt.
          </p>
          <p className="mt-2 text-xs font-medium" style={{ color: "var(--color-warmth)" }}>
            This view includes your qada numbers.
          </p>
          {onSetupQadaa && (
            <button
              onClick={onSetupQadaa}
              className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
            >
              Set up qada numbers
            </button>
          )}
          <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Set up your qada numbers in the Qadaa section below.
          </p>
        </div>
      </div>
    );
  }

  if (!lifetime.balighDate) {
    return <BalighSetup onDone={onBalighDone} />;
  }

  if (!result) return null;

  const { totals, years } = result;
  const denom = Math.max(1, totals.days * 5);
  const segs = [
    { label: "prayed", value: totals.totalPrayed, color: "var(--color-success)" },
    { label: "made up", value: totals.madeUp, color: "color-mix(in srgb, var(--color-success) 55%, var(--color-paper-2))" },
    { label: "still owed", value: totals.owedRemaining, color: "var(--color-warmth)" },
  ];
  const segSum = segs.reduce((s, x) => s + Math.min(x.value, denom), 0);
  const restPct = Math.max(0, 100 - (segSum / denom) * 100);

  const pct = totals.pctPrayed;
  const headline = pct != null
    ? `You've prayed ${Math.round(pct * 100)}% of your lifetime prayers`
    : "Start logging to see your lifetime %";

  const perPrayerRows = PRAYER_KEYS.map((key) => ({
    key,
    prayed: lifetime.prayedByPrayer?.[key] ?? 0,
    madeUp: lifetime.qadaLoggedByPrayer?.[key] ?? 0,
    owed: lifetime.owedNow?.[key] ?? 0,
  }));

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: "var(--color-paper-3)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Lifetime</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Since baligh · {lifetime.balighDate}
        </p>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-sm font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{headline}</p>

        {/* Segmented bar */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} role="img" aria-label={headline}>
          {segs.map((s) => {
            const w = Math.min(s.value / denom, 1) * 100;
            return w > 0 ? (
              <div key={s.label} style={{ width: `${w}%`, backgroundColor: s.color }} />
            ) : null;
          })}
          {restPct > 0 && <div style={{ width: `${restPct}%`, backgroundColor: "var(--color-paper-3)" }} />}
        </div>

        {/* Stat chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            `${totals.days} days since baligh`,
            `${totals.totalPrayed} prayed`,
            `${totals.owedRemaining} still owed`,
            `${totals.madeUp} made up`,
            totals.trackingStart ? `tracking since ${totals.trackingStart}` : "not tracking yet",
          ].map((chip) => (
            <span
              key={chip}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium tabular-nums"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", backgroundColor: "var(--color-paper-2)" }}
            >
              {chip}
            </span>
          ))}
        </div>

        {/* Grid by year */}
        <div className="mt-4 space-y-2.5">
          {years.map(({ year, cells }) => (
            <div key={year} className="flex items-center gap-1.5">
              <span className="w-9 shrink-0 text-right text-[9px] font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {year}
              </span>
              <div className="flex min-w-0 flex-1 gap-[3px]">
                {cells.map((cell) => (
                  <button
                    key={cell.index}
                    type="button"
                    onClick={() => setSelected(cell)}
                    aria-label={`${fmtRange(cell.start, cell.end)}: ${cell.state}`}
                    title={`${fmtRange(cell.start, cell.end)} — prayed ${cell.prayed}, missed ${cell.missed}, owed ${cell.owed}, made up ${cell.filled}`}
                    className="aspect-square min-w-0 flex-1 rounded-[3px] transition-opacity"
                    style={{ backgroundColor: cellColor(cell) }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Selected cell detail */}
        {selected && (
          <div className="mt-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
                {fmtRange(selected.start, selected.end)}
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[11px] font-medium"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-[11px] tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
              {selected.prayed} prayed · {selected.missed} missed · {selected.owed} owed · {selected.filled} made up
              {selected.trackedDays > 0 ? ` · ${Math.round((selected.pct ?? 0) * 100)}% of tracked days` : ""}
            </p>
            {Object.keys(selected.byPrayer).length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {PRAYER_KEYS.map((key) => {
                  const slot = selected.byPrayer[key];
                  if (!slot || (slot.owed === 0 && slot.filled === 0)) return null;
                  return (
                    <p key={key} className="text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                      {PRAYER_LABELS[key]}: {slot.owed} owed{slot.filled > 0 ? ` · ${slot.filled} made up` : ""}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "tracked", intensity: 0, pct: 0.1 })} /> mostly missed</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "tracked", intensity: 0, pct: 0.5 })} /> half prayed</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "tracked", intensity: 0, pct: 0.8 })} /> mostly prayed</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "tracked", intensity: 0, pct: 1 })} /> all prayed</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "filled" })} /> made-up qada</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "owed", intensity: 0.8 })} /> owed</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "neutral" })} /> before tracking</span>
          <span className="flex items-center gap-1"><LegendDot color={cellColor({ state: "future" })} /> future</span>
        </div>

        {/* Per-prayer breakdown */}
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            By prayer
          </p>
          <div className="space-y-1">
            {perPrayerRows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: "var(--color-ink-soft)" }}>{PRAYER_LABELS[r.key]}</span>
                <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {r.prayed} prayed{r.madeUp > 0 ? ` · ${r.madeUp} made up` : ""}{r.owed > 0 ? ` · ${r.owed} owed` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
