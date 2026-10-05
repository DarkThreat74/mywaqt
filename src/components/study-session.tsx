"use client";

/**
 * Vox study-session UI — mounted once in the (app) layout so the session
 * survives navigation. States:
 *  planning → loading overlay ("Vox is planning…")
 *  planned  → plan preview with Confirm / Discard
 *  running  → full overlay OR floating bubble (persists app-wide)
 *
 * Breaks end with a beep + countdown so the transition back to work is
 * impossible to miss.
 */

import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { BookOpen, Check, Coffee, Minus, Play, Plus, Shuffle, Square, X } from "lucide-react";
import VoxIcon from "@/components/vox-icon";
import {
  getSession, subscribeSession, hydrateSession, confirmSession,
  discardPlan, endSession, extendSession, setOverlayOpen, segmentAt,
  planSession, takeBreakNow, switchFocus, getDiscipline, recordOutcome,
  runningBlockId, type StudyMethod,
} from "@/lib/study/session";

let audioCtx: AudioContext | null = null;
function beep(freq = 880, dur = 0.12) {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch { /* audio unavailable — silent */ }
}

// Vox coach voice — strict, warm, short. Rotates per segment.
const COACH_STUDY = [
  "Eyes on the page. No phone.",
  "You chose this block — honor it.",
  "One task. Full effort.",
  "Bismillah. Deep breath, begin.",
  "Muscles for the mind — reps count.",
];
const COACH_BREAK = [
  "Stand up. Water. No scrolling.",
  "Real rest — away from the screen.",
  "Breathe. The work is still there.",
];

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudySession() {
  const state = useSyncExternalStore(subscribeSession, getSession, () => ({ status: "idle" }) as ReturnType<typeof getSession>);
  const [now, setNow] = useState(() => Date.now());
  const lastSegRef = useRef(-1);
  const lastBeepRef = useRef(-1);
  // End-session check — "did you finish?" before the session is discarded.
  const [askFinish, setAskFinish] = useState(false);
  // Auto-prompt the finish check once per session when the plan runs out —
  // keyed by startedAt so each new session asks again.
  const [donePromptedAt, setDonePromptedAt] = useState(0);

  useEffect(() => { hydrateSession(); }, []);

  // Keep the screen awake while a session runs. The lock auto-releases when
  // the tab hides, so re-acquire on every return to visible.
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (state.status !== "running") return;
    let active = true;
    const acquire = async () => {
      try {
        const s = await (navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        }).wakeLock?.request("screen") ?? null;
        // The request can resolve after cleanup ran — releasing immediately
        // instead of storing avoids leaking a lock the page can never drop.
        if (!active) { void s?.release().catch(() => {}); return; }
        wakeRef.current = s;
      } catch { /* low battery / unsupported browser */ }
    };
    void acquire();
    const onVis = () => {
      if (active && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [state.status]);

  // 1s tick while a session is live
  useEffect(() => {
    if (state.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  // Segment transitions + break-end countdown beeps
  const progress = state.status === "running"
    ? segmentAt(state.segments, Math.floor((now - state.startedAt) / 1000))
    : null;
  useEffect(() => {
    if (!progress || state.status !== "running") return;
    if (progress.index !== lastSegRef.current) {
      lastSegRef.current = progress.index;
      lastBeepRef.current = -1;
      // Two-tone chime on every transition; higher pitch back into study.
      beep(progress.segment.kind === "study" ? 1040 : 660, 0.15);
      setTimeout(() => beep(progress.segment.kind === "study" ? 1320 : 880, 0.15), 160);
      // OS notification when the app is in the background / another window —
      // the web can't tick while fully closed, so this covers minimize/tab-away.
      if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const title = progress.segment.kind === "break" ? "Break — books down" : "Back to studying";
        const body = `${progress.segment.minutes}m · ${progress.segment.label}`;
        navigator.serviceWorker?.ready
          .then((r) => r.showNotification(title, { body, tag: "waqt-study", data: { url: "/calendar/day" } }))
          .catch(() => { try { new Notification(title, { body, tag: "waqt-study" }); } catch { /* ignore */ } });
      }
      return;
    }
    // Last 5 seconds of a break — tick each second so returning is timed.
    if (progress.segment.kind === "break" && progress.remainingSec <= 5 && progress.remainingSec > 0) {
      if (lastBeepRef.current !== progress.remainingSec) {
        lastBeepRef.current = progress.remainingSec;
        beep(progress.remainingSec === 1 ? 1320 : 980, 0.09);
      }
    }
  }, [progress, state.status]);

  // Timer's up → the checkoff is mandatory (adjust-during-render reset pattern).
  if (state.status === "running" && progress?.done && donePromptedAt !== state.startedAt) {
    setDonePromptedAt(state.startedAt);
    setAskFinish(true);
  }

  /** Close the session and record the outcome — finishing grows the focus
   *  streak and auto-marks the source block worked; quitting breaks it. */
  const finish = (finished: boolean) => {
    setAskFinish(false);
    recordOutcome(finished);
    const bid = runningBlockId();
    if (finished && bid) {
      void fetch("/api/blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bid, status: "worked" }),
      }).catch(() => { /* cosmetic — block stays unmarked */ });
    }
    endSession();
  };

  if (state.status === "idle") return null;

  // ── Intake — confirm each assignment's time + pick a method ──
  if (state.status === "intake") {
    return <IntakeSheet />;
  }

  // ── Vox thinking ──
  if (state.status === "planning") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }}>
        <ThinkingCard />
      </div>
    );
  }

  // ── Plan preview — nothing starts until Confirm ──
  if (state.status === "planned") {
    const total = state.segments.reduce((s, x) => s + x.minutes, 0);
    return (
      <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Study session plan">
        <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }} onClick={discardPlan} aria-label="Discard plan" />
        <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <VoxIcon size={16} />
                Vox&apos;s plan · {total} min
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                Hardest work first while you&apos;re fresh — I&apos;ve paced the rest.
              </p>
            </div>
            <button onClick={discardPlan} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Discard plan">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <ol className="flex flex-col gap-1.5">
              {state.segments.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: "var(--color-paper-3)",
                    backgroundColor: s.kind === "break" ? "transparent" : "var(--color-paper-2)",
                    borderStyle: s.kind === "break" ? "dashed" : "solid",
                  }}
                >
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: s.kind === "break" ? "var(--color-ink-muted)" : "var(--color-accent)" }}>
                    {s.minutes}m
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: s.kind === "break" ? "var(--color-ink-muted)" : "var(--color-ink)" }}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmSession}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
              >
                <Play className="h-4 w-4" /> Start
              </button>
              <button
                onClick={discardPlan}
                className="rounded-full px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 44 }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Running ──
  if (!progress) return null;
  const seg = progress.segment;
  const isBreak = seg.kind === "break";
  const segAccent = isBreak ? "var(--color-success)" : "var(--color-accent)";

  // Finish check — mandatory checkoff when the timer ends, streak-costed
  // when quitting early. Shown from both the bubble and the full overlay.
  const discipline = getDiscipline();
  const finishDialog = askFinish ? (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="End session">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setAskFinish(false)} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <p className="text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
          {progress.done ? "Time&apos;s up — did you finish?" : "Ending early — did you finish?"}
        </p>
        {discipline.streak > 0 && (
          <p className="mt-1.5 text-center text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
            Finishing keeps your {discipline.streak}-session focus streak — quitting breaks it.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => finish(true)}
            className="flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
          >
            <Check className="h-4 w-4" /> Yes, finished
          </button>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
            Not yet — how much more?
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 15, 20].map((m) => (
              <button
                key={m}
                onClick={() => { setAskFinish(false); setDonePromptedAt(0); extendSession(m); }}
                className="rounded-full border py-2.5 text-sm font-semibold tabular-nums transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)", minHeight: 44 }}
              >
                +{m}m
              </button>
            ))}
          </div>
          {!progress.done && (
            <button
              onClick={() => finish(false)}
              className="mt-1 text-center text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              End anyway — I didn&apos;t finish
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // Bubble — persists while overlay is closed
  if (!state.overlayOpen) {
    return (
      <>
        {finishDialog}
        <div className="fixed bottom-20 right-3 z-[60] lg:bottom-6 lg:right-6" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center gap-1 rounded-full border shadow-lg" style={{ backgroundColor: "var(--color-ink)", borderColor: "transparent" }}>
          <button
            onClick={() => setOverlayOpen(true)}
            className="flex items-center gap-2 rounded-l-full py-2.5 pl-3.5 pr-2"
            style={{ color: "var(--color-paper)", minHeight: 44 }}
            aria-label={`Open study session — ${seg.label}, ${fmtClock(progress.remainingSec)} left`}
          >
            <BookOpen className="h-4 w-4 shrink-0" style={{ color: segAccent }} />
            <span className="text-xs font-semibold tabular-nums">{fmtClock(progress.remainingSec)}</span>
            <span className="max-w-[7rem] truncate text-[11px] opacity-80">{seg.label}</span>
          </button>
          <button
            onClick={() => setAskFinish(true)}
            className="rounded-r-full p-2.5 pr-3.5 opacity-70 transition-opacity hover:opacity-100"
            style={{ color: "var(--color-paper)", minHeight: 44 }}
            aria-label="End session"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      </>
    );
  }

  // Full overlay
  const elapsedInSeg = seg.minutes * 60 - progress.remainingSec;
  const pct = seg.minutes > 0 ? Math.min(100, (elapsedInSeg / (seg.minutes * 60)) * 100) : 100;
  const next = state.segments[progress.index + 1];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }} role="dialog" aria-modal="true" aria-label="Study session">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
            <VoxIcon size={14} /> Vox
          </p>
          <button
            onClick={() => setOverlayOpen(false)}
            className="rounded-md px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40 }}
          >
            Minimize
          </button>
        </div>

        {/* Current segment */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: segAccent }}
            aria-live="polite"
          >
            {progress.done ? "Session complete" : isBreak ? "Break — stretch, breathe" : "Stay with it"}
          </p>
          <p
            className="mt-2 text-6xl font-bold tabular-nums tracking-tight sm:text-7xl"
            style={{ color: isBreak ? "var(--color-success)" : "var(--color-ink)" }}
          >
            {fmtClock(progress.remainingSec)}
          </p>
          <p className="mt-3 max-w-[16rem] text-base font-medium" style={{ color: "var(--color-ink-soft)" }}>
            {progress.done ? "Nice work — go rest." : seg.label}
          </p>
          {isBreak && progress.remainingSec <= 5 && progress.remainingSec > 0 && (
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-success)" }} aria-live="assertive">
              Back to it in {progress.remainingSec}…
            </p>
          )}
          {/* Vox's coaching line — strict trainer voice, rotates per segment */}
          {!progress.done && (
            <p className="mt-3 text-[11px] font-medium italic" style={{ color: "var(--color-ink-muted)" }}>
              {(isBreak ? COACH_BREAK : COACH_STUDY)[progress.index % (isBreak ? COACH_BREAK : COACH_STUDY).length]}
            </p>
          )}

          {/* Progress bar for this segment */}
          <div className="mt-6 h-1.5 w-full max-w-[16rem] overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-1000"
              style={{ width: `${pct}%`, backgroundColor: segAccent }}
            />
          </div>
        </div>

        {/* Up next */}
        {next && !progress.done && (
          <p className="mb-3 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Next: {Math.round(next.minutes)}m {next.kind === "break" ? "break" : next.label}
          </p>
        )}

        {/* In-session rescue actions — break or switch without ending */}
        {!progress.done && !isBreak && (
          <div className="mb-3 flex justify-center gap-2">
            <button
              onClick={() => takeBreakNow(5)}
              className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 36 }}
            >
              <Coffee className="h-3.5 w-3.5" /> Quick break · 5m
            </button>
            {state.segments.some((s, i) => i > progress.index && s.kind === "study") && (
              <button
                onClick={switchFocus}
                className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 36 }}
              >
                <Shuffle className="h-3.5 w-3.5" /> Lost interest — switch it up
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2">
          {progress.done ? (
            <button
              onClick={() => setAskFinish(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
            >
              <Check className="h-4 w-4" /> Done
            </button>
          ) : (
            <button
              onClick={() => setAskFinish(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", minHeight: 48 }}
            >
              <Square className="h-4 w-4" /> End session
            </button>
          )}
        </div>
      </div>

      {finishDialog}
    </div>
  );
}

/** Pre-session intake — confirm how long each assignment needs and pick a
 *  method before Vox segments the block. */
function IntakeSheet() {
  const state = useSyncExternalStore(subscribeSession, getSession, () => ({ status: "idle" }) as ReturnType<typeof getSession>);
  const assignments = state.status === "intake" ? state.assignments : null;
  // Reseed the editable estimates whenever a new intake's list arrives —
  // adjusting state during render is the sanctioned reset pattern.
  const [prev, setPrev] = useState(assignments);
  const [ests, setEsts] = useState<(number | null)[]>(() => assignments?.map((a) => a.estimatedMinutes) ?? []);
  if (assignments !== prev) {
    setPrev(assignments);
    setEsts(assignments?.map((a) => a.estimatedMinutes) ?? []);
  }
  const [method, setMethod] = useState<StudyMethod>("auto");

  if (state.status !== "intake") return null;

  const discipline = getDiscipline();
  const startedLate = !!state.originalMinutes && state.minutes < state.originalMinutes;

  const bump = (i: number, delta: number) => {
    setEsts((prev) => prev.map((v, j) => j === i ? Math.min(180, Math.max(5, (v ?? 20) + delta)) : v));
  };

  const METHODS: { id: StudyMethod; label: string; hint: string }[] = [
    { id: "auto",     label: "Vox decides", hint: "balanced" },
    { id: "pomodoro", label: "Pomodoro",    hint: "25·5" },
    { id: "deep",     label: "Deep work",   hint: "long stretches" },
    { id: "review",   label: "Quick review",hint: "short sprints" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Set up study session">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }} onClick={endSession} aria-label="Cancel" />
      <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl border-t sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--color-paper-3)" }}>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              <VoxIcon size={16} />
              Vox
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              {startedLate
                ? `Running late — ${state.minutes} of ${state.originalMinutes} min left. I'll make it count.`
                : `I'll fit your work into ${state.minutes} min — help me get it right.`}
            </p>
            {discipline.streak > 0 && (
              <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--color-warmth)" }}>
                Focus streak: {discipline.streak} session{discipline.streak === 1 ? "" : "s"} — let&apos;s keep it alive.
              </p>
            )}
          </div>
          <button onClick={endSession} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>How long does each need?</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {state.assignments.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink)" }}>{a.title}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => bump(i, -5)} className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label={`Less time for ${a.title}`}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                    {ests[i] ? `${ests[i]}m` : "—"}
                  </span>
                  <button onClick={() => bump(i, 5)} className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label={`More time for ${a.title}`}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>Study method</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className="rounded-lg border px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: method === m.id ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: method === m.id ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "transparent",
                  minHeight: 44,
                }}
                aria-pressed={method === m.id}
              >
                <span className="block text-sm font-medium" style={{ color: method === m.id ? "var(--color-accent)" : "var(--color-ink)" }}>{m.label}</span>
                <span className="block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" style={{ borderColor: "var(--color-paper-3)" }}>
          <button
            onClick={() => void planSession(
              { minutes: state.minutes, method, assignments: state.assignments.map((a, i) => ({ title: a.title, estimatedMinutes: ests[i] })) },
              state.blockId,
            )}
            className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
          >
            <VoxIcon size={16} /> Plan my session
          </button>
        </div>
      </div>
    </div>
  );
}

/** Vox "thinking" card — cycling first-person phrases + pulsing dots while
 *  the plan is being generated. */
function ThinkingCard() {
  const PHRASES = [
    "Reading your assignments…",
    "Putting the hardest work first…",
    "Placing your breaks…",
    "Balancing the clock…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 1600);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex w-64 flex-col items-center gap-3 rounded-2xl border px-5 py-6 text-center" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
      <div className="animate-pulse">
        <VoxIcon size={24} withBadge />
      </div>
      <p key={i} className="min-h-[1.25rem] text-sm font-medium" style={{ color: "var(--color-ink)", animation: "voxFade .4s ease" }}>
        {PHRASES[i]}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-accent)", animation: `voxDot 1.2s ease-in-out ${d * 0.18}s infinite` }}
          />
        ))}
      </div>
      <style>{`
        @keyframes voxDot { 0%,100% { opacity:.25; transform:translateY(0) } 50% { opacity:1; transform:translateY(-3px) } }
        @keyframes voxFade { from { opacity:0; transform:translateY(3px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}
