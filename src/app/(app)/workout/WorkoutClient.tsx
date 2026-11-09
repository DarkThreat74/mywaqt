"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EXERCISES, MUSCLE_GROUP, GROUPS, DAY_TEMPLATES, exerciseName, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";
import { getOfflineDB } from "@/lib/offline/db";
import { syncPendingWorkouts } from "@/lib/workout/sync";
import { recommendLoadKg } from "@/lib/workout/recommend";

interface DayExercise { slug: string; name: string; sets: number; reps: string; supersetGroup?: number | null; }
interface WDay { id: string; weekday: number | null; name: string; exercises: DayExercise[]; }

const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

export default function WorkoutClient() {
  const [days, setDays] = useState<WDay[]>([]);
  const [step, setStep] = useState<number | null>(null); // 0=type, 1=name, 2=exercises
  const [view, setView] = useState<Exercise | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState<Array<{ slug: string; points: { at: string; e1: number }[]; last: { w: number; r: number; rir: number | null; at: string } | null; sets: number; bestE1?: number; firstE1?: number | null; lastE1?: number | null; gainPct?: number | null; carryoverKg?: number; carryoverFrom?: string; familyVariations?: number; familyBestE1?: number;
    daysSince?: number | null; retained?: number; recommendedKg?: number | null; recommendationReason?: string | null; averageRir?: number | null; averageReps?: number | null; predictionConfidence?: number; uncertaintyRangeKg?: [number, number]; recommendationEvidence?: string; rirReliability?: number; plateau?: boolean;
    limbs?: Record<string, { bestE1?: number; lastE1?: number; gainPct?: number | null }>;
    variations?: Array<{ key: string; sets: number; bestE1: number; lastE1: number }>;
    growthForecast?: { status: string; monthlyE1rmChangePct: number | null; confidence: number } }>>([]);
  const [tonnage, setTonnage] = useState(0);
  const [tonWeek, setTonWeek] = useState(0);
  const [tonPrevWeek, setTonPrevWeek] = useState(0);
  const [volumeSpike, setVolumeSpike] = useState(false);
  const [bodyWeight, setBodyWeight] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [units, setUnits] = useState<"kg" | "lb">("kg");
  // Weights are stored in kg — convert for display when the user prefers lb.
  const dispW = (kg: number) => (units === "lb" ? Math.round(kg * 2.205) : Math.round(kg * 10) / 10);
  const dispTon = (kg: number) => (units === "lb" ? `${(kg * 2.205 / 1000).toFixed(1)}k lb` : `${(kg / 1000).toFixed(1)}t`);
  const confidenceLabel = (value?: number) => value == null ? null : value >= 0.75 ? "high confidence" : value >= 0.5 ? "medium confidence" : "early estimate";
  const evidenceLabel = (value?: string) => value === "3 similar exposures" ? "3 similar workouts" : value === "recent performance rising" ? "recent workouts improving" : value === "Needs more exposures" ? "needs more workouts" : value;
  const rirLabel = (rir: number | null) => rir == null ? null : rir === 0 ? "to failure" : `${rir} ${rir === 1 ? "rep" : "reps"} left`;
  const actionLabel = (reason?: string | null) => {
    if (!reason) return "repeat the movement to collect more data";
    if (reason.includes("hold and change")) return "change the rep range or variation";
    if (reason.includes("hold-high-rir")) return "keep this weight and work closer to your target reps";
    if (reason.includes("late-fatigue")) return "keep this weight — you were already fatigued";
    if (reason.includes("small-progress")) return "a small increase looks reasonable";
    return "repeat this weight and record your reps";
  };

  const [actionDay, setActionDay] = useState<WDay | null>(null);
  const router = useRouter();
  const [muscles, setMuscles] = useState<Array<{ muscle: string; effSetsWeek: number; directSetsWeek?: number; indirectSetsWeek?: number; landmark: [number, number]; slopePct: number; status: string; freshness: number; advice?: string | null }>>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<Array<{
    id: string; dayId?: string; dayName: string; startedAt: string; endedAt: string | null; syncPending?: boolean; syncError?: string | null;
    completedExercises?: Array<{ slug: string; setCount: number; recommendedWeightKg: number; pr?: boolean }>;
  }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dayName, setDayName] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [headFilter, setHeadFilter] = useState<string>("all");
  const [muscleOpen, setMuscleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DayExercise[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);

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
      setVolumeSpike(!!data.volumeSpike);
      const prefs = await fetch("/api/settings/prefs").catch(() => null);
      if (prefs?.ok) {
        const { prefs: p } = await prefs.json();
        const uw = p?.unitWeight === "lb" ? "lb" : "kg";
        setUnits(uw);
        if (p?.bodyWeightKg) setBodyWeight(String(uw === "lb" ? Math.round(p.bodyWeightKg * 2.205) : p.bodyWeightKg));
        if (p?.heightCm) setHeightCm(String(p.heightCm));
        if (!p?.bodyWeightKg || !p?.heightCm) router.push("/workout/profile");
      }
    }
    // Push any pending offline drafts first so the server answer is current.
    await syncPendingWorkouts();
    const hr = await fetch("/api/workout/sessions", { cache: "no-store" }).catch(() => null);
    let serverHistory: typeof history = [];
    if (hr?.ok) {
      const data = await hr.json();
      serverHistory = data.sessions || [];
    }
    // Merge locally-held sessions: offline-finished workouts appear
    // immediately, marked unsynced until the sweep confirms them.
    try {
      const db = getOfflineDB();
      const [localSessions, localSets] = await Promise.all([
        db.workoutSessions.toArray(),
        db.workoutSets.toArray(),
      ]);
      const serverIds = new Set(serverHistory.map((s) => s.id));
      const localEntries = localSessions
        .filter((s) => !serverIds.has(s.id))
        .map((s) => {
          const bySlug = new Map<string, { setCount: number; recommendedWeightKg: number }>();
          for (const set of localSets.filter((x) => x.sessionId === s.id && x.done)) {
            const weight = parseFloat(set.weight || "");
            if (!(weight > 0) || !(set.reps && set.reps > 0)) continue;
            const prev = bySlug.get(set.slug) || { setCount: 0, recommendedWeightKg: 0 };
            prev.setCount += 1;
            prev.recommendedWeightKg = Math.max(prev.recommendedWeightKg, recommendLoadKg(weight, set.rir ?? null).kg);
            bySlug.set(set.slug, prev);
          }
          return {
            id: s.id,
            dayId: s.dayId ?? undefined,
            dayName: s.dayName,
            startedAt: s.startedAt,
            endedAt: s.endedAt ?? null,
            syncPending: s.syncState !== "synced",
            syncError: s.syncError ?? null,
            completedExercises: [...bySlug].map(([slug, v]) => ({
              slug, setCount: v.setCount,
              recommendedWeightKg: Math.round(v.recommendedWeightKg * 10) / 10,
            })),
          };
        });
      setHistory([...serverHistory, ...localEntries]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 10));
    } catch {
      setHistory(serverHistory.slice(0, 10));
    }
  }
  useEffect(() => { Promise.resolve().then(() => { void load(); setNow(Date.now()); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only

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


  const deleteSession = async (id: string) => {
    await fetch(`/api/workout/sessions?id=${id}`, { method: "DELETE" }).catch(() => {});
    try {
      const db = getOfflineDB();
      await db.workoutSessions.delete(id);
      await db.workoutSets.where("sessionId").equals(id).delete();
    } catch { /* noop */ }
    setConfirmDelete(null);
    setHistory((h) => h.filter((x) => x.id !== id));
  };

  const syncNow = async () => {
    setSyncingNow(true);
    await syncPendingWorkouts();
    await load();
    setSyncingNow(false);
  };

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



  const addExercise = (x: Exercise) => {
    if (picked.some((p) => p.slug === x.slug)) return;
    setPicked((p) => [...p, { slug: x.slug, name: x.name, sets: 1, reps: "8-12", supersetGroup: null }]);
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
                <span className="flex flex-col" style={{ color: "var(--color-ink-muted)" }}>
                  <button type="button" disabled={i === 0} aria-label={`Move ${p.name} up`}
                    onClick={() => setPicked((prev) => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}
                    className="text-[10px] leading-none disabled:opacity-30">▲</button>
                  <button type="button" disabled={i === picked.length - 1} aria-label={`Move ${p.name} down`}
                    onClick={() => setPicked((prev) => { const n = [...prev]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; })}
                    className="text-[10px] leading-none disabled:opacity-30">▼</button>
                </span>
                {i > 0 && (
                  <button type="button" onClick={() => toggleLink(i)} title={p.supersetGroup != null ? "Unlink superset" : "Superset with exercise above"}
                    className="text-xs" style={{ color: p.supersetGroup != null ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                    {p.supersetGroup != null ? "⛓" : "○"}
                  </button>
                )}
                <span className="flex-1 text-sm font-medium" style={{ color: "var(--color-ink)" }}>{p.name}</span>
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
          <Link href="/workout/library" className="rounded-full border px-3 py-1 text-[10px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>Library</Link>
          <Link href="/workout/profile" className="rounded-full border px-3 py-1 text-[10px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>Profile</Link>
        </div>
      </div>





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
            <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>›</span>
          </button>
        ))}
        <button type="button" onClick={() => openProfile()}
          className="mx-auto mt-1 block px-3 py-1.5 text-[11px]"
          style={{ color: "var(--color-ink-muted)" }}>
          + New workout profile
        </button>
      </div>

      {volumeSpike && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>
          Volume spiked &gt;30% over last week — injury-risk territory. Consider holding this week&apos;s load.
        </div>
      )}
      {progress.length > 0 && (
        <div className="mt-4 flex rounded-xl border p-1" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
          {(["progress", "history"] as const).map((tab) => {
            const active = tab === "progress" ? showProgress : showHistory;
            const label = tab === "progress" ? `Progress${progress.length ? ` · ${progress.length}` : ""}` : `History${history.length ? ` · ${history.length}` : ""}`;
            return (
              <button key={tab} type="button"
                onClick={() => {
                  if (tab === "progress") { setShowProgress((v) => !v); setShowHistory(false); }
                  else { setShowHistory((v) => !v); setShowProgress(false); }
                }}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: active ? "var(--color-ink)" : "transparent",
                  color: active ? "var(--color-paper)" : "var(--color-ink-muted)",
                }}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {showProgress && (
        <div className="mt-3 space-y-3">
          {(() => {
            const under = muscles.filter((m) => m.status === "under" || m.status === "low");
            const over = muscles.filter((m) => m.status === "over");
            const next = under[0] || muscles.find((m) => m.advice) || null;
            return (
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, var(--color-paper))" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>At a glance</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p style={{ color: "var(--color-ink-muted)" }}>Exercises tracked</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>{progress.length}</p>
                  </div>
                  <div>
                    <p style={{ color: "var(--color-ink-muted)" }}>Muscles needing attention</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: over.length ? "var(--color-error)" : under.length ? "var(--color-warmth)" : "var(--color-success)" }}>{under.length + over.length}</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {next ? `Next focus: ${next.muscle.replace(/_/g, " ")} — ${next.advice || "keep building"}`
                    : over.length ? "Volume is high across some muscles — consider an easier week."
                    : "Your current workload looks balanced."}
                </p>
              </div>
            );
          })()}
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Your stats</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              weight
              <input value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)}
                onBlur={() => { const v = parseFloat(bodyWeight); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodyWeightKg: units === "lb" ? Math.round(v / 2.205 * 10) / 10 : v, weightUpdatedAt: new Date().toISOString() }) }).catch(() => {}); }}
                placeholder={units} className="w-14 rounded border px-1.5 py-1 text-[10px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              {units}
            </label>
            <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              height
              <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
                onBlur={() => { const v = parseFloat(heightCm); if (v > 0) void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heightCm: v }) }).catch(() => {}); }}
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
                  {tonnage > 0 && <span>volume <b style={{ color: "var(--color-ink)" }}>{dispTon(tonnage)}</b></span>}
                  {tonWeek > 0 && (
                    <span>this week <b style={{ color: weekDelta !== null && weekDelta < 0 ? "var(--color-error)" : "var(--color-success)" }}>{dispTon(tonWeek)}{weekDelta !== null ? ` (${weekDelta > 0 ? "+" : ""}${weekDelta}%)` : ""}</b></span>
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
        </div>
      )}

      {showProgress && muscles.length > 0 && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
            Muscle workload this week
          </p>
          <p className="mt-1 text-[9px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Each row answers: how much work did this muscle get, and is it rested? <b>9/10–20</b> means 9 hard sets done, with 10–20 as a starting target. Direct = the main target; indirect = it helped.
          </p>
          <div className="mt-2 space-y-1.5">
            {muscles.filter((m) => m.effSetsWeek > 0).map((m) => {
              const color = m.status === "over" ? "var(--color-error)" : m.status === "growing" ? "var(--color-success)" : m.status === "maintaining" ? "var(--color-accent)" : "var(--color-warmth)";
              return (
                <div key={m.muscle} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-[10px] capitalize" style={{ color: "var(--color-ink)" }}>{m.muscle.replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-right text-[9px]" style={{ color: color }}>
                    {m.effSetsWeek} effective sets
                  </span>
                  <p className="col-span-2 min-w-0 text-[9px] tabular-nums" title="Recovered — enough rest to train again"
                    style={{ color: m.freshness >= 90 ? "var(--color-success)" : m.freshness >= 50 ? "var(--color-warmth)" : "var(--color-error)" }}>
                    {m.freshness}% recovered
                  </p>
                  {m.advice && (
                    <p className="col-span-2 min-w-0 text-[9px]" style={{ color: "var(--color-accent)" }}>{m.advice}</p>
                  )}
                  <p className="col-span-2 min-w-0 text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                    {m.directSetsWeek ?? m.effSetsWeek} main-target sets
                    {(m.indirectSetsWeek ?? 0) > 0 ? ` · ${(m.indirectSetsWeek ?? 0).toFixed(1)} helper estimate` : ""}
                  </p>
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
            // The server's recommendation already accounts for RIR, exercise
            // position/fatigue, and recency — don't re-derive it here.
            const suggest = p.recommendedKg ?? p.last.w;
            const target = targets[p.slug] ?? String(dispW(suggest));
            const daysSince = p.daysSince ?? ((now - new Date(p.last.at).getTime()) / 86400000);
            const max = Math.max(...p.points.map((pt) => pt.e1));
            const min = Math.min(...p.points.map((pt) => pt.e1));
            const e1 = Math.round(p.points[p.points.length - 1]?.e1 || 0);
            const limbs = p.limbs || {};
            const limbPairs = (["left", "right"] as const).filter((h) => limbs[h]?.lastE1);
            const forecast = p.growthForecast;
            return (
              <div key={p.slug} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{ex.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
                    {p.gainPct != null && (
                      <span style={{ color: p.gainPct >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
                        {p.gainPct >= 0 ? "▲" : "▼"}{Math.abs(p.gainPct)}%
                      </span>
                    )}
                    <span title="A training estimate from your recent logged sets; it is not a tested one-rep maximum." style={{ color: "var(--color-ink-muted)" }}>
                      estimated max {dispW(e1)}{units}{(p.familyVariations || 0) > 1 ? ` · ${p.familyVariations} variations` : ""}
                    </span>
                  </span>
                </div>
                {p.carryoverKg != null && p.carryoverFrom && (
                  <p className="mt-0.5 text-[9px]" style={{ color: "var(--color-accent)" }}>
                    New variation — family history suggests ~{dispW(p.carryoverKg)}{units} from {exerciseName(p.carryoverFrom)}
                  </p>
                )}
                {(p.predictionConfidence != null || p.plateau) && (
                  <p className="mt-1 text-[9px]" style={{ color: p.plateau ? "var(--color-warmth)" : "var(--color-ink-muted)" }}>
                    {p.plateau ? "Same result for 3 workouts · " : ""}
                    {confidenceLabel(p.predictionConfidence) || ""}
                    {p.uncertaintyRangeKg ? ` · range ${dispW(p.uncertaintyRangeKg[0])}–${dispW(p.uncertaintyRangeKg[1])}${units}` : ""}
                    {evidenceLabel(p.recommendationEvidence) ? ` · ${evidenceLabel(p.recommendationEvidence)}` : ""}
                  </p>
                )}
                <svg viewBox="0 0 100 18" className="mt-2 h-5 w-full" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={p.points.map((pt, i) => `${(i / Math.max(p.points.length - 1, 1)) * 100},${16 - ((pt.e1 - min) / Math.max(max - min, 1)) * 14}`).join(" ")}
                    fill="none" stroke="var(--color-accent)" strokeWidth="1.5"
                  />
                </svg>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  <span>
                    {dispW(p.last.w)}{units} × {p.last.r}{p.last.rir != null ? ` · ${rirLabel(p.last.rir)}` : ""}
                    {daysSince >= 1 ? ` · ${Math.floor(daysSince)}d ago` : ""}
                    {daysSince > 14 ? " — detraining, hold" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    next session
                    <input
                      value={target}
                      onChange={(e) => setTargets((t) => ({ ...t, [p.slug]: e.target.value }))}
                      className="w-12 rounded border px-1 py-0.5 text-center text-[10px]"
                      style={{ borderColor: "var(--color-warmth)", color: "var(--color-ink)" }}
                    />
                    {units}
                  </span>
                </div>
                <p className="mt-1 text-[9px]" style={{ color: "var(--color-accent)" }}>
                  {actionLabel(p.recommendationReason)}
                </p>
                {(p.variations || []).length > 1 && (
                  <p className="mt-1 text-[9px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                    {p.variations!.length} variations tracked · best {dispW(Math.max(...p.variations!.map((v) => v.bestE1)))}{units}
                  </p>
                )}
                {(limbPairs.length > 0 || (forecast && forecast.status === "forecast")) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t pt-1.5 text-[9px]"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                    {limbPairs.map((h) => (
                      <span key={h}>{h === "left" ? "L" : "R"} {dispW(limbs[h]?.lastE1 ?? 0)}{units}
                        {limbs[h]?.gainPct != null ? ` (${limbs[h]!.gainPct! >= 0 ? "+" : ""}${limbs[h]!.gainPct}%)` : ""}
                      </span>
                    ))}
                    {forecast?.status === "forecast" && forecast.monthlyE1rmChangePct != null && (
                      <span style={{ color: "var(--color-success)" }}>
                        {forecast.monthlyE1rmChangePct >= 0 ? "+" : ""}{forecast.monthlyE1rmChangePct}% per month trend · {confidenceLabel(forecast.confidence)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && !progress.length && (
        <button type="button" onClick={() => setShowHistory((v) => !v)}
          className="mt-3 w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
          {showHistory ? "Hide" : "Show"} history{history.length ? ` — ${history.length} sessions` : ""}
        </button>
      )}
      {history.some((x) => x.syncPending) && (
        <button type="button" onClick={() => void syncNow()} disabled={syncingNow}
          className="mt-1.5 w-full rounded-lg border border-dashed px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
          {syncingNow
            ? "Syncing offline workouts…"
            : `${history.filter((x) => x.syncPending).length} saved on this device — tap to sync now`}
        </button>
      )}
      {showHistory && (
        <div className="mt-2 space-y-1.5">
          {history.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              No sessions yet — finish your first workout and it lands here.
            </p>
          )}
          {history.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: s.endedAt ? "var(--color-paper-3)" : "var(--color-accent)" }}>
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{s.dayName}</p>
                <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {s.completedExercises?.length
                    ? s.completedExercises.map((x) => {
                      const name = EXERCISES.find((e) => e.slug === x.slug)?.name || x.slug.replace(/-/g, " ");
                      return `${name} · ${x.setCount} ${x.setCount === 1 ? "set" : "sets"} · next ${dispW(x.recommendedWeightKg)}${units}${x.pr ? " ★PR" : ""}`;
                    }).join("  •  ")
                    : s.endedAt ? "No completed sets" : "No sets logged yet"}
                </p>
              </div>
              <span className="ml-3 flex shrink-0 items-center gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                {new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" · "}
                {s.endedAt
                  ? (() => { const m = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000); return m < 1 ? "<1m" : `${m}m`; })()
                  : "in progress"}
                {s.syncPending && (
                  <span style={{ color: "var(--color-accent, #b45309)" }}
                    title={s.syncError || "Saved on this device — syncs when back online"}>
                    · unsynced{s.syncError ? ` — ${s.syncError}` : ""}
                  </span>
                )}
                {!s.endedAt && (
                  <a href={`/workout/active?day=${s.dayId}`} style={{ color: "var(--color-accent)" }} className="font-medium">Resume →</a>
                )}
                {confirmDelete === s.id ? (
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => void deleteSession(s.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)}
                      className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" aria-label="Delete session"
                    onClick={() => setConfirmDelete(s.id)}
                    className="text-[11px]" style={{ color: "var(--color-error)" }}>✕</button>
                )}
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
          <div className="w-full max-w-xs rounded-t-2xl sm:rounded-2xl border p-4 pt-3"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <p className="mt-3 text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{actionDay.name}</p>
            <p className="mt-0.5 text-center text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{actionDay.exercises.length} exercises</p>
            <div className="mt-4 space-y-1.5">
              <Link href={`/workout/active?day=${actionDay.id}`}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
                <span>▶ Start workout</span>
                <span className="text-[10px] font-normal opacity-70">resumes if in progress</span>
              </Link>
              <button type="button" onClick={() => { const d = actionDay; setActionDay(null); openProfile(d); }}
                className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                <span>✎ Edit profile</span>
                <span className="text-[10px] font-normal" style={{ color: "var(--color-ink-muted)" }}>name & exercises</span>
              </button>
              <button type="button" onClick={async () => {
                await fetch(`/api/workout/days?id=${actionDay.id}`, { method: "DELETE" }).catch(() => {});
                setActionDay(null); await load();
              }}
                className="flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-error)", color: "var(--color-error)", opacity: 0.8 }}>
                <span>Delete profile</span>
                <span className="text-[9px] opacity-70">removes the routine</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {detailOverlay}
    </div>
  );
}
