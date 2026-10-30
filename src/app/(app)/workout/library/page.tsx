"use client";

import { useState } from "react";
import Link from "next/link";
import { EXERCISES, MUSCLE_GROUP, GROUPS, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";

const TIERS = ["all", "S", "A", "B", "C", "D", "F"] as const;
const TIER_COLORS: Record<string, string> = { S: "#d4a843", A: "#7fbf6b", B: "#5f9ea0", C: "#888888", D: "#b07a5f", F: "#c04f4f" };

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [headFilter, setHeadFilter] = useState("all");
  const [view, setView] = useState<Exercise | null>(null);
  const [open, setOpen] = useState(false);

  const list = EXERCISES.filter((x) => {
    if (groupFilter !== "all") {
      if (MUSCLE_GROUP[x.muscle] !== groupFilter) return false;
      if (headFilter !== "all" && (x.head ?? x.muscle) !== headFilter) return false;
    }
    if (tierFilter !== "all" && x.tier !== tierFilter) return false;
    if (search && !x.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/workout" className="text-sm" style={{ color: "var(--color-ink-muted)" }}>←</Link>
        <h1 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Exercise library</h1>
        <span className="ml-auto text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{list.length}</span>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
        className="mt-3 w-full rounded-lg border px-3 py-2 text-xs outline-none"
        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />

      <div className="mt-2 flex gap-1">
        {TIERS.map((t) => (
          <button key={t} type="button" onClick={() => setTierFilter(t)}
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
            style={{ borderColor: tierFilter === t ? "var(--color-ink)" : "var(--color-paper-3)", color: tierFilter === t ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
            {t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      <div className="relative mt-2">
        <button type="button" onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
          <span>{groupFilter === "all" ? "All muscles" : GROUPS.find((g) => g.key === groupFilter)?.label}</span>
          <span style={{ color: "var(--color-ink-muted)" }}>▾</span>
        </button>
        {open && (
          <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            {[{ key: "all", label: "All muscles" }, ...GROUPS].map((g) => (
              <button key={g.key} type="button" onClick={() => { setGroupFilter(g.key); setHeadFilter("all"); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink)" }}>
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {groupFilter !== "all" && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[{ key: "all", label: "All" }, ...(GROUPS.find((g) => g.key === groupFilter)?.heads || [])].map((h) => (
            <button key={h.key} type="button" onClick={() => setHeadFilter(h.key)}
              className="rounded-full border px-2.5 py-1 text-[10px]"
              style={{ borderColor: headFilter === h.key ? "var(--color-ink)" : "var(--color-paper-3)", color: headFilter === h.key ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
              {h.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {list.map((x) => (
          <button key={x.slug} type="button" onClick={() => setView(x)}
            className="flex w-full items-center gap-2.5 rounded-lg border p-2 text-left hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)" }}>
            <ExerciseMedia slug={x.slug} pattern={x.pattern}
              className="h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--color-paper-2)" }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{x.name}</p>
              <p className="truncate text-[10px] capitalize" style={{ color: "var(--color-ink-muted)" }}>{x.muscle.replace(/_/g, " ")} · {x.equip}</p>
            </div>
            {x.tier && <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: TIER_COLORS[x.tier], color: "#fff" }}>{x.tier}</span>}
          </button>
        ))}
      </div>

      {view && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setView(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{view.name}</h2>
              <button type="button" onClick={() => setView(null)} className="text-lg" style={{ color: "var(--color-ink-muted)" }}>✕</button>
            </div>
            <ExerciseMedia slug={view.slug} pattern={view.pattern} className="mt-4 aspect-square w-full rounded-xl" style={{ backgroundColor: "var(--color-paper-2)" }} />
            {view.howto && <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>{view.howto}</p>}
            {SCIENCE[view.slug] && <p className="mt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>{SCIENCE[view.slug].science}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
