"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EXERCISES, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";
import { estimateE1, EQUIP_NOTES, VARIATIONS, HANDED } from "@/lib/workout/ratios";

interface DayExercise { slug: string; name: string; sets: number; reps: string; supersetGroup?: number | null; }
interface SetRow { weight: string; reps: number | null; rir?: number | null; setType?: "warmup" | "working" | "failure"; variation?: string | null; side?: "left" | "right" | "both" | null; loggedAt?: string; done: boolean; }
type Unit = "kg" | "lb";
type HandMode = "both" | "one";

const TIER_COLORS: Record<string, string> = { S: "#b45309", A: "#365314", B: "#44403c", C: "#78716c" };

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function nowMs() { return Date.now(); }

function ActiveInner() {
  const params = useSearchParams();
  const dayId = params.get("day");
  const [dayName, setDayName] = useState("");
  const [exercises, setExercises] = useState<DayExercise[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setRows, setSetRows] = useState<Record<string, SetRow[]>>({});
  const [handModes, setHandModes] = useState<Record<string, HandMode>>({});
  const [prevSets, setPrevSets] = useState<Record<string, string[]>>({});
  const [bestE1, setBestE1] = useState<Map<string, number>>(new Map());
  const [recommendedKg, setRecommendedKg] = useState<Map<string, number>>(new Map());
  const [retained, setRetained] = useState<Map<string, { d: number; r: number }>>(new Map());
  const [lastPos, setLastPos] = useState<Map<string, number>>(new Map());
  const [lastAt, setLastAt] = useState<Map<string, number>>(new Map());
  const [stalled, setStalled] = useState<Set<string>>(new Set());
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState(0);
  // Live-pill flag — keyed on the session existing, not mount ordering, so it
  // always fires for both fresh and resumed sessions.
  useEffect(() => {
    if (!sessionId || !dayId) return;
    try {
      localStorage.setItem("waqt:workout-live", JSON.stringify({
        dayId, name: dayName || "Workout",
        startedAt: startRef.current || Date.now(),
      }));
    } catch { /* noop */ }
    // Do not clear on unmount: navigating to Calendar/workout history must
    // leave the offline resume pill visible. Finish/cancel clear it explicitly.
  }, [sessionId, dayId, dayName]);
  const [restLeft, setRestLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [finalDuration, setFinalDuration] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSetAtRef = useRef<Record<string, number>>({});

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
      setSetCounts(Object.fromEntries((d.exercises || []).map((exercise: DayExercise) => [exercise.slug, Math.max(1, exercise.sets || 1)])));
      // Start/resume session
      const sres = await fetch(`/api/workout/sessions?start=${Date.now()}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayId: d.id,
          dayName: d.name,
          exerciseOrder: Object.fromEntries((d.exercises || []).map((exercise: DayExercise, index: number) => [exercise.slug, index])),
        }),
      }).catch(() => null);
      if (!sres?.ok || cancelled) {
        let detail = "The workout session could not be created.";
        if (sres) {
          try {
            const body = await sres.json() as { error?: string };
            if (body.error) detail = body.error;
          } catch { /* non-JSON failure */ }
        } else {
          detail = "The workout session request could not reach the server.";
        }
        setSessionError(detail);
        return;
      }
      const sdata = await sres.json();
      if (!sdata?.session?.id) {
        setSessionError("The server returned no workout session ID. Reload the app once and try again.");
        return;
      }
      setSessionId(sdata.session.id);
      startRef.current = Date.now() - (sdata.resumed ? Date.now() - new Date(sdata.session.startedAt).getTime() : 0);
      try {
        const startedMs = Date.parse(sdata.session.startedAt ?? "") || Date.now();
        localStorage.setItem("waqt:workout-live", JSON.stringify({ dayId: d.id, name: d.name, startedAt: startedMs }));
      } catch { /* noop */ }
      // Hydrate logged sets (resumed sessions come back with rows)
      const rows: Record<string, SetRow[]> = {};
      for (const s of sdata.sets || []) {
        rows[s.slug] = rows[s.slug] || [];
        rows[s.slug][s.setIndex] = { weight: s.weight ?? "", reps: s.reps, rir: s.rir, setType: s.setType, variation: s.variation, side: s.side, loggedAt: s.loggedAt, done: s.done };
      }
      setSetRows(rows);
      const modes: Record<string, HandMode> = {};
      for (const [slug, sets] of Object.entries(rows)) {
        if (sets.some((set) => set?.variation === "hand:left" || set?.variation === "hand:right")) modes[slug] = "one";
      }
      setHandModes(modes);
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
      // All-time bests — feeds the cross-lift e1RM estimator.
      const p2 = await fetch("/api/workout/progress").catch(() => null);
      if (p2?.ok && !cancelled) {
        const d2 = await p2.json();
        setBestE1(new Map((d2.progress || []).map((p: { slug: string; bestE1?: number }) => [p.slug, p.bestE1 || 0])));
        setRecommendedKg(new Map((d2.progress || []).map((p: { slug: string; recommendedKg?: number | null }) => [p.slug, p.recommendedKg || 0])));
        const at = new Map<string, number>(), stall = new Set<string>(), ret = new Map<string, { d: number; r: number }>(), pos = new Map<string, number>();
        for (const p of d2.progress || []) {
          if (p.daysSince != null && p.retained != null) ret.set(p.slug, { d: p.daysSince, r: p.retained });
          if (p.lastPos != null) pos.set(p.slug, p.lastPos);
        }
        setRetained(ret); setLastPos(pos);
        for (const p of d2.progress || []) {
          const last = p.points?.[p.points.length - 1];
          if (last?.at) at.set(p.slug, new Date(last.at).getTime());
          // Deload signal: 3+ consecutive sessions without a new best e1RM.
          const pts = (p.points || []).map((x: { e1: number }) => x.e1);
          if (pts.length >= 4) {
            const tail = pts.slice(-4);
            if (tail.every((v: number, i: number) => i === 0 || v <= tail[i - 1])) stall.add(p.slug);
          }
        }
        setLastAt(at); setStalled(stall);
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

  const finishing = useRef(false);
  const logSet = async (slug: string, idx: number, patch: Partial<SetRow>): Promise<boolean> => {
    const prev = setRows[slug]?.[idx] || { weight: "", reps: null, done: false };
    const mode = handModes[slug] ?? "both";
    const automaticHand = HANDED.has(slug)
      ? mode === "one" ? (idx % 2 === 0 ? "hand:left" : "hand:right") : "hand:both"
      : undefined;
    const loggedNow = nowMs();
    const restAfterSec = patch.done
      ? (lastSetAtRef.current[slug] ? Math.max(0, Math.round((loggedNow - lastSetAtRef.current[slug]) / 1000)) : null)
      : null;
    if (patch.done) lastSetAtRef.current[slug] = loggedNow;
    const next = { ...prev, ...patch, loggedAt: patch.done ? new Date(loggedNow).toISOString() : prev.loggedAt, variation: patch.variation ?? prev.variation ?? automaticHand,
      side: patch.side ?? prev.side ?? (automaticHand === "hand:left" ? "left" : automaticHand === "hand:right" ? "right" : automaticHand === "hand:both" ? "both" : null) };
    setSetRows((m) => {
      const arr = [...(m[slug] || [])];
      arr[idx] = next;
      return { ...m, [slug]: arr };
    });
    if (sessionId) {
      const response = await fetch("/api/workout/sets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, slug, setIndex: idx, weight: unitToKg(next.weight), reps: next.reps, rir: next.rir, setType: next.setType, variation: next.variation, side: next.side, loggedAt: next.loggedAt, restAfterSec, done: next.done }),
      }).catch(() => null);
      if (!response?.ok) return false;
    }
    if (patch.done && !finishing.current) rest();
    return true;
  };

  // Text inputs save after the user pauses, preventing an older keystroke
  // request from racing a newer one (e.g. "3" overwriting "35").
  const queueSetSave = (slug: string, idx: number, patch: Partial<SetRow>) => {
    const key = `${slug}:${idx}`;
    setSetRows((prev) => {
      const rows = [...(prev[slug] || [])];
      const current = rows[idx] || { weight: "", reps: null, done: false, setType: "working" as const };
      rows[idx] = { ...current, ...patch };
      return { ...prev, [slug]: rows };
    });
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      delete saveTimers.current[key];
      void logSet(slug, idx, patch);
    }, 350);
  };

  const removeSetRow = async (slug: string, idx: number) => {
    if (!sessionId) return;
    await fetch(`/api/workout/sets?sessionId=${encodeURIComponent(sessionId)}&slug=${encodeURIComponent(slug)}&setIndex=${idx}`, { method: "DELETE" }).catch(() => {});
    setSetRows((prev) => {
      const rows = [...(prev[slug] || [])];
      rows[idx] = undefined as unknown as SetRow;
      return { ...prev, [slug]: rows };
    });
  };

  const setHandMode = (slug: string, mode: HandMode) => {
    setHandModes((prev) => ({ ...prev, [slug]: mode }));
    if (mode === "both") {
      const count = setCounts[slug] ?? 1;
      // Remove paired side rows before returning to one bilateral row per set.
      for (let i = 0; i < count; i++) void removeSetRow(slug, count + i);
      for (let i = 0; i < count; i++) void logSet(slug, i, { variation: "hand:both" });
    } else {
      const count = setCounts[slug] ?? 1;
      // Remove old bilateral rows so a later finish cannot count both modes.
      for (let i = 0; i < count; i++) void removeSetRow(slug, i);
    }
  };

  const [units, setUnits] = useState<Unit>("kg");
  useEffect(() => {
    // Default to the unit chosen on /workout/profile; the header toggle still
    // overrides per-session.
    void fetch("/api/settings/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.prefs?.unitWeight === "lb" || d?.prefs?.unitWeight === "kg") setUnits(d.prefs.unitWeight);
    }).catch(() => {});
  }, []);
  const [view, setView] = useState<Exercise | null>(null);
  const [openRir, setOpenRir] = useState<string | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readiness, setReadiness] = useState({ sleepHours: "", energy: "", soreness: "", stress: "" });
  const router = useRouter();

  const unitToKg = (v: string) => (units === "lb" ? String(Math.round(parseFloat(v) / 2.205 * 10) / 10) : v);
  // Stored weights are canonical kg — convert for display when in lb mode.
  const dispW = (kg: number) => (units === "lb" ? Math.round(kg * 2.205) : Math.round(kg * 10) / 10);
  const dispSet = (s: string) => {
    const [w, r] = s.split("×");
    const n = parseFloat(w);
    return Number.isFinite(n) && n > 0 ? `${dispW(n)}×${r || ""}` : s;
  };

  const totalDone = useMemo(
    () => Object.values(setRows).flat().filter((r) => r?.done).length,
    [setRows],
  );
  const totalPlanned = exercises.reduce((s, x) => s + (setCounts[x.slug] ?? 1), 0);

  const finish = async () => {
    setFinishError(null);
    const wallSeconds = Math.max(0, Math.floor((nowMs() - startRef.current) / 1000));
    if (sessionId) {
      finishing.current = true; // don't fire the rest timer per flushed row
      for (const timer of Object.values(saveTimers.current)) clearTimeout(timer);
      saveTimers.current = {};
      // Flush every row that has data but was never marked done — a partial
      // workout still counts; typed numbers shouldn't vanish on finish.
      let allSetsSaved = true;
      for (const [slug, arr] of Object.entries(setRows)) {
        for (let i = 0; i < arr.length; i++) {
          const r = arr[i];
          if (r && !r.done && r.reps != null && r.reps > 0 && parseFloat(r.weight) > 0) {
            const saved = await logSet(slug, i, {
              done: true,
              ...(HANDED.has(slug) && handModes[slug] === "one" && !r.variation ? { variation: "hand:left" } : {}),
              ...(HANDED.has(slug) && (handModes[slug] ?? "both") === "both" && !r.variation ? { variation: "hand:both" } : {}),
            });
            if (!saved) allSetsSaved = false;
          }
        }
      }
      // <5min with data = probably backfilling an old workout — save the sets
      // but don't inflate the duration stat.
      const quick = elapsed < 300;
      const ended = await fetch("/api/workout/sessions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, end: true, endAt: quick ? new Date(startRef.current + 60000).toISOString() : undefined }),
      }).then((response) => response.ok).catch(() => false);
      if (!ended || !allSetsSaved) {
        setFinishError("The workout could not fully save. Check your connection and try Finish again.");
        return;
      }
      setFinalDuration(quick ? 60 : wallSeconds);
    } else {
      setFinishError("No workout session was created, so this workout was not saved. Check your connection and restart it.");
      return;
    }
    try { localStorage.removeItem("waqt:workout-live"); } catch { /* noop */ }
    setFinished(true);
  };

  // Cancel = delete the session entirely — no history entry, no sets saved.
  // Persist the in-session reorder back to the profile — the day's sortOrder
  // IS the position the algorithm reads, so arrows teach it the real order.
  const persistOrder = async (ordered: DayExercise[]) => {
    if (!dayId) return;
    await fetch("/api/workout/days", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dayId, exercises: ordered }),
    }).catch(() => {});
  };

  const cancel = async () => {
    if (sessionId) await fetch(`/api/workout/sessions?id=${sessionId}`, { method: "DELETE" }).catch(() => {});
    try { localStorage.removeItem("waqt:workout-live"); } catch { /* noop */ }
    router.push("/workout");
  };

  const saveReadiness = async () => {
    if (!sessionId) return;
    await fetch("/api/workout/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sessionId,
        readiness: {
          sleepHours: Number(readiness.sleepHours) || undefined,
          energy: Number(readiness.energy) || undefined,
          soreness: Number(readiness.soreness) || undefined,
          stress: Number(readiness.stress) || undefined,
        },
      }),
    }).catch(() => {});
    setReadinessOpen(false);
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
          {totalDone} sets in {fmt(finalDuration || elapsed)}.
        </p>
        {finishError && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{finishError}</p>}
        <Link href="/workout" className="mt-6 inline-block rounded-lg px-6 py-3 text-sm font-semibold" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
          Back to workouts
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      {sessionError && (
        <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}>
          {sessionError}
        </div>
      )}
      {finishError && (
        <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}>
          {finishError}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{dayName || "Workout"}</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setReadinessOpen(true)}
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
            Readiness
          </button>
          <button type="button" onClick={() => {
            const next = units === "kg" ? "lb" : "kg";
            setUnits(next);
            // Rows hold display-unit values — convert each to the new unit.
            setSetRows((r) => Object.fromEntries(Object.entries(r).map(([s, rows]) => [s, rows.map((row) => ({
              ...row,
              weight: row.weight
                ? next === "lb" ? String(Math.round(parseFloat(row.weight) * 2.205)) : String(Math.round(parseFloat(row.weight) / 2.205 * 10) / 10)
                : row.weight,
            }))])));
            void fetch("/api/settings/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitWeight: next }) }).catch(() => {});
          }}
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
            title="Switch units — values convert">
            {units}
          </button>
          <span className="rounded-full border px-3 py-1 text-xs tabular-nums" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
            {fmt(elapsed)}
          </span>
          <button type="button" onClick={() => setLeaveAsk(true)} className="rounded-full border px-2 py-1 text-[10px]"
            style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }} title="Leave — deletes this session">
            ✕
          </button>
        </div>
      </div>
      {readinessOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={() => setReadinessOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl border p-4 sm:rounded-2xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Today&apos;s training context</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              These inputs adjust recommendations; they do not judge the session.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                ["sleepHours", "Sleep hours", "0-14"],
                ["energy", "Energy 1-5", "1-5"],
                ["soreness", "Soreness 1-5", "1-5"],
                ["stress", "Stress 1-5", "1-5"],
              ] as const).map(([key, label, placeholder]) => (
                <label key={key} className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {label}
                  <input inputMode="decimal" placeholder={placeholder} value={readiness[key]}
                    onChange={(e) => setReadiness((r) => ({ ...r, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-2.5 py-2 text-xs"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void saveReadiness()}
              className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              Save context
            </button>
          </div>
        </div>
      )}
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {totalDone}/{totalPlanned} sets · {restLeft > 0 ? `rest ${fmt(restLeft)}` : "rest timer starts after a set"}
      </p>
      {exercises.some((x) => stalled.has(x.slug)) && (
        <div className="mt-2 rounded-lg border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>
          Stalled lifts detected — consider a deload week: drop weights ~50%, keep reps, return next week.
        </div>
      )}
      {restLeft > 0 && (
        <div className="mt-2 rounded-lg border px-3 py-2 text-center text-sm font-medium tabular-nums"
          style={{ borderColor: "var(--color-warmth)", color: "var(--color-warmth)" }}>
          Rest: {fmt(restLeft)}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {exercises.map((x, xi) => {
          const ex: Exercise | undefined = EXERCISES.find((e) => e.slug === x.slug);
          const rows = setRows[x.slug] || [];
          return (
            <div key={x.slug} className="rounded-xl border p-3" style={{ borderColor: x.supersetGroup != null ? "var(--color-accent)" : "var(--color-paper-3)" }}>
              {x.supersetGroup != null && (
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>superset</p>
              )}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center" style={{ color: "var(--color-ink-muted)" }}>
                  <button type="button" disabled={xi === 0} aria-label={`Move ${x.name} up`}
                    onClick={() => { const n = [...exercises]; [n[xi - 1], n[xi]] = [n[xi], n[xi - 1]]; setExercises(n); void persistOrder(n); }}
                    className="text-[10px] leading-none disabled:opacity-25">▲</button>
                  <button type="button" disabled={xi === exercises.length - 1} aria-label={`Move ${x.name} down`}
                    onClick={() => { const n = [...exercises]; [n[xi], n[xi + 1]] = [n[xi + 1], n[xi]]; setExercises(n); void persistOrder(n); }}
                    className="text-[10px] leading-none disabled:opacity-25">▼</button>
                </div>
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
                    const isLower = ex ? /squat|deadlift|lunge|thrust|leg|calf|rdl/.test(ex.slug) : false;
                    return (
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        last: {parts.map(dispSet).join(" / ")}
                        {lastPos.get(x.slug) !== undefined && (
                          <span style={{ opacity: 0.7 }} title="Position in that workout — exercises done later naturally get less weight">
                            {" "}(#{lastPos.get(x.slug)})
                          </span>
                        )}
                        {hitTop && lastW > 0 && (
                          <span style={{ color: "var(--color-warmth)" }}>
                            {" · try "}
                            {recommendedKg.get(x.slug)
                              ? dispW(recommendedKg.get(x.slug)! * (retained.get(x.slug)?.r ?? 1))
                              : dispW((lastW + (isLower ? 5 : 2.5)) * (retained.get(x.slug)?.r ?? 1))}
                            {units}
                          </span>
                        )}
                        {(() => {
                          const rw = retained.get(x.slug);
                          return rw && rw.d > 28 ? (
                            <span className="block" style={{ color: "var(--color-accent)" }}>
                              back after {Math.round(rw.d / 7)}w — restart ~{dispW(lastW * rw.r)}{units}, muscle memory fills in fast
                            </span>
                          ) : null;
                        })()}
                        {/* Warmup ramp — ~40% then ~75% of top weight optimizes output (Ribeiro 2020) */}
                        {lastW > 20 && (
                          <span className="block" style={{ color: "var(--color-ink-faint)" }}>
                            warm up: {dispW(lastW * 0.4)}{units}×8 · {dispW(lastW * 0.75)}{units}×5
                          </span>
                        )}
                      </p>
                    );
                  })()}
                  {/* No direct history — estimate from the strongest related lift */}
                  {EQUIP_NOTES[x.slug] && (
                    <p className="mt-0.5 text-[9px] italic" style={{ color: "var(--color-ink-muted)", opacity: 0.8 }}>
                      {EQUIP_NOTES[x.slug]}
                    </p>
                  )}
                  {!prevSets[x.slug]?.filter(Boolean).length && (() => {
                    const est = estimateE1(x.slug, bestE1, lastAt);
                    if (!est) return null;
                    const from = EXERCISES.find((e) => e.slug === est.from)?.name || est.from;
                    return (
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }} title={`${est.why} — ~75% of estimated 1RM as a working weight`}>
                        est. {dispW(est.e1 * 0.75)}{units}×8-10 <span style={{ opacity: 0.7 }}>(from {from}{est.personal ? ", calibrated" : ""})</span>
                      </p>
                    );
                  })()}
                </div>
              </div>

              {VARIATIONS[x.slug] && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {VARIATIONS[x.slug].map((v) => {
                    const active = (rows[0]?.variation ?? VARIATIONS[x.slug][0].key) === v.key;
                    return (
                      <button key={v.key} type="button" title={v.note}
                        onClick={() => {
                          // Apply the variation to every set row for this exercise.
                          for (let i = 0; i < (setCounts[x.slug] ?? 1); i++) void logSet(x.slug, i, { variation: v.key });
                        }}
                        className="rounded-full border px-2.5 py-1 text-[10px]"
                        style={{ borderColor: active ? "var(--color-accent)" : "var(--color-paper-3)", color: active ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {HANDED.has(x.slug) && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper-2) 55%, transparent)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>How are you lifting?</span>
                  {(["both", "one"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setHandMode(x.slug, mode)}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        borderColor: (handModes[x.slug] ?? "both") === mode ? "var(--color-accent)" : "var(--color-paper-3)",
                        color: (handModes[x.slug] ?? "both") === mode ? "var(--color-accent)" : "var(--color-ink-muted)",
                        backgroundColor: (handModes[x.slug] ?? "both") === mode ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
                      }}>
                      {mode === "both" ? "2 hands" : "1 hand"}
                    </button>
                  ))}
                  <span className="ml-auto text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                    {(handModes[x.slug] ?? "both") === "one" ? "choose L/R per set" : "bilateral load"}
                  </span>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 px-1 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                  <span className="w-6 text-center">#</span>
                  <span className="w-16 text-center">{units}</span>
                  <span className="w-16 text-center">reps</span>
                  <span className="w-8 text-center" title="N normal working set · W warmup · F taken to failure">type</span>
                  <span className="w-12 text-center" title="Reps in reserve — how many more you could have done">RIR</span>
                  <span className="flex-1" />
                </div>
                {Array.from({ length: (setCounts[x.slug] ?? 1) * ((HANDED.has(x.slug) && (handModes[x.slug] ?? "both") === "one") ? 2 : 1) }, (_, slot) => {
                  const oneHand = HANDED.has(x.slug) && (handModes[x.slug] ?? "both") === "one";
                  const logicalIndex = oneHand ? Math.floor(slot / 2) : slot;
                  const rowIndex = oneHand ? logicalIndex * 2 + (slot % 2) : logicalIndex;
                  const side = slot % 2 === 0 ? "left" : "right";
                  const row = rows[rowIndex] || { weight: "", reps: null, done: false, setType: "working" as const, variation: oneHand ? `hand:${side}` : "hand:both" };
                  const prev = prevSets[x.slug]?.[logicalIndex];
                  return (
                    <div key={rowIndex} className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors"
                      style={{ backgroundColor: row.done ? "color-mix(in oklab, var(--color-success) 12%, transparent)" : "transparent" }}>
                      <span className="w-6 text-center text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{logicalIndex + 1}{oneHand ? ` ${side === "left" ? "L" : "R"}` : ""}</span>
                      <input
                        value={row.weight}
                        onChange={(e) => queueSetSave(x.slug, rowIndex, { weight: e.target.value })}
                        placeholder={prev ? String(dispW(parseFloat(prev.split("×")[0]) || 0)) : units}
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
                      <input
                        type="number" min={0} value={row.reps ?? ""}
                        onChange={(e) => queueSetSave(x.slug, rowIndex, { reps: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder={prev ? prev.split("×")[1] || x.reps : x.reps}
                        className="w-16 rounded border px-2 py-1.5 text-center text-xs"
                        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const order = ["warmup", "working", "failure"] as const;
                          const next = order[(order.indexOf(row.setType || "working") + 1) % 3];
                          void logSet(x.slug, rowIndex, { setType: next });
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
                      {oneHand && (
                        <span className="w-7 text-center text-[9px] font-semibold" style={{ color: "var(--color-accent)" }} title="This row logs one side independently">
                          {side === "left" ? "L" : "R"}
                        </span>
                      )}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenRir(openRir === `${x.slug}-${rowIndex}` ? null : `${x.slug}-${rowIndex}`)}
                          className="w-12 rounded border px-1 py-1.5 text-center text-[10px]"
                          title="RIR — reps in reserve (how many more reps you could do)"
                          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", opacity: row.done ? 0.6 : 1 }}
                        >
                          {row.rir === null || row.rir === undefined ? "RIR" : `RIR ${row.rir}`}
                        </button>
                        {openRir === `${x.slug}-${rowIndex}` && (
                          <div className="absolute bottom-full right-0 z-40 mb-1 w-28 rounded-lg border shadow-lg"
                            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                            <p className="border-b px-2 py-1 text-[9px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                              Reps in reserve — how many more you could do
                            </p>
                            {[0, 1, 2, 3, 4, 5].map((r) => (
                              <button key={r} type="button"
                                onClick={() => { void logSet(x.slug, rowIndex, { rir: r }); setOpenRir(null); }}
                                className="block w-full px-2 py-1.5 text-left text-[10px] hover:bg-[var(--color-paper-2)]"
                                style={{ color: "var(--color-ink)" }}>
                                {r === 5 ? "5+ — easy set (little growth)" : `${r} — ${r === 0 ? "to failure" : r === 1 ? "almost failure" : `${r} left`}`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!row.done && (!(parseFloat(row.weight) > 0) || !(row.reps && row.reps > 0))}
                        onClick={() => void logSet(x.slug, rowIndex, { done: !row.done })}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          borderColor: row.done ? "var(--color-success)" : "var(--color-paper-3)",
                          backgroundColor: row.done ? "var(--color-success)" : "var(--color-paper-2)",
                          color: row.done ? "var(--color-paper)" : "var(--color-ink)",
                          minHeight: 36,
                          opacity: !row.done && (!(parseFloat(row.weight) > 0) || !(row.reps && row.reps > 0)) ? 0.5 : 1,
                        }}
                      >
                        {row.done ? "Done ✓" : (!(parseFloat(row.weight) > 0) ? "Enter weight" : "Log")}
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

      {leaveAsk && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setLeaveAsk(false)}>
          <div className="w-full max-w-xs rounded-t-2xl sm:rounded-2xl border p-4"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Leave workout?</p>
            <p className="mt-1 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              This deletes the session — no history, nothing feeds the algorithm. You can restart it from Calendar anytime.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setLeaveAsk(false)}
                className="flex-1 rounded-xl border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>Keep going</button>
              <button type="button" onClick={cancel}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}>Leave</button>
            </div>
          </div>
        </div>
      )}
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
