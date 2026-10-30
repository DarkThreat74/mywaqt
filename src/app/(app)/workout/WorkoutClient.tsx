"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EXERCISES, MUSCLE_GROUP, GROUPS, DAY_TEMPLATES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";

interface DayExercise { slug: string; name: string; sets: number; reps: string; supersetGroup?: number | null; }
interface WDay { id: string; weekday: number | null; name: string; exercises: DayExercise[]; }

const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

export default function WorkoutClient() {
  const [days, setDays] = useState<WDay[]>([]);
  const [step, setStep] = useState<number | null>(null); // 0=type, 1=name, 2=exercises
  const [view, setView] = useState<Exercise | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState<Array<{ slug: string; points: { at: string; e1: number }[]; last: { w: number; r: number; rir: number | null; at: string } | null; sets: number; bestE1?: number; firstE1?: number | null; lastE1?: number | null; gainPct?: number | null }>>([]);
  const [tonnage, setTonnage] = useState(0);
  const [tonWeek, setTonWeek] = useState(0);
  const [tonPrevWeek, setTonPrevWeek] = useState(0);
  const [bodyWeight, setBodyWeight] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [panel, setPanel] = useState<"none" | "library" | "profile">("none");
  const [weightStale, setWeightStale] = useState(false);
  const [actionDay, setActionDay] = useState<WDay | null>(null);
  const [muscles, setMuscles] = useState<Array<{ muscle: string; effSetsWeek: number; landmark: [number, number]; slopePct: number; status: string; freshness: number }>>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<Array<{ id: string; dayName: string; startedAt: string; endedAt: string | null }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dayName, setDayName] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [headFilter, setHeadFilter] = useState<string>("all");
  const [muscleOpen, setMuscleOpen] = useState(false);
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
      setTonnage(data.totalTonnage || 0);
      setTonWeek(data.tonWeek || 0);
      setTonPrevWeek(data.tonPrevWeek || 0);
      const prefs = await fetch("/api/settings/prefs").catch(() => null);
      if (prefs?.ok) {
        const { prefs: p } = await prefs.json();
        if (p?.bodyWeightKg) setBodyWeight(String(p.bodyWeightKg));
        if (p?.heightCm) setHeightCm(String(p.heightCm));
        // Weekly weight check-in — weights drift; heights don't.
        if (!p?.bodyWeightKg || !p?.heightCm) setPanel("profile");
        const wAt = p?.weightUpdatedAt ? new Date(p.weightUpdatedAt).getTime() : 0;
        if (p?.bodyWeightKg && Date.now() - wAt > 7 * 86400000) setWeightStale(true);
      }
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
    if (groupFilter !== "all") {
      list = list.filter((x) => MUSCLE_GROUP[x.muscle] === groupFilter);
      // heads that equal a muscle key (lats, erectors…) match via muscle;
      // sub-heads (long_head…) match via head tag. Fallback covers both.
      if (headFilter !== "all") list = list.filter((x) => (x.head ?? x.muscle) === headFilter);
    }
    if (tierFilter !== "all") list = list.filter((x) => x.tier === tierFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => x.name.toLowerCase().includes(q) || x.cue.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.tier || "Z").localeCompare(b.tier || "Z"));
  }, [groupFilter, headFilter, search, tierFilter]);


  const openProfile = (d?: WDay) => {
    setStep(d ? 2 : 0);
    setEditId(d?.id || null);
    setDayName(d?.name || "");
    setPicked(d?.exercises?.map((x) => ({ slug: x.slug, name: x.name, sets: x.sets, reps: x.reps, supersetGroup: x.supersetGroup ?? null })) || []);
    setSearch(""); setGroupFilter("all"); setHeadFilter("all"); setTierFilter("all");
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
    setPicked((p) => [...p, { slug: x.slug, name: x.name, sets: 3, reps: "8-12", supersetGroup: null }]);
  };

  // Superset link — groups this exercise with the one above it
  const toggleLink = (i: number) => {
    setPicked((p) => p.map((q, j) => {
      if (j === i) {
        const linked = q.supersetGroup != null;
        return { ...q, supersetGroup: linked ? null : (p[i - 1]?.supersetGroup ?? i - 1) };
      }
      return q;
    }));
  };

  const detailOverlay = view ? (() => {
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
          {view.howto && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>How to do it</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>{view.howto}</p>
            </div>
          )}
          {(view.pros || view.cons) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {view.pros && (
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-success)", backgroundColor: "color-mix(in oklab, var(--color-success) 5%, var(--color-paper))" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-success)" }}>Why it&rsquo;s good</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>{view.pros}</p>
                </div>
              )}
              {view.cons && (
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-warmth)", backgroundColor: "color-mix(in oklab, var(--color-warmth) 5%, var(--color-paper))" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-warmth)" }}>Where it falls short</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink)" }}>{view.cons}</p>
                </div>
              )}
            </div>
          )}
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
  })() : null;

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
        {detailOverlay}
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
        {detailOverlay}
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
              <div key={p.slug} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: p.supersetGroup != null ? "var(--color-accent)" : "var(--color-paper-3)" }}>
                {i > 0 && (
                  <button type="button" onClick={() => toggleLink(i)} title={p.supersetGroup != null ? "Unlink superset" : "Superset with exercise above"}
                    className="text-xs" style={{ color: p.supersetGroup != null ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                    {p.supersetGroup != null ? "⛓" : "○"}
                  </button>
                )}
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
        <div className="relative mt-2">
          <button type="button" onClick={() => setMuscleOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}>
            <span>{groupFilter === "all" ? "All muscles" : GROUPS.find((g) => g.key === groupFilter)?.label}</span>
            <span style={{ color: "var(--color-ink-muted)", transform: muscleOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
          </button>
          {muscleOpen && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              {[{ key: "all", label: "All muscles" }, ...GROUPS].map((g) => (
                <button key={g.key} type="button"
                  onClick={() => { setGroupFilter(g.key); setHeadFilter("all"); setMuscleOpen(false); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: groupFilter === g.key ? "var(--color-accent)" : "var(--color-ink)" }}>
                  {g.label}
                  {groupFilter === g.key && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {groupFilter !== "all" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {[{ key: "all", label: "All heads" }, ...(GROUPS.find((g) => g.key === groupFilter)?.heads || [])].map((h) => (
              <button key={h.key} type="button" onClick={() => setHeadFilter(h.key)}
                className="rounded-full border px-2.5 py-1 text-[10px]"
                style={{ borderColor: headFilter === h.key ? "var(--color-ink)" : "var(--color-paper-3)", color: headFilter === h.key ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
                {h.label}
              </button>
            ))}
          </div>
        )}

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
        {detailOverlay}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Workout</h1>
        <div className="flex gap-1.5">
          {(["library", "profile"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPanel(panel === p ? "none" : p)}
              className="rounded-full border px-3 py-1 text-[10px] font-medium capitalize"
              style={{ borderColor: panel === p ? "var(--color-ink)" : "var(--color-paper-3)", color: panel === p ? "var(--color-ink)" : "var(--color-ink-muted)" }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {weightStale && (
        <button type="button" onClick={() => { setPanel("profile"); setWeightStale(false); }}
          className="mt-2 w-full rounded-lg border px-3 py-2 text-left text-[11px]"
          style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>
          Weekly check-in — update your weight for accurate strength ratios →
        </button>
      )}

      {panel === "profile" && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
            {!bodyWeight ? "Set up your profile" : "Profile"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              weight
              <input value={bodyWeight} onChange={(e) => { setBodyWeight(e.target.value); const v = parseFloat(e.target.value); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodyWeightKg: v, weightUpdatedAt: new Date().toISOString() }) }).catch(() => {}); }}
                placeholder="kg" className="w-16 rounded border px-2 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              kg
            </label>
            <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              height
              <input value={heightCm} onChange={(e) => { setHeightCm(e.target.value); const v = parseFloat(e.target.value); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heightCm: v }) }).catch(() => {}); }}
                placeholder="cm" className="w-16 rounded border px-2 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              cm
            </label>
          </div>
          <p className="mt-2 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
            Weight updates weekly — it drifts. Height is set once.
          </p>
        </div>
      )}

      {panel === "library" && (() => {
        const libFiltered = EXERCISES.filter((x) => {
          if (groupFilter !== "all") {
            if (MUSCLE_GROUP[x.muscle] !== groupFilter) return false;
            if (headFilter !== "all" && (x.head ?? x.muscle) !== headFilter) return false;
          }
          if (tierFilter !== "all") return x.tier === tierFilter;
          if (search) return x.name.toLowerCase().includes(search.toLowerCase());
          return true;
        });
        return (
          <div className="mt-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search 367 exercises…"
              className="w-full rounded-lg border px-3 py-2 text-xs outline-none"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
            <div className="mt-2 max-h-[60vh] space-y-1.5 overflow-y-auto">
              {libFiltered.map((x) => (
                <button key={x.slug} type="button" onClick={() => setView(x)}
                  className="flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)" }}>
                  <ExerciseMedia slug={x.slug} pattern={x.pattern}
                    className="h-9 w-9 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: "var(--color-paper-2)" }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: "var(--color-ink)" }}>{x.name}</span>
                  {x.tier && <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: TIER_COLORS[x.tier], color: "#fff" }}>{x.tier}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}


      <div className="mt-6 space-y-2">
        {days.map((d) => (
          <button key={d.id} type="button" onClick={() => setActionDay(d)}
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

      {showProgress && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Your stats</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              weight
              <input value={bodyWeight} onChange={(e) => { setBodyWeight(e.target.value); const v = parseFloat(e.target.value); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodyWeightKg: v, weightUpdatedAt: new Date().toISOString() }) }).catch(() => {}); }}
                placeholder="kg" className="w-14 rounded border px-1.5 py-1 text-[10px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              kg
            </label>
            <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              height
              <input value={heightCm} onChange={(e) => { setHeightCm(e.target.value); const v = parseFloat(e.target.value); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heightCm: v }) }).catch(() => {}); }}
                placeholder="cm" className="w-14 rounded border px-1.5 py-1 text-[10px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              cm
            </label>
          </div>
          {(() => {
            const bw = parseFloat(bodyWeight), ht = parseFloat(heightCm);
            const bmi = bw > 0 && ht > 0 ? bw / ((ht / 100) ** 2) : null;
            // Symmetric-Strength-style categories — the best lift in each
            // family scores the category; the mean is your overall score.
            const LIFTS: [string[], string, [number, number, number]][] = [
              [["back-squat", "front-squat", "hack-squat", "low-bar-squat", "safety-bar-squat"], "squat", [1.0, 1.5, 2.0]],
              [["deadlift", "rdl", "stiff-leg-deadlift"], "pull", [1.25, 2.0, 2.5]],
              [["barbell-bench-press", "machine-chest-press", "weighted-dip", "incline-bench-30"], "press", [0.75, 1.0, 1.5]],
              [["barbell-ohp", "seated-db-press", "machine-shoulder-press", "standing-db-press"], "ohp", [0.5, 0.75, 1.0]],
              [["pull-up", "weighted-pullup", "chin-up"], "pull-up", [0.9, 1.2, 1.5]],
            ];
            const levelOf = (ratio: number, [b, i, a]: [number, number, number]) =>
              ratio >= a ? "advanced" : ratio >= i ? "intermediate" : ratio >= b ? "novice" : "beginner";
            const lifts = bw > 0 ? LIFTS.map(([slugs, name, marks]) => {
              const best = Math.max(0, ...slugs.map((s) => progress.find((p) => p.slug === s)?.bestE1 || 0));
              return best > 0 ? { name, ratio: best / bw, level: levelOf(best / bw, marks) } : null;
            }).filter(Boolean) : [];
            const gains = progress.filter((p) => p.gainPct != null && p.gainPct !== 0).sort((a, b) => (b.gainPct || 0) - (a.gainPct || 0)).slice(0, 4);
            // Overall score: mean of category ratios normalized to elite (100).
            const score = lifts.length > 0
              ? Math.round(lifts.reduce((s, l) => s + l!.ratio, 0) / (LIFTS.length * 2.2) * 100)
              : null;
            const scoreLabel = score === null ? null : score >= 90 ? "elite" : score >= 60 ? "advanced" : score >= 40 ? "intermediate" : score >= 20 ? "novice" : "beginner";
            const weekDelta = tonPrevWeek > 0 ? Math.round(((tonWeek - tonPrevWeek) / tonPrevWeek) * 100) : null;
            return (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {score !== null && (
                    <span>strength score <b style={{ color: "var(--color-ink)" }}>{score} <span style={{ color: "var(--color-accent)" }}>{scoreLabel}</span></b></span>
                  )}
                  {bmi && <span>BMI <b style={{ color: "var(--color-ink)" }}>{bmi.toFixed(1)}</b></span>}
                  {tonnage > 0 && <span>volume <b style={{ color: "var(--color-ink)" }}>{(tonnage / 1000).toFixed(1)}t</b></span>}
                  {tonWeek > 0 && (
                    <span>this week <b style={{ color: weekDelta !== null && weekDelta < 0 ? "var(--color-error)" : "var(--color-success)" }}>{(tonWeek / 1000).toFixed(1)}t{weekDelta !== null ? ` (${weekDelta > 0 ? "+" : ""}${weekDelta}%)` : ""}</b></span>
                  )}
                  {progress.length > 0 && <span>PRs <b style={{ color: "var(--color-ink)" }}>{progress.filter((p) => (p.bestE1 || 0) > 0).length}</b></span>}
                </div>
                {lifts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {lifts.map((l) => l && (
                      <div key={l.name} className="flex items-center gap-2">
                        <span className="w-14 text-[10px]" style={{ color: "var(--color-ink)" }}>{l.name}</span>
                        <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min((l.ratio / 2.5) * 100, 100)}%`, backgroundColor: l.level === "advanced" ? "var(--color-success)" : l.level === "intermediate" ? "var(--color-accent)" : "var(--color-warmth)" }} />
                        </div>
                        <span className="w-20 text-right text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                          {l.ratio.toFixed(2)}×bw · {l.level}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {gains.length > 0 && (
                  <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    biggest gains: {gains.map((g) => `${EXERCISES.find((e) => e.slug === g.slug)?.name || g.slug} ${g.gainPct! > 0 ? "+" : ""}${g.gainPct}%`).join(" · ")}
                  </p>
                )}
              </>
            );
          })()}
        </div>
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
                  <span className="w-9 text-right text-[9px] tabular-nums" title="Recovered — Fitbod-style freshness"
                    style={{ color: m.freshness >= 90 ? "var(--color-success)" : m.freshness >= 50 ? "var(--color-warmth)" : "var(--color-error)" }}>
                    {m.freshness}%
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
              <span className="flex items-center gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                {new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" · "}
                {Math.round((new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000)}m
                <button type="button" aria-label="Delete session"
                  onClick={async () => {
                    await fetch(`/api/workout/sessions?id=${s.id}`, { method: "DELETE" }).catch(() => {});
                    setHistory((h) => h.filter((x) => x.id !== s.id));
                  }}
                  className="text-[11px]" style={{ color: "var(--color-error)" }}>✕</button>
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

      {actionDay && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setActionDay(null)}>
          <div className="w-full max-w-xs rounded-t-2xl sm:rounded-2xl border p-4"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{actionDay.name}</p>
            <p className="mt-0.5 text-center text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{actionDay.exercises.length} exercises</p>
            <div className="mt-3 space-y-2">
              <Link href={`/workout/active?day=${actionDay.id}`}
                className="block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
                Start workout
              </Link>
              <button type="button" onClick={() => { const d = actionDay; setActionDay(null); openProfile(d); }}
                className="w-full rounded-xl border px-4 py-3 text-sm font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                Edit profile
              </button>
              <button type="button" onClick={async () => {
                await fetch(`/api/workout/days?id=${actionDay.id}`, { method: "DELETE" }).catch(() => {});
                setActionDay(null); await load();
              }}
                className="w-full rounded-xl border px-4 py-3 text-sm font-medium"
                style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {detailOverlay}
    </div>
  );
}
