"use client";

import { useEffect, useMemo, useState } from "react";
import { EXERCISES, MUSCLES, SPLIT_TEMPLATES, DAY_TEMPLATES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";

interface DayExercise { slug: string; name: string; sets: number; reps: string; }
interface WDay { id: string; weekday: number; name: string; exercises: DayExercise[]; }

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

export default function WorkoutClient() {
  const [days, setDays] = useState<WDay[]>([]);
  const [sel, setSel] = useState<number | null>(null);
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
  }
  useEffect(() => { Promise.resolve().then(() => void load()); }, []);

  const filtered = useMemo(() => {
    let list = EXERCISES;
    if (muscleFilter !== "all") list = list.filter((x) => x.muscle === muscleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(q) || x.cue.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.tier || "Z").localeCompare(b.tier || "Z"));
  }, [muscleFilter, search]);

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

  const openDay = (weekday: number) => {
    const existing = days.find((d) => d.weekday === weekday);
    setSel(weekday);
    setEditId(existing?.id || null);
    setDayName(existing?.name || "");
    setPicked(existing?.exercises?.map((x) => ({ slug: x.slug, name: x.name, sets: x.sets, reps: x.reps })) || []);
    setSearch(""); setMuscleFilter("all");
  };

  const saveDay = async () => {
    if (sel === null || !dayName.trim()) return;
    const res = await fetch("/api/workout/days", {
      method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, weekday: sel, name: dayName, exercises: picked }),
    });
    if (res.ok) {
      setMsg(editId ? "Updated." : "Day created.");
      setTimeout(() => setMsg(null), 2000);
      setSel(null);
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

  if (sel !== null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <button type="button" onClick={() => setSel(null)} className="mb-3 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
          ← Week
        </button>
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>
          {WEEK[sel]} — {editId ? "Edit workout" : "New workout"}
        </h1>
        {/* Day-type chips — pick a template, then edit freely */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAY_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => {
                setDayName(t.name);
                const picks = t.muscles
                  .map((m) => EXERCISES.find((x) => x.muscle === m && x.tier === "S") || EXERCISES.find((x) => x.muscle === m))
                  .filter((x): x is Exercise => !!x)
                  .map((x) => ({ slug: x.slug, name: x.name, sets: 3, reps: "8-12" }));
                setPicked(picks);
              }}
              className="rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{
                borderColor: dayName === t.name ? "var(--color-ink)" : "var(--color-paper-3)",
                backgroundColor: dayName === t.name ? "var(--color-ink)" : "var(--color-paper)",
                color: dayName === t.name ? "var(--color-paper)" : "var(--color-ink-muted)",
                minHeight: 32,
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
        <input
          value={dayName}
          onChange={(e) => setDayName(e.target.value)}
          placeholder="Or name it yourself…"
          className="mt-3 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        />

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
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" onClick={() => setMuscleFilter("all")}
            className="rounded-full border px-2.5 py-1 text-[10px]" style={{ borderColor: muscleFilter === "all" ? "var(--color-ink)" : "var(--color-paper-3)", color: muscleFilter === "all" ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
            All
          </button>
          {MUSCLES.map((m) => (
            <button key={m.key} type="button" onClick={() => setMuscleFilter(m.key)}
              className="rounded-full border px-2.5 py-1 text-[10px]" style={{ borderColor: muscleFilter === m.key ? "var(--color-ink)" : "var(--color-paper-3)", color: muscleFilter === m.key ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {filtered.map((x) => (
            <div key={x.slug} className="rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="flex items-start gap-3">
                <ExerciseMedia
                  slug={x.slug} pattern={x.pattern}
                  className="h-14 w-14 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--color-paper-2)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{x.name}</span>
                    {x.tier && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: TIER_COLORS[x.tier], color: "#fff" }}>
                        {x.tier}
                      </span>
                    )}
                    {x.compound && <span className="text-[9px]" style={{ color: "var(--color-ink-muted)" }}>compound</span>}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>{x.cue}</p>
                </div>
                <button type="button" onClick={() => addExercise(x)} className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                  Add
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
        {WEEK.map((w, i) => {
          const d = days.find((x) => x.weekday === i);
          return (
            <button key={w} type="button" onClick={() => openDay(i)}
              className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: d ? "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" : "var(--color-paper)" }}>
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{w}</span>
                {d && <span className="ml-2 text-xs" style={{ color: "var(--color-accent)" }}>{d.name}</span>}
              </div>
              <div className="flex items-center gap-2">
                {d && <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{d.exercises.length} exercises</span>}
                {d && (
                  <span role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); void deleteDay(d.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void deleteDay(d.id); } }}
                    className="text-xs" style={{ color: "var(--color-error)" }}>✕</span>
                )}
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{d ? "Edit" : "+"}</span>
              </div>
            </button>
          );
        })}
      </div>

      {days.length === 0 && (
        <p className="mt-6 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
          No workout days yet — pick a template or tap a weekday to build one.
        </p>
      )}
      {msg && <p className="mt-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>{msg}</p>}
    </div>
  );
}
