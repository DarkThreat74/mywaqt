"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EXERCISES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseDiagram } from "@/lib/workout/diagrams";

interface DayExercise { slug: string; name: string; sets: number; reps: string; }
interface SetRow { weight: string; reps: number | null; done: boolean; }

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
        body: JSON.stringify({ sessionId, slug, setIndex: idx, weight: next.weight, reps: next.reps, done: next.done }),
      }).catch(() => {});
    }
    if (patch.done) rest();
  };

  const totalDone = useMemo(
    () => Object.values(setRows).flat().filter((r) => r?.done).length,
    [setRows],
  );
  const totalPlanned = exercises.reduce((s, x) => s + x.sets, 0);

  const finish = async () => {
    if (sessionId) {
      await fetch("/api/workout/sessions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, end: true }),
      }).catch(() => {});
    }
    setFinished(true);
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{dayName || "Workout"}</h1>
        <span className="rounded-full border px-3 py-1 text-xs tabular-nums" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
          {fmt(elapsed)}
        </span>
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
            <div key={x.slug} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <div className="flex items-start gap-3">
                {ex && (
                  <ExerciseDiagram
                    pattern={ex.pattern}
                    className="h-14 w-14 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--color-paper-2)" }}
                  />
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
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {Array.from({ length: x.sets }, (_, i) => {
                  const row = rows[i] || { weight: "", reps: null, done: false };
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-center text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{i + 1}</span>
                      <input
                        value={row.weight}
                        onChange={(e) => void logSet(x.slug, i, { weight: e.target.value })}
                        placeholder="kg"
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
                      <input
                        type="number" min={0} value={row.reps ?? ""}
                        onChange={(e) => void logSet(x.slug, i, { reps: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder={x.reps}
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
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
