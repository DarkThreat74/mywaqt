"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { EXERCISES, isUnilateralExercise, type Exercise } from "@/lib/workout/exercises";
import { ExerciseMedia } from "@/lib/workout/diagrams";
import { SCIENCE } from "@/lib/workout/science";
import { estimateE1, EQUIP_NOTES, VARIATIONS, HANDED } from "@/lib/workout/ratios";
import { getOfflineDB, type LocalWorkoutSession, type LocalWorkoutSet } from "@/lib/offline/db";
import { syncPendingWorkouts } from "@/lib/workout/sync";

interface DayExercise { slug: string; name: string; sets: number; reps: string; supersetGroup?: number | null; }
interface SetRow { weight: string; reps: number | null; rir?: number | null; setType?: "warmup" | "working" | "failure"; variation?: string | null; side?: "left" | "right" | "both" | null; loggedAt?: string; done: boolean; }
type Unit = "kg" | "lb";
type HandMode = "both" | "one";

// Exercises that are inherently one-side-at-a-time (Single-Arm X, One-Arm Y)
// default to paired L/R rows instead of requiring the manual 1-hand toggle.
const handedCapable = (slug: string) => HANDED.has(slug) || isUnilateralExercise(slug);
const requiresLoad = (slug: string) => EXERCISES.find((exercise) => exercise.slug === slug)?.equip !== "bodyweight";

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
  const [availableExercises, setAvailableExercises] = useState<DayExercise[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setRows, setSetRows] = useState<Record<string, SetRow[]>>({});
  const [handModes, setHandModes] = useState<Record<string, HandMode>>({});
  const handModeOf = (slug: string) => handModes[slug] ?? (isUnilateralExercise(slug) ? "one" : "both");
  const [prevSets, setPrevSets] = useState<Record<string, string[]>>({});
  const [bestE1, setBestE1] = useState<Map<string, number>>(new Map());
  const [recommendedKg, setRecommendedKg] = useState<Map<string, number>>(new Map());
  const [retained, setRetained] = useState<Map<string, { d: number; r: number }>>(new Map());
  const [lastPos, setLastPos] = useState<Map<string, number>>(new Map());
  const [lastAt, setLastAt] = useState<Map<string, number>>(new Map());
  const [stalled, setStalled] = useState<Set<string>>(new Set());
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState(0);
  const [sessionDate, setSessionDate] = useState(""); // yyyy-mm-dd the workout belongs to
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
  const timerStartRef = useRef(0);
  const recordedStartRef = useRef(0); // the day the session belongs to (may be backdated)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSetAtRef = useRef<Record<string, number>>({});

  const markPending = async () => {
    if (!sessionId) return;
    try { await getOfflineDB().workoutSessions.update(sessionId, { syncState: "pending" }); } catch { /* noop */ }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Find today's day + exercises. Cache the last successful response so
      // the session can still start with no network at all.
      const res = await fetch("/api/workout/days").catch(() => null);
      let days: Array<{ id: string; name: string; weekday: number; exercises?: DayExercise[] }> = [];
      if (res?.ok) {
        const body = await res.json();
        days = body.days || [];
        try { localStorage.setItem("waqt:workout-days", JSON.stringify(days)); } catch { /* noop */ }
      } else {
        try { days = JSON.parse(localStorage.getItem("waqt:workout-days") || "[]"); } catch { /* noop */ }
      }
      if (cancelled) return;
      if (!days.length) {
        setSessionError("Your workout plan could not be loaded. Connect once to sync it, then it works offline.");
        return;
      }
      const d = dayId
        ? days.find((x: { id: string }) => x.id === dayId)
        : days.find((x: { weekday: number }) => x.weekday === new Date().getDay());
      if (!d || cancelled) return;
      setDayName(d.name);
      setAvailableExercises(d.exercises || []);
      // Start/resume session. The local draft is only written once we know
      // the network is down — creating it unconditionally left empty open
      // sessions that synced to the server and resurrected the workout pill.
      const localSessionId = crypto.randomUUID();
      // Backfilled workouts record the day they were FOR, not the moment they
      // were logged — a Monday workout entered Thursday is a Monday workout.
      const sessionStart = (() => {
        const now = new Date();
        if (typeof d.weekday === "number" && d.weekday !== now.getDay()) {
          const back = (now.getDay() - d.weekday + 7) % 7;
          now.setDate(now.getDate() - back);
        }
        return now.toISOString();
      })();
      const localStartedAt = sessionStart;
      const startBody = {
        clientId: localSessionId,
        dayId: d.id,
        dayName: d.name,
        exerciseOrder: {},
        startedAt: sessionStart,
      };
      let sres = await fetch(`/workout-session?start=${Date.now()}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startBody),
      }).catch(() => null);
      // Direct route first. If offline, the /api fallback lets the service
      // worker queue the session for later replay.
      if (!sres || !sres.ok) {
        sres = await fetch(`/api/workout/sessions?start=${Date.now()}&offline-fallback=1`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(startBody),
        }).catch(() => null);
      }
      let sdata: {
        session?: { id?: string; startedAt?: string };
        sets?: Array<{ slug: string; setIndex: number; weight?: string | null; reps?: number | null; rir?: number | null; setType?: "warmup" | "working" | "failure"; variation?: string | null; side?: "left" | "right" | "both" | null; loggedAt?: string; done?: boolean }>;
        resumed?: boolean;
      };
      if (!sres?.ok) {
        // The phone owns the active session when the network is unavailable.
        // Resume an open local draft for this day if one exists — otherwise
        // a reload would orphan the in-progress offline workout.
        sdata = { session: { id: localSessionId, startedAt: localStartedAt }, sets: [], resumed: false };
        try {
          const db = getOfflineDB();
          const open = await db.workoutSessions
            .filter((s) => s.dayId === d.id && !s.endedAt)
            .toArray();
          const draft = open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
          if (draft) {
            const localSets = await db.workoutSets.where("sessionId").equals(draft.id).toArray();
            sdata = {
              session: { id: draft.id, startedAt: draft.startedAt },
              resumed: true,
              sets: localSets.map((s) => ({
                slug: s.slug, setIndex: s.setIndex, weight: s.weight, reps: s.reps,
                rir: s.rir ?? null, setType: s.setType ?? "working",
                variation: s.variation ?? null, side: s.side ?? null,
                loggedAt: s.loggedAt, done: s.done,
              })),
            };
          }
        } catch { /* fall through to a fresh draft */ }
        if (!sdata.resumed) {
          try {
            await getOfflineDB().workoutSessions.put({
              id: localSessionId,
              userId: null,
              dayId: d.id,
              dayName: d.name,
              startedAt: localStartedAt,
              endedAt: null,
              exerciseOrder: {},
              syncState: "pending",
              updatedAt: new Date().toISOString(),
            });
          } catch { /* storage unavailable */ }
        }
      } else {
        sdata = await sres.json();
      }
      if (cancelled) return;
      if (!sdata?.session?.id) {
        let detail = "The workout session could not be created.";
        if (sres) detail = "The server returned no workout session ID.";
        setSessionError(detail);
        return;
      }
      setSessionId(sdata.session.id);
      const parsedStart = Date.parse(sdata.session.startedAt ?? "");
      const safeStart = Number.isFinite(parsedStart) && parsedStart <= Date.now() ? parsedStart : Date.now();
      startRef.current = safeStart;
      recordedStartRef.current = safeStart;
      // A backfilled workout belongs to the selected day, but its live timer
      // starts when this screen opens — never show a multi-day timer.
      timerStartRef.current = Date.now() - safeStart > 12 * 60 * 60 * 1000 ? Date.now() : safeStart;
      setSessionDate(new Date(safeStart).toISOString().slice(0, 10));
      setElapsed(Math.max(0, Math.floor((Date.now() - safeStart) / 1000)));
      try {
        const db = getOfflineDB();
        // Server resumed a different session (or made its own ID): the local
        // draft we just created is obsolete — the server ID wins.
        if (sdata.session.id !== localSessionId) await db.workoutSessions.delete(localSessionId);
        await db.workoutSessions.put({
          id: sdata.session.id,
          userId: null,
          dayId: d.id,
          dayName: d.name,
          startedAt: new Date(safeStart).toISOString(),
          endedAt: null,
          exerciseOrder: startBody.exerciseOrder,
          syncState: "synced",
          updatedAt: new Date().toISOString(),
        } satisfies LocalWorkoutSession);
      } catch { /* local-first cache is best effort during upgrade */ }
      try {
        const startedMs = Date.parse(sdata.session.startedAt ?? "") || Date.now();
        localStorage.setItem("waqt:workout-live", JSON.stringify({ dayId: d.id, name: d.name, startedAt: startedMs }));
    } catch { /* noop */ }
      window.dispatchEvent(new Event("waqt:workout-live-changed"));
      // Hydrate logged sets (resumed sessions come back with rows)
      const rows: Record<string, SetRow[]> = {};
      for (const s of sdata.sets || []) {
        rows[s.slug] = rows[s.slug] || [];
        rows[s.slug][s.setIndex] = { weight: s.weight ?? "", reps: s.reps ?? null, rir: s.rir, setType: s.setType, variation: s.variation, side: s.side, loggedAt: s.loggedAt, done: s.done ?? false };
      }
      setSetRows(rows);
      // Mirror resumed server sets into the local store so the device remains
      // the active-workout source of truth after a cross-device resume.
      try {
        const db = getOfflineDB();
        const now = new Date().toISOString();
        await db.workoutSets.bulkPut((sdata.sets || []).map((s) => ({
          id: `${sdata.session!.id}:${s.slug}:${s.setIndex}`,
          sessionId: sdata.session!.id!,
          slug: s.slug,
          setIndex: s.setIndex,
          weight: s.weight ?? "",
          reps: s.reps ?? null,
          rir: s.rir ?? null,
          setType: s.setType ?? "working",
          variation: s.variation ?? null,
          side: s.side ?? null,
          loggedAt: s.loggedAt,
          done: s.done ?? false,
          updatedAt: now,
        })));
      } catch { /* best effort */ }
      // Resume rebuilds cards from the logged rows themselves — exercises
      // added via Other/library aren't in the day's routine list but still
      // need their card (and paired L/R counts) restored.
      const modes: Record<string, HandMode> = {};
      for (const [slug, sets] of Object.entries(rows)) {
        if (sets.some((set) => set?.variation === "hand:left" || set?.variation === "hand:right")) modes[slug] = "one";
      }
      setHandModes(modes);
      const resumedExercises: DayExercise[] = sdata.resumed
        ? Object.keys(rows).map((slug) => {
            const fromDay = (d.exercises || []).find((e: DayExercise) => e.slug === slug);
            const lib = EXERCISES.find((e) => e.slug === slug);
            const rowCount = rows[slug].length;
            const logicalSets = Math.max(modes[slug] === "one" ? Math.ceil(rowCount / 2) : rowCount, 1);
            return {
              slug,
              name: fromDay?.name || lib?.name || slug.replace(/-/g, " "),
              sets: Math.max(logicalSets, fromDay?.sets || 1),
              reps: fromDay?.reps || "",
              supersetGroup: fromDay?.supersetGroup ?? null,
            };
          })
        : [];
      setExercises(resumedExercises);
      setSetCounts(Object.fromEntries(resumedExercises.map((exercise: DayExercise) => [exercise.slug, Math.max(1, exercise.sets || 1)])));
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
    timerRef.current = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - timerStartRef.current) / 1000))), 1000);
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
    const mode = handModeOf(slug);
    const automaticHand = handedCapable(slug)
      ? mode === "one" ? (idx % 2 === 0 ? "hand:left" : "hand:right") : "hand:both"
      : undefined;
    const loggedNow = nowMs();
    const restAfterSec = patch.done
      ? (lastSetAtRef.current[slug] ? Math.max(0, Math.round((loggedNow - lastSetAtRef.current[slug]) / 1000)) : null)
      : null;
    if (patch.done) lastSetAtRef.current[slug] = loggedNow;
    const next = { ...prev, ...patch, loggedAt: patch.done ? (prev.loggedAt ?? new Date(loggedNow).toISOString()) : prev.loggedAt, variation: patch.variation ?? prev.variation ?? automaticHand,
      side: patch.side ?? prev.side ?? (automaticHand === "hand:left" ? "left" : automaticHand === "hand:right" ? "right" : automaticHand === "hand:both" ? "both" : null) };
    setSetRows((m) => {
      const arr = [...(m[slug] || [])];
      arr[idx] = next;
      return { ...m, [slug]: arr };
    });
    let localSaved = false;
    if (sessionId) {
      const localSet: LocalWorkoutSet = {
        id: `${sessionId}:${slug}:${idx}`,
        sessionId,
        slug,
        setIndex: idx,
        weight: unitToKg(next.weight),
        wKg: true,
        reps: next.reps,
        rir: next.rir,
        setType: next.setType,
        variation: next.variation,
        side: next.side,
        loggedAt: next.loggedAt,
        restAfterSec,
        done: next.done,
        updatedAt: new Date(loggedNow).toISOString(),
      };
      try {
        await getOfflineDB().workoutSets.put(localSet);
        localSaved = true;
        void syncPendingWorkouts();
      } catch { /* network path below still attempts the server */ }
      let response = await fetch("/workout-set", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, slug, setIndex: idx, weight: unitToKg(next.weight), reps: next.reps, rir: next.rir, setType: next.setType, variation: next.variation, side: next.side, loggedAt: next.loggedAt, restAfterSec, done: next.done }),
      }).catch(() => null);
      if (!response?.ok) {
        // Direct path failed — the /api fallback can be answered by a stale
        // service worker with a synthetic ok, so flag pending regardless and
        // let the sweeper push real data via /workout-sync.
        void markPending();
        response = await fetch("/api/workout/sets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, slug, setIndex: idx, weight: unitToKg(next.weight), reps: next.reps, rir: next.rir, setType: next.setType, variation: next.variation, side: next.side, loggedAt: next.loggedAt, restAfterSec, done: next.done }),
        }).catch(() => null);
      }
      if (!response?.ok) return localSaved;
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
    // The local draft is the source of truth. Leaving this row in IndexedDB
    // lets the reconnect sweeper resurrect it on the next full sync.
    await getOfflineDB().workoutSets.delete(`${sessionId}:${slug}:${idx}`).catch(() => {});
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
  const [readinessSaving, setReadinessSaving] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"routine" | "library">("routine");
  const [customExerciseOpen, setCustomExerciseOpen] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [customExerciseName, setCustomExerciseName] = useState("");
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
  const activeExerciseIndex = exercises.findIndex((exercise) => {
    const planned = setCounts[exercise.slug] ?? 1;
    return (setRows[exercise.slug] || []).filter((row) => row?.done).length < planned;
  });

  const finish = async () => {
    setFinishError(null);
    const wallSeconds = Math.max(0, Math.floor((nowMs() - timerStartRef.current) / 1000));
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
          if (r && r.reps != null && r.reps > 0 && (!requiresLoad(slug) || parseFloat(r.weight) > 0)) {
            const saved = await logSet(slug, i, {
              done: true,
              ...(handedCapable(slug) && handModeOf(slug) === "one" && !r.variation ? { variation: "hand:left" } : {}),
              ...(handedCapable(slug) && handModeOf(slug) === "both" && !r.variation ? { variation: "hand:both" } : {}),
            });
            if (!saved) allSetsSaved = false;
          }
        }
      }
      // <5min with data = probably backfilling an old workout — save the sets
      // but don't inflate the duration stat.
      // <5min = backfilled/quick entry — save the sets but don't record a
      // duration (endedAt = startedAt → 0 length, not a fake minute).
      const localEndedAt = new Date((recordedStartRef.current || startRef.current) + (wallSeconds < 300 ? 0 : wallSeconds * 1000)).toISOString();
      try {
        const db = getOfflineDB();
        await db.workoutSessions.update(sessionId, {
          endedAt: localEndedAt,
          endedReason: "completed",
          syncState: "pending",
          updatedAt: new Date().toISOString(),
        });
        void syncPendingWorkouts();
      } catch { /* local session may not be available during an upgrade */ }
      let endedResponse = await fetch("/workout-session", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, end: true, endAt: localEndedAt }),
      }).catch(() => null);
      if (!endedResponse || !endedResponse.ok) {
        endedResponse = await fetch("/api/workout/sessions", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionId, end: true, endAt: localEndedAt }),
        }).catch(() => null);
      }
      const ended = Boolean(endedResponse?.ok);
      if (!ended && !allSetsSaved) {
        setFinishError("The workout could not save locally or online. Check storage/connection and try Finish again.");
        return;
      }
      setFinalDuration(wallSeconds);
    } else {
      setFinishError("No workout session was created, so this workout was not saved. Check your connection and restart it.");
      return;
    }
    try { localStorage.removeItem("waqt:workout-live"); } catch { /* noop */ }
    window.dispatchEvent(new Event("waqt:workout-live-changed"));
    setFinished(true);
  };

  // Cancel = delete the session entirely — no history entry, no sets saved.
  // Persist the in-session reorder back to the profile — the day's sortOrder
  // IS the position the algorithm reads, so arrows teach it the real order.
  const changeSessionDate = (v: string) => {
    if (!v) return;
    setSessionDate(v);
    const [y, m, dd] = v.split("-").map(Number);
    const d0 = new Date(recordedStartRef.current || Date.now());
    d0.setFullYear(y, m - 1, dd);
    recordedStartRef.current = d0.getTime();
    const iso = d0.toISOString();
    if (sessionId) void getOfflineDB().workoutSessions.update(sessionId, { startedAt: iso, syncState: "pending", updatedAt: iso }).catch(() => {});
    void fetch("/workout-session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId, startedAt: iso }) }).catch(() => null);
  };

  const persistOrder = async (ordered: DayExercise[]) => {
    // Session-scoped only — adding/removing exercises mid-workout must NOT
    // rewrite the day profile. The template is edited from /workout, not here.
    const sessionSave = sessionId ? fetch("/api/workout/sessions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, exerciseOrder: Object.fromEntries(ordered.map((exercise, index) => [exercise.slug, index])) }),
    }).catch(() => null) : Promise.resolve(null);
    await sessionSave;
  };

  const cancel = async () => {
    if (sessionId) {
      let deleted = await fetch(`/workout-session?id=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
      if (!deleted?.ok) deleted = await fetch(`/api/workout/sessions?id=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null);
    }
    try { localStorage.removeItem("waqt:workout-live"); } catch { /* noop */ }
    window.dispatchEvent(new Event("waqt:workout-live-changed"));
    router.push("/workout");
  };

  const saveReadiness = async () => {
    if (!sessionId) return;
    setReadinessSaving(true);
    setReadinessError(null);
    const response = await fetch("/api/workout/sessions", {
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
    }).catch(() => null);
    if (!response?.ok) {
      setReadinessError("Could not save. Check your connection and try again.");
      setReadinessSaving(false);
      return;
    }
    setReadinessSaving(false);
    setReadinessOpen(false);
  };

  const addExercise = (exercise: DayExercise) => {
    if (exercises.some((item) => item.slug === exercise.slug)) return;
    const next = [...exercises, exercise];
    setExercises(next);
    setSetCounts((counts) => ({ ...counts, [exercise.slug]: 1 }));
    void persistOrder(next);
    setExercisePickerOpen(false);
  };

  const addCustomExercise = () => {
    const name = customExerciseName.trim();
    if (!name) return;
    addExercise({
      slug: `custom-${crypto.randomUUID()}`,
      name,
      sets: 1,
      reps: "8-12",
      supersetGroup: null,
    });
    setCustomExerciseName("");
    setCustomExerciseOpen(false);
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
        {exercises.length > 0 && (
          <div className="mx-auto mt-4 max-w-xs space-y-1 text-left">
            {exercises.map((x) => {
              const done = (setRows[x.slug] || []).filter((r) => r?.done).length;
              if (!done) return null;
              const best = (setRows[x.slug] || []).reduce((m, r) => (r?.done && parseFloat(r.weight || "0") > (m || 0) ? parseFloat(r.weight) : m), 0);
              return (
                <div key={x.slug} className="flex justify-between rounded-lg border px-3 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)" }}>
                  <span style={{ color: "var(--color-ink)" }}>{x.name}</span>
                  <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{done} {done === 1 ? "set" : "sets"}{best ? ` · top ${dispW(best)}${units}` : ""}</span>
                </div>
              );
            })}
          </div>
        )}
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
      <div className="sticky top-2 z-30 rounded-2xl border p-3 shadow-sm backdrop-blur"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{dayName || "Workout"}</h1>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              {sessionId ? `${totalDone}/${totalPlanned} sets logged` : "Starting your session…"}
              {" · "}
              <label className="inline-flex items-center gap-1">
                for
                <input type="date" value={sessionDate}
                  onChange={(e) => changeSessionDate(e.target.value)}
                  className="w-[7.5rem] rounded border px-1 py-0.5 text-[10px]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
              </label>
            </p>
          </div>
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
          <span className="rounded-full border px-3 py-1 text-xs font-semibold tabular-nums" style={{ borderColor: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)", color: "var(--color-ink)" }}>
            {fmt(elapsed)}
          </span>
          <button type="button" onClick={() => void finish()} disabled={!sessionId}
            className="hidden rounded-full px-3 py-1.5 text-[10px] font-semibold sm:inline-block"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", opacity: sessionId ? 1 : 0.45 }}>
            Finish
          </button>
          <button type="button" onClick={() => { setPickerMode("routine"); setExercisePickerOpen(true); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
            title="Add exercise" aria-label="Add exercise">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setLeaveAsk(true)} className="rounded-full border px-2 py-1 text-[10px]"
            style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }} title="Leave — deletes this session">
            ✕
          </button>
        </div>
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
                ["sleepHours", "Sleep", 0, 12, 0.5, "0 = none · 8 = usually restorative"],
                ["energy", "Energy", 1, 10, 1, "1 = exhausted · 10 = exceptional"],
                ["soreness", "Soreness", 1, 10, 1, "1 = none · 10 = severe/limiting movement"],
                ["stress", "Stress", 1, 10, 1, "1 = calm · 10 = overwhelmed"],
              ] as const).map(([key, label, min, max, step, meaning]) => {
                const value = readiness[key] || (key === "sleepHours" ? "8" : "5");
                return (
                  <label key={key} className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    <span className="flex items-center justify-between"><span>{label}</span><b style={{ color: "var(--color-ink)" }}>{value}</b></span>
                    <input type="range" min={min} max={max} step={step} value={value}
                      onChange={(e) => setReadiness((r) => ({ ...r, [key]: e.target.value }))}
                      className="mt-2 w-full accent-[var(--color-accent)]" />
                    <span className="mt-0.5 block text-[9px]" style={{ color: "var(--color-ink-faint)" }}>{meaning}</span>
                  </label>
                );
              })}
            </div>
            {readinessError && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{readinessError}</p>}
            <button type="button" onClick={() => void saveReadiness()}
              disabled={readinessSaving}
              className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", opacity: readinessSaving ? 0.6 : 1 }}>
              {readinessSaving ? "Saving…" : "Save context"}
            </button>
          </div>
        </div>
      )}
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {totalDone}/{totalPlanned} sets · {restLeft > 0 ? `rest ${fmt(restLeft)}` : "rest timer starts after a set"}
      </p>
      <div className="mt-2 flex gap-1" aria-label={`${totalDone} of ${totalPlanned} sets complete`}>
        {Array.from({ length: Math.max(totalPlanned, 1) }, (_, index) => (
          <span key={index} className="h-1 flex-1 rounded-full"
            style={{ backgroundColor: index < totalDone ? "var(--color-accent)" : "var(--color-paper-3)" }} />
        ))}
      </div>
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
          const displayName = ex?.name || x.name;
          const rows = setRows[x.slug] || [];
          return (
            <div key={x.slug} className="overflow-hidden rounded-2xl border shadow-sm"
              style={{
                borderColor: x.supersetGroup != null || xi === activeExerciseIndex ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: xi === activeExerciseIndex ? "color-mix(in oklab, var(--color-accent) 3%, var(--color-paper))" : "var(--color-paper)",
              }}>
              {xi === activeExerciseIndex && (
                <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
                  style={{ borderColor: "color-mix(in oklab, var(--color-accent) 25%, transparent)", color: "var(--color-accent)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "var(--color-accent)" }} />
                  Next movement
                </div>
              )}
              <div className="p-3">
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
                    <span className="rounded-full border px-1.5 py-0.5 text-[9px] tabular-nums" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-faint)" }}>
                      {xi + 1}/{exercises.length}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{displayName}</span>
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
              {handedCapable(x.slug) && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "color-mix(in oklab, var(--color-paper-2) 55%, transparent)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>How are you lifting?</span>
                  {(["both", "one"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setHandMode(x.slug, mode)}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        borderColor: handModeOf(x.slug) === mode ? "var(--color-accent)" : "var(--color-paper-3)",
                        color: handModeOf(x.slug) === mode ? "var(--color-accent)" : "var(--color-ink-muted)",
                        backgroundColor: handModeOf(x.slug) === mode ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
                      }}>
                      {mode === "both" ? "2 hands" : "1 hand"}
                    </button>
                  ))}
                  <span className="ml-auto text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                    {handModeOf(x.slug) === "one" ? "choose L/R per set" : "bilateral load"}
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
                {Array.from({ length: (setCounts[x.slug] ?? 1) * ((handedCapable(x.slug) && handModeOf(x.slug) === "one") ? 2 : 1) }, (_, slot) => {
                  const oneHand = handedCapable(x.slug) && handModeOf(x.slug) === "one";
                  const logicalIndex = oneHand ? Math.floor(slot / 2) : slot;
                  const rowIndex = oneHand ? logicalIndex * 2 + (slot % 2) : logicalIndex;
                  const side = slot % 2 === 0 ? "left" : "right";
                  const row = rows[rowIndex] || { weight: "", reps: null, done: false, setType: "working" as const, variation: oneHand ? `hand:${side}` : "hand:both" };
                  const prev = prevSets[x.slug]?.[logicalIndex];
                  return (
                    <div key={rowIndex} className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors"
                      style={{
                        backgroundColor: row.done ? "color-mix(in oklab, var(--color-success) 12%, transparent)" : oneHand ? "color-mix(in oklab, var(--color-accent) 4%, transparent)" : "transparent",
                        ...(oneHand ? {
                          borderLeft: `2px solid ${side === "left" ? "var(--color-accent)" : "var(--color-warmth, var(--color-accent))"}`,
                          marginBottom: side === "right" ? 4 : 0,
                          borderTopLeftRadius: side === "left" ? 6 : 0,
                          borderBottomLeftRadius: side === "right" ? 6 : 0,
                        } : {}),
                      }}>
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
                        disabled={!row.done && (requiresLoad(x.slug) && !(parseFloat(row.weight) > 0) || !(row.reps && row.reps > 0))}
                        onClick={() => void logSet(x.slug, rowIndex, { done: !row.done })}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          borderColor: row.done ? "var(--color-success)" : "var(--color-paper-3)",
                          backgroundColor: row.done ? "var(--color-success)" : "var(--color-paper-2)",
                          color: row.done ? "var(--color-paper)" : "var(--color-ink)",
                          minHeight: 36,
                          opacity: !row.done && ((requiresLoad(x.slug) && !(parseFloat(row.weight) > 0)) || !(row.reps && row.reps > 0)) ? 0.5 : 1,
                        }}
                      >
                        {row.done ? "Done ✓" : (requiresLoad(x.slug) && !(parseFloat(row.weight) > 0) ? "Enter weight" : "Log")}
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
            </div>
          );
        })}
      </div>

      <button type="button" onClick={finish}
        className="mt-6 w-full rounded-xl px-4 py-3.5 text-sm font-semibold"
        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
        Finish workout
      </button>

      <button type="button" onClick={() => { setPickerMode("routine"); setExercisePickerOpen(true); }}
        className="mx-auto mt-3 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold"
        style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
        <Plus className="h-3.5 w-3.5" /> Add another exercise
      </button>

      {exercisePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setExercisePickerOpen(false)}>
          <div className="max-h-[82vh] w-full max-w-lg overflow-hidden rounded-t-3xl border sm:rounded-3xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--color-paper-3)" }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Add to this session</p>
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Choose a saved movement or create one for this routine.</p>
              </div>
              <button type="button" onClick={() => setExercisePickerOpen(false)} aria-label="Close exercise picker"
                className="rounded-full p-2" style={{ color: "var(--color-ink-muted)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b p-3" style={{ borderColor: "var(--color-paper-3)" }}>
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "var(--color-paper-3)" }}>
                <Search className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
                <input value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)}
                  autoFocus placeholder="Search the exercise library…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-ink)" }} />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPickerMode("library")}
                  className="rounded-xl border px-3 py-2.5 text-xs font-semibold"
                  style={{ borderColor: pickerMode === "library" ? "var(--color-accent)" : "var(--color-paper-3)", color: pickerMode === "library" ? "var(--color-accent)" : "var(--color-ink-muted)" }}>
                  Other movements
                </button>
                <button type="button" onClick={() => { setExercisePickerOpen(false); setCustomExerciseOpen(true); }}
                  className="rounded-xl border border-dashed px-3 py-2.5 text-xs font-semibold"
                  style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
                  <Plus className="mr-1 inline h-3.5 w-3.5" /> Other custom
                </button>
              </div>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-3">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(() => {
                  const items = pickerMode === "routine"
                    ? availableExercises.map((exercise) => ({ slug: exercise.slug, name: exercise.name, muscle: "", equip: "", sets: exercise.sets, reps: exercise.reps }))
                    : EXERCISES.map((exercise) => ({ slug: exercise.slug, name: exercise.name, muscle: exercise.muscle, equip: exercise.equip, sets: 1, reps: "8-12" }));
                  return items
                  .filter((exercise) => !exercises.some((item) => item.slug === exercise.slug))
                  .filter((exercise) => !exerciseQuery.trim() || `${exercise.name} ${exercise.muscle} ${exercise.equip}`.toLowerCase().includes(exerciseQuery.toLowerCase()))
                  .slice(0, 60)
                  .map((exercise) => (
                    <button key={exercise.slug} type="button"
                      onClick={() => addExercise({ slug: exercise.slug, name: exercise.name, sets: exercise.sets, reps: exercise.reps, supersetGroup: null })}
                      className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-left"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}>
                      <span className="min-w-0 truncate text-xs">{exercise.name}</span>
                      <Plus className="ml-2 h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {customExerciseOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setCustomExerciseOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl border p-4 sm:rounded-3xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}
            onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Add another movement</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>It will be added to this routine and start with one set.</p>
            <input value={customExerciseName} onChange={(event) => setCustomExerciseName(event.target.value)}
              autoFocus placeholder="Exercise name"
              className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }} />
            <button type="button" onClick={addCustomExercise} disabled={!customExerciseName.trim()}
              className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", opacity: customExerciseName.trim() ? 1 : 0.45 }}>
              Add exercise
            </button>
          </div>
        </div>
      )}

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
