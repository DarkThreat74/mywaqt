"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EXERCISES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";

interface DayExercise { slug: string; name: string; sets: number; reps: string; supersetGroup?: number | null; }
interface SetRow { weight: string; reps: number | null; rir?: number | null; setType?: "warmup" | "working" | "failure"; done: boolean; }
type Unit = "kg" | "lb";

const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ActiveInner() {
  const params = useSearchParams();
  const dayId = params.get("day");
  const [dayName, setDayName] = useState("");
  const [exercises, setExercises] = useState<DayExercise[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setRows, setSetRows] = useState<Record<string, SetRow[]>>({});
  const [prevSets, setPrevSets] = useState<Record<string, string[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Find today's day + exercises
      const res = await fetch("/api/workout/days").catch(() => null);
      if (!res?.ok || cancelled) return;
      const { days } = await res.json();
      const d = dayId
        ? days.find((x: { id: string }) => x.id === dayId)
        : days.find((x: { weekday: number }) => x.weekday === new Date().getDay());
      if (!d || cancelled) return;
      setDayName(d.name);
      setExercises(d.exercises || []);
      // Start/resume session
      const sres = await fetch("/api/workout/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: d.id, dayName: d.name }),
      }).catch(() => null);
      if (!sres?.ok || cancelled) return;
      const sdata = await sres.json();
      setSessionId(sdata.session.id);
      startRef.current = Date.now() - (sdata.resumed ? Date.now() - new Date(sdata.session.startedAt).getTime() : 0);
      // Hydrate logged sets (resumed sessions come back with rows)
      const rows: Record<string, SetRow[]> = {};
      for (const s of sdata.sets || []) {
        rows[s.slug] = rows[s.slug] || [];
        rows[s.slug][s.setIndex] = { weight: s.weight ?? "", reps: s.reps, done: s.done };
      }
      setSetRows(rows);
      // Previous-session pre-fill (Strong-style): last completed numbers as placeholders
      if (!sdata.resumed) {
        const pr = await fetch(`/api/workout/sessions?lastFor=${d.id}`).catch(() => null);
        if (pr?.ok && !cancelled) {
          const pdata = await pr.json();
          const prev: Record<string, string[]> = {};
          for (const s of pdata.sets || []) {
            prev[s.slug] = prev[s.slug] || [];
            if (s.weight || s.reps) prev[s.slug][s.setIndex] = `${s.weight || ""}×${s.reps ?? ""}`;
          }
          setPrevSets(prev);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dayId]);

  useEffect(() => {
    if (!sessionId) return;
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionId]);

  const rest = (secs = 90) => {
    setRestLeft(secs);
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = setInterval(() => {
      setRestLeft((r) => (r <= 1 ? (restRef.current && clearInterval(restRef.current), 0) : r - 1));
    }, 1000);
  };

  const logSet = async (slug: string, idx: number, patch: Partial<SetRow>) => {
    const prev = setRows[slug]?.[idx] || { weight: "", reps: null, done: false };
    const next = { ...prev, ...patch };
    setSetRows((m) => {
      const arr = [...(m[slug] || [])];
      arr[idx] = next;
      return { ...m, [slug]: arr };
    });
    if (sessionId) {
      await fetch("/api/workout/sets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, slug, setIndex: idx, weight: unitToKg(next.weight), reps: next.reps, rir: next.rir, setType: next.setType, done: next.done }),
      }).catch(() => {});
    }
    if (patch.done) rest();
  };

  const [units, setUnits] = useState<Unit>("kg");
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<Exercise | null>(null);
  const [openRir, setOpenRir] = useState<string | null>(null);
  const router = useRouter();

  const unitToKg = (v: string) => (units === "lb" ? String(Math.round(parseFloat(v) / 2.205 * 10) / 10) : v);
  const kgToUnit = (v: string) => (units === "lb" ? String(Math.round(parseFloat(v) * 2.205)) : v);

  const totalDone = useMemo(
    () => Object.values(setRows).flat().filter((r) => r?.done).length,
    [setRows],
  );
  const totalPlanned = exercises.reduce((s, x) => s + (setCounts[x.slug] ?? 1), 0);

  const finish = async () => {
    if (sessionId) {
      await fetch("/api/workout/sessions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, end: true }),
      }).catch(() => {});
    }
    setFinished(true);
  };

  // Cancel = delete the session entirely — no history entry, no sets saved.
  const cancel = async () => {
    if (sessionId) await fetch(`/api/workout/sessions?id=${sessionId}`, { method: "DELETE" }).catch(() => {});
    router.push("/workout");
  };

  if (!dayId && exercises.length === 0 && !dayName) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No workout planned for today.</p>
        <Link href="/workout" className="mt-4 inline-block text-sm font-medium underline" style={{ color: "var(--color-accent)" }}>
          Plan your week
        </Link>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>{dayName} — done.</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          {totalDone} sets in {fmt(elapsed)}.
        </p>
        <Link href="/workout" className="mt-6 inline-block rounded-lg px-6 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
          Back to workouts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{dayName || "Workout"}</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => {
            setUnits((u) => (u === "kg" ? "lb" : "kg"));
            setSetRows((r) => Object.fromEntries(Object.entries(r).map(([s, rows]) => [s, rows.map((row) => ({ ...row, weight: row.weight ? kgToUnit(row.weight) : row.weight }))])));
          }}
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            title="Switch units — values convert">
            {units}
          </button>
          <span className="rounded-full border px-3 py-1 text-xs tabular-nums" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
            {fmt(elapsed)}
          </span>
          <button type="button" onClick={cancel} className="rounded-full border px-2 py-1 text-[10px]"
            style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }} title="End this workout now">
            ✕
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {totalDone}/{totalPlanned} sets · {restLeft > 0 ? `rest ${fmt(restLeft)}` : "rest timer starts after a set"}
      </p>
      {restLeft > 0 && (
        <div className="mt-2 rounded-lg border px-3 py-2 text-center text-sm font-medium tabular-nums"
          style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>
          Rest: {fmt(restLeft)}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {exercises.map((x) => {
          const ex: Exercise | undefined = EXERCISES.find((e) => e.slug === x.slug);
          const rows = setRows[x.slug] || [];
          return (
            <div key={x.slug} className="rounded-xl border p-3" style={{ borderColor: x.supersetGroup != null ? "var(--color-accent)" : "var(--color-paper-3)" }}>
              {x.supersetGroup != null && (
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>superset</p>
              )}
              <div className="flex items-start gap-3">
                {ex && (
                  <button type="button" onClick={() => setView(ex)} title="How to do it" className="shrink-0">
                    <ExerciseMedia
                      slug={ex.slug} pattern={ex.pattern}
                      className="h-14 w-14 items-center justify-center rounded-lg"
                      style={{ backgroundColor: "var(--color-paper-2)" }}
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{x.name}</span>
                    {ex?.tier && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: TIER_COLORS[ex.tier], color: "#fff" }}>
                        {ex.tier}
                      </span>
                    )}
                  </div>
                  {ex && <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{ex.cue}</p>}
                  {prevSets[x.slug]?.filter(Boolean).length > 0 && (() => {
                    const parts = prevSets[x.slug].filter(Boolean);
                    const repTop = parseInt(x.reps.split("-").pop() || "12", 10);
                    const hitTop = parts.every((p) => {
                      const [w, r] = p.split("×");
                      return w && Number(r) >= repTop;
                    });
                    const lastW = parseFloat(parts[0]?.split("×")[0] || "0");
                    return (
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        last: {parts.join(" / ")}
                        {hitTop && lastW > 0 && (
                          <span style={{ color: "var(--color-warmth)" }}> · try {lastW + 2.5}kg</span>
                        )}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {Array.from({ length: setCounts[x.slug] ?? 1 }, (_, i) => {
                  const row = rows[i] || { weight: "", reps: null, done: false, setType: "working" as const };
                  const prev = prevSets[x.slug]?.[i];
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors"
                      style={{ backgroundColor: row.done ? "color-mix(in oklab, var(--color-success) 12%, transparent)" : "transparent" }}>
                      <span className="w-6 text-center text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{i + 1}</span>
                      <input
                        value={row.weight}
                        onChange={(e) => void logSet(x.slug, i, { weight: e.target.value })}
                        placeholder={prev ? prev.split("×")[0] || "kg" : "kg"}
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
                      <input
                        type="number" min={0} value={row.reps ?? ""}
                        onChange={(e) => void logSet(x.slug, i, { reps: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder={prev ? prev.split("×")[1] || x.reps : x.reps}
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const order = ["warmup", "working", "failure"] as const;
                          const next = order[(order.indexOf(row.setType || "working") + 1) % 3];
                          void logSet(x.slug, i, { setType: next });
                        }}
                        className="w-8 shrink-0 rounded border px-0 py-1.5 text-center text-[9px] font-bold"
                        title="Set type — tap to cycle"
                        style={{
                          borderColor: row.setType === "failure" ? "var(--color-error)" : row.setType === "warmup" ? "var(--color-warmth)" : "var(--color-paper-3)",
                          color: row.setType === "failure" ? "var(--color-error)" : row.setType === "warmup" ? "var(--color-warmth)" : "var(--color-ink-muted)",
                        }}
                      >
                        {row.setType === "failure" ? "F" : row.setType === "warmup" ? "W" : "N"}
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenRir(openRir === `${x.slug}-${i}` ? null : `${x.slug}-${i}`)}
                          className="w-12 rounded border px-1 py-1.5 text-center text-[10px]"
                          title="RIR — reps in reserve (how many more reps you could do)"
                          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                        >
                          {row.rir === null || row.rir === undefined ? "RIR" : `RIR ${row.rir}`}
                        </button>
                        {openRir === `${x.slug}-${i}` && (
                          <div className="absolute bottom-full right-0 z-40 mb-1 w-28 rounded-lg border shadow-lg"
                            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                            <p className="border-b px-2 py-1 text-[9px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                              Reps in reserve — how many more you could do
                            </p>
                            {[0, 1, 2, 3, 4].map((r) => (
                              <button key={r} type="button"
                                onClick={() => { void logSet(x.slug, i, { rir: r }); setOpenRir(null); }}
                                className="block w-full px-2 py-1.5 text-left text-[10px] hover:bg-[var(--color-paper-2)]"
                                style={{ color: "var(--color-ink)" }}>
                                {r} — {r === 0 ? "to failure" : r === 1 ? "almost failure" : `${r} left`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void logSet(x.slug, i, { done: !row.done })}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          borderColor: row.done ? "var(--color-success)" : "var(--color-paper-3)",
                          backgroundColor: row.done ? "var(--color-success)" : "var(--color-paper-2)",
                          color: row.done ? "var(--color-paper)" : "var(--color-ink)",
                          minHeight: 36,
                        }}
                      >
                        {row.done ? "Done ✓" : "Log"}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSetCounts((c) => ({ ...c, [x.slug]: (c[x.slug] ?? 1) + 1 }))}
                  className="mt-1.5 w-full rounded-lg border border-dashed px-3 py-1.5 text-[11px] font-medium"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                >
                  + Add set
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={finish}
        className="mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-semibold"
        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
        Finish workout
      </button>

      {view && (() => {
        const sci = SCIENCE[view.slug];
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setView(null)}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5"
              style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{view.name}</h2>
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
              {sci && (
                <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>The science</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>{sci.science}</p>
                  <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{sci.source}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function ActiveWorkoutClient() {
  return (
    <Suspense fallback={null}>
      <ActiveInner />
    </Suspense>
  );
}
