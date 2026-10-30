"use client";

import { useEffect, useMemo, useState } from "react";
import { EXERCISES, MUSCLES, SPLIT_TEMPLATES, DAY_TEMPLATES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";

interface DayExercise { slug: string; name: string; sets: number; reps: string; }
interface WDay { id: string; weekday: number | null; name: string; exercises: DayExercise[]; }

const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

export default function WorkoutClient() {
  const [days, setDays] = useState<WDay[]>([]);
  const [step, setStep] = useState<number | null>(null); // 0=type, 1=name, 2=exercises
  const [view, setView] = useState<Exercise | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState<Array<{ slug: string; points: { at: string; e1: number }[]; last: { w: number; r: number; rir: number | null; at: string } | null; sets: number }>>([]);
  const [muscles, setMuscles] = useState<Array<{ muscle: string; effSetsWeek: number; landmark: [number, number]; slopePct: number; status: string }>>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; dayName: string; startedAt: string; endedAt: string | null }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dayName, setDayName] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DayExercise[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/workout/days").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setDays(data.days || []);
    }
    const pr = await fetch("/api/workout/progress").catch(() => null);
    if (pr?.ok) {
      const data = await pr.json();
      setProgress(data.progress || []);
      setMuscles(data.muscles || []);
    }
    const hr = await fetch("/api/workout/sessions").catch(() => null);
    if (hr?.ok) {
      const data = await hr.json();
      setHistory((data.sessions || []).filter((s: { endedAt: string | null }) => s.endedAt).slice(0, 10));
    }
  }
  useEffect(() => { Promise.resolve().then(() => { void load(); setNow(Date.now()); }); }, []);

  const filtered = useMemo(() => {
    let list = EXERCISES;
    if (muscleFilter !== "all") list = list.filter((x) => x.muscle === muscleFilter);
    if (tierFilter !== "all") list = list.filter((x) => x.tier === tierFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(q) || x.cue.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.tier || "Z").localeCompare(b.tier || "Z"));
  }, [muscleFilter, search, tierFilter]);

  const applyTemplate = async (key: string) => {
    const tpl = SPLIT_TEMPLATES[key];
    if (!tpl) return;
    for (const [weekday, d] of Object.entries(tpl.days)) {
      // Suggest the tier-S exercise per muscle for each day — the bank's
      // ranked defaults, fully editable after.
      const picks = d.muscles
        .map((m) => EXERCISES.find((x) => x.muscle === m && x.tier === "S") || EXERCISES.find((x) => x.muscle === m))
        .filter((x): x is Exercise => !!x)
        .map((x) => ({ slug: x.slug, name: x.name, sets: 3, reps: "8-12" }));
      await fetch("/api/workout/days", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday: Number(weekday), name: d.name, exercises: picks }),
      }).catch(() => {});
    }
    await load();
  };

  const openProfile = (d?: WDay) => {
    setStep(d ? 2 : 0);
    setEditId(d?.id || null);
    setDayName(d?.name || "");
    setPicked(d?.exercises?.map((x) => ({ slug: x.slug, name: x.name, sets: x.sets, reps: x.reps })) || []);
    setSearch(""); setMuscleFilter("all"); setTierFilter("all");
  };

  const pickType = (t: { name: string; muscles: string[] }) => {
    setDayName(t.name);
    setStep(1);
  };

  const saveDay = async () => {
    if (!dayName.trim()) return;
    const res = await fetch("/api/workout/days", {
      method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name: dayName, exercises: picked }),
    });
    if (res.ok) {
      setMsg(editId ? "Updated." : "Day created.");
      setTimeout(() => setMsg(null), 2000);
      setStep(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "Couldn't save.");
    }
  };

  const deleteDay = async (id: string) => {
    await fetch(`/api/workout/days?id=${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  };

  const addExercise = (x: Exercise) => {
    if (picked.some((p) => p.slug === x.slug)) return;
    setPicked((p) => [...p, { slug: x.slug, name: x.name, sets: 3, reps: "8-12" }]);
  };

  if (step === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12" style={{ animation: "fadeIn .25s ease" }}>
        <button type="button" onClick={() => setStep(null)} className="mb-8 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>← Workouts</button>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>What are we building?</h1>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {DAY_TEMPLATES.map((t) => (
            <button key={t.name} type="button" onClick={() => pickType(t)}
              className="rounded-xl border px-4 py-4 text-left text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
              {t.name}
            </button>
          ))}
          <button type="button" onClick={() => { setDayName(""); setStep(1); }}
            className="col-span-2 rounded-xl border border-dashed px-4 py-4 text-sm font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            Other — name it myself
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12" style={{ animation: "fadeIn .25s ease" }}>
        <button type="button" onClick={() => setStep(0)} className="mb-8 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>← Back</button>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>What should we call it?</h1>
        <input
          autoFocus value={dayName} onChange={(e) => setDayName(e.target.value)}
          placeholder="Push day, Legs…"
          className="mt-6 w-full rounded-lg border px-3 py-3 text-sm outline-none"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        />
        <button type="button" onClick={() => setStep(2)} disabled={!dayName.trim()}
          className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
          Pick exercises →
        </button>
      </div>
    );
  }

  if (step !== null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setStep(editId ? null : 1)} className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
            ←
          </button>
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {dayName || "Untitled"}
          </span>
        </div>

        {picked.length > 0 && (
          <div className="mt-4 space-y-2">
            {picked.map((p, i) => (
              <div key={p.slug} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
                <span className="flex-1 text-sm font-medium" style={{ color: "var(--color-ink)" }}>{p.name}</span>
                <input
                  type="number" min={1} max={20} value={p.sets}
                  onChange={(e) => setPicked((prev) => prev.map((q, j) => j === i ? { ...q, sets: Number(e.target.value) } : q))}
                  className="w-14 rounded border px-2 py-1 text-center text-xs"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                />
                <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>×</span>
                <input
                  value={p.reps}
                  onChange={(e) => setPicked((prev) => prev.map((q, j) => j === i ? { ...q, reps: e.target.value } : q))}
                  className="w-16 rounded border px-2 py-1 text-center text-xs"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                />
                <button type="button" onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))} className="text-xs" style={{ color: "var(--color-error)" }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises…"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          />
        </div>
        <div className="mt-2 flex gap-1">
          {["all", "S", "A", "B", "C", "D", "F"].map((t) => (
            <button key={t} type="button" onClick={() => setTierFilter(t)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
              style={{ borderColor: tierFilter === t ? "var(--color-ink)" : "var(--color-paper-3)", color: t === "all" ? (tierFilter === t ? "var(--color-ink)" : "var(--color-ink-muted)") : TIER_COLORS[t] }}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
        <select
          value={muscleFilter}
          onChange={(e) => setMuscleFilter(e.target.value)}
          className="mt-2 w-full rounded-lg border px-3 py-2 text-xs outline-none"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        >
          <option value="all">All muscles</option>
          {MUSCLES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>

        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {filtered.map((x) => (
            <div key={x.slug} role="button" tabIndex={0} onClick={() => setView(x)} onKeyDown={(e) => e.key === "Enter" && setView(x)}
              className="cursor-pointer rounded-lg border p-2 transition-colors hover:bg-[var(--color-paper-2)]" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="flex items-center gap-2.5">
                <ExerciseMedia
                  slug={x.slug} pattern={x.pattern}
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--color-paper-2)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{x.name}</span>
                    {x.tier && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold" style={{ backgroundColor: TIER_COLORS[x.tier], color: "#fff" }}>
                        {x.tier}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{x.cue}</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); addExercise(x); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                  aria-label={`Add ${x.name}`}>
                  +
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>No exercises match.</p>
          )}
        </div>

        <button type="button" onClick={saveDay}
          disabled={!dayName.trim()}
          className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
          {editId ? "Save workout" : "Create workout"}
        </button>
        {msg && <p className="mt-2 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>{msg}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Workout</h1>
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        Pick a split or build each day — the tier list is baked in.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(SPLIT_TEMPLATES).map(([key, t]) => (
          <button key={key} type="button" onClick={() => void applyTemplate(key)}
            className="rounded-xl border px-3 py-3 text-left text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {days.map((d) => (
          <button key={d.id} type="button" onClick={() => openProfile(d)}
            className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" }}>
            <div className="min-w-0">
              <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{d.name}</span>
              <span className="ml-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{d.exercises.length} exercises</span>
              {/* Hevy-style sets-per-muscle mini bars */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {(() => {
                  const counts = new Map<string, number>();
                  for (const x of d.exercises || []) {
                    const m = EXERCISES.find((e) => e.slug === x.slug)?.muscle;
                    if (m) counts.set(m, (counts.get(m) || 0) + (x.sets || 3));
                  }
                  const max = Math.max(...counts.values(), 1);
                  return [...counts.entries()].slice(0, 5).map(([m, n]) => (
                    <span key={m} className="flex items-center gap-1">
                      <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}>{m.replace(/_/g, " ")}</span>
                      <span className="h-1 rounded-full" style={{ width: 6 + 22 * (n / max), backgroundColor: "var(--color-accent)" }} />
                    </span>
                  ));
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); void deleteDay(d.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void deleteDay(d.id); } }}
                className="text-xs" style={{ color: "var(--color-error)" }}>✕</span>
              <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Edit</span>
            </div>
          </button>
        ))}
        <button type="button" onClick={() => openProfile()}
          className="w-full rounded-xl border border-dashed px-4 py-3 text-sm font-medium"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          + New workout profile
        </button>
      </div>

      {progress.length > 0 && (
        <button type="button" onClick={() => setShowProgress((v) => !v)}
          className="mt-4 w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
          {showProgress ? "Hide" : "Show"} progress — {progress.length} exercises tracked
        </button>
      )}

      {showProgress && muscles.length > 0 && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
            This week — effective sets per muscle
          </p>
          <div className="mt-2 space-y-1.5">
            {muscles.filter((m) => m.effSetsWeek > 0).map((m) => {
              const [lo, hi] = m.landmark;
              const pct = Math.min(m.effSetsWeek / (hi * 1.4), 1) * 100;
              const color = m.status === "over" ? "var(--color-error)" : m.status === "growing" ? "var(--color-success)" : m.status === "maintaining" ? "var(--color-accent)" : "var(--color-warmth)";
              return (
                <div key={m.muscle} className="flex items-center gap-2">
                  <span className="w-20 truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{m.muscle.replace(/_/g, " ")}</span>
                  <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="w-14 text-right text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {m.effSetsWeek}/{lo}–{hi} {m.slopePct > 0.3 ? `+${m.slopePct}%` : m.slopePct < -0.3 ? `${m.slopePct}%` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showProgress && (
        <div className="mt-3 space-y-2">
          {progress.map((p) => {
            const ex = EXERCISES.find((e) => e.slug === p.slug);
            if (!ex || !p.last) return null;
            const isLower = ["quads", "hamstrings", "glutes", "gastroc", "soleus", "glute_med", "erectors"].includes(ex.muscle);
            const inc = isLower ? 5 : 2.5;
            const daysSince = (now - new Date(p.last.at).getTime()) / 86400000;
            // Alpha-Progression-lite: top-of-range + low RIR → add increment;
            // 2+ weeks off → hold weight (detrain caution); weak session → -5%.
            let suggest = p.last.w;
            if (p.last.r >= 12 && (p.last.rir === null || p.last.rir <= 1)) suggest = p.last.w + inc;
            else if (p.last.r <= 6) suggest = Math.round(p.last.w * 0.95 * 2) / 2;
            if (daysSince > 14) suggest = p.last.w;
            const target = targets[p.slug] ?? String(Math.round(suggest * 2) / 2);
            const max = Math.max(...p.points.map((pt) => pt.e1));
            const min = Math.min(...p.points.map((pt) => pt.e1));
            return (
              <div key={p.slug} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{ex.name}</span>
                  <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    e1RM {Math.round(p.points[p.points.length - 1]?.e1 || 0)}kg
                  </span>
                </div>
                {/* sparkline */}
                <svg viewBox="0 0 100 18" className="mt-2 h-5 w-full" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={p.points.map((pt, i) => `${(i / Math.max(p.points.length - 1, 1)) * 100},${16 - ((pt.e1 - min) / Math.max(max - min, 1)) * 14}`).join(" ")}
                    fill="none" stroke="var(--color-accent)" strokeWidth="1.5"
                  />
                </svg>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    {daysSince > 14 ? `${Math.floor(daysSince)}d off — hold` : `last ${p.last.w}×${p.last.r}${p.last.rir !== null ? ` RIR${p.last.rir}` : ""}`}
                  </span>
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    try
                    <input
                      value={target}
                      onChange={(e) => setTargets((t) => ({ ...t, [p.slug]: e.target.value }))}
                      className="w-12 rounded border px-1 py-0.5 text-center text-[10px]"
                      style={{ borderColor: "var(--color-warmth)", color: "var(--color-ink)" }}
                    />
                    kg
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <button type="button" onClick={() => setShowHistory((v) => !v)}
          className="mt-3 w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
          {showHistory ? "Hide" : "Show"} history — {history.length} sessions
        </button>
      )}
      {showHistory && (
        <div className="mt-2 space-y-1.5">
          {history.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--color-paper-3)" }}>
              <span className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{s.dayName}</span>
              <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                {new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" · "}
                {Math.round((new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000)}m
              </span>
            </div>
          ))}
        </div>
      )}

      {days.length === 0 && (
        <p className="mt-6 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
          No workouts yet — pick a template or build a profile from scratch.
        </p>
      )}
      {msg && <p className="mt-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>{msg}</p>}

      {/* Exercise detail overlay — GIF closeup, science, citation */}
      {view && (() => {
        const sci = SCIENCE[view.slug];
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setView(null)}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5"
              style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{view.name}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    {view.tier && <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: TIER_COLORS[view.tier], color: "#fff" }}>{view.tier}-tier</span>}
                    <span className="text-[10px] capitalize" style={{ color: "var(--color-ink-muted)" }}>{view.muscle.replace(/_/g, " ")} · {view.equip}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setView(null)} className="text-lg" style={{ color: "var(--color-ink-muted)" }}>✕</button>
              </div>
              <ExerciseMedia slug={view.slug} pattern={view.pattern}
                className="mt-4 aspect-square w-full rounded-xl"
                style={{ backgroundColor: "var(--color-paper-2)" }} />
              <p className="mt-4 text-sm font-medium" style={{ color: "var(--color-ink)" }}>{view.cue}</p>
              {sci && (
                <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>The science</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>{sci.science}</p>
                  <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{sci.source}</p>
                </div>
              )}
              <button type="button" onClick={() => { addExercise(view); setView(null); }}
                className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
                Add to workout
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
