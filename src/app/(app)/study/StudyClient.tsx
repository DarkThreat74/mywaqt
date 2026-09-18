"use client";

import { useState } from "react";
import Link from "next/link";
import { Timer, Volume2, Wind, Hand, GraduationCap } from "lucide-react";
import FocusTimer from "./FocusTimer";
import Soundscape from "./Soundscape";
import Breathe from "./Breathe";
import Fidget from "./Fidget";
import { useUISFX } from "@/components/uisfx-provider";

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
