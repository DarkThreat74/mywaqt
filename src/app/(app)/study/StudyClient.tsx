"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Timer, Volume2, Wind, Hand, GraduationCap, X } from "lucide-react";
import FocusTimer from "./FocusTimer";
import Soundscape from "./Soundscape";
import Breathe from "./Breathe";
import Fidget from "./Fidget";
import { useUISFX } from "@/components/uisfx-provider";
import VoxIcon from "@/components/vox-icon";
import { getDiscipline } from "@/lib/study/session";

type Tab = "focus" | "sounds" | "breathe" | "fidget";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "focus", label: "Focus", icon: Timer },
  { id: "sounds", label: "Sounds", icon: Volume2 },
  { id: "breathe", label: "Breathe", icon: Wind },
  { id: "fidget", label: "Fidget", icon: Hand },
];

export default function StudyClient() {
  const { play } = useUISFX();
  const [tab, setTab] = useState<Tab>("focus");

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:max-w-2xl sm:px-6 lg:max-w-4xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Study</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Focus tools — timers, noise, breathing, fidgets
          </p>
        </div>
        <p className="pt-0.5 text-xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">
          دراسة
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="mb-6 grid grid-cols-4 gap-1 rounded-xl border p-1"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => { if (id !== tab) play("select"); setTab(id); }}
              className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--color-paper)" : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                minHeight: 44,
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content — keep all mounted so timers/audio survive tab switches */}
      <div className={tab === "focus" ? "" : "hidden"}><FocusTimer /></div>
      <div className={tab === "sounds" ? "" : "hidden"}><Soundscape /></div>
      <div className={tab === "breathe" ? "" : "hidden"}><Breathe /></div>
      <div className={tab === "fidget" ? "" : "hidden"}><Fidget /></div>

      <VoxStats />

      {/* Homework shortcut */}
      <Link
        href="/homework"
        className="mt-8 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl border"
          style={{ backgroundColor: "var(--color-paper-2)", borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
        >
          <GraduationCap className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: "var(--color-ink)" }}>Homework</span>
          <span className="block text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Assignments, tests, and deadlines
          </span>
        </span>
      </Link>
    </div>
  );
}

/** Vox session stats — streak, this week's focus minutes, recent history.
 *  Data is local (the discipline record written on every session end). */
function VoxStats() {
  // Re-read on mount only — sessions ending elsewhere update on next visit.
  const [stats] = useState(() => {
    const disc = getDiscipline();
    const now = Date.now();
    const wk = disc.history
      .filter((e) => now - new Date(e.date + "T00:00:00").getTime() < 7 * 86400e3)
      .reduce((s, e) => s + e.minutes, 0);
    return { disc, weekMin: wk };
  });
  const d = stats.disc;
  const weekMin = stats.weekMin;

  if (d.completed === 0 && d.abandoned === 0) return null;

  return (
    <div
      className="mt-8 rounded-xl border p-4"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
        <VoxIcon size={14} /> Vox record
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { v: String(d.streak), l: "focus streak" },
          { v: `${Math.floor(weekMin / 60) ? `${Math.floor(weekMin / 60)}h ` : ""}${weekMin % 60}m`, l: "this week" },
          { v: String(d.completed), l: "finished" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg py-2" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <p className="text-base font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{s.v}</p>
            <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{s.l}</p>
          </div>
        ))}
      </div>
      {d.history.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {d.history.slice(0, 5).map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
              {e.finished
                ? <Check className="h-3 w-3 shrink-0" style={{ color: "var(--color-success)" }} />
                : <X className="h-3 w-3 shrink-0" style={{ color: "var(--color-warmth)" }} />}
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                {e.minutes}m · {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
