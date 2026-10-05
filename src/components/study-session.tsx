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
import { BookOpen, Check, Loader2, Minus, Play, Plus, Sparkles, Square, X } from "lucide-react";
import {
  getSession, subscribeSession, hydrateSession, confirmSession,
  discardPlan, endSession, extendSession, setOverlayOpen, segmentAt,
  planSession, type StudyMethod,
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

  useEffect(() => { hydrateSession(); }, []);

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

  if (state.status === "idle") return null;

  // ── Intake — confirm each assignment's time + pick a method ──
  if (state.status === "intake") {
    return <IntakeSheet />;
  }

  // ── Planning spinner ──
  if (state.status === "planning") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 35%, transparent)" }}>
        <div className="flex items-center gap-2.5 rounded-2xl border px-5 py-4" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-accent)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Vox is planning your session…</p>
        </div>
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
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              Vox&apos;s plan · {total} min
            </p>
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

  // Finish check — shown from both the bubble and the full overlay.
  const finishDialog = askFinish ? (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="End session">
      <button className="absolute inset-0" style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }} onClick={() => setAskFinish(false)} aria-label="Back" />
      <div className="relative w-full max-w-sm rounded-t-2xl border-t p-5 sm:rounded-2xl sm:border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)" }}>
        <p className="text-center text-base font-semibold" style={{ color: "var(--color-ink)" }}>
          {progress.done ? "All done?" : "Ending early — did you finish the assignment?"}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => { setAskFinish(false); endSession(); }}
            className="flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 48 }}
          >
            <Check className="h-4 w-4" /> Yes, finished
          </button>
          <button
            onClick={() => { setAskFinish(false); extendSession(5); }}
            className="rounded-full border py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)", minHeight: 48 }}
          >
            Not yet — 5 more minutes
          </button>
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
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} /> Vox
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
            {progress.done ? "Session complete" : isBreak ? "Break — books down" : "Studying"}
          </p>
          <p
            className="mt-2 text-6xl font-bold tabular-nums tracking-tight sm:text-7xl"
            style={{ color: isBreak ? "var(--color-success)" : "var(--color-ink)" }}
          >
            {fmtClock(progress.remainingSec)}
          </p>
          <p className="mt-3 max-w-[16rem] text-base font-medium" style={{ color: "var(--color-ink-soft)" }}>
            {progress.done ? "Nice work." : seg.label}
          </p>
          {isBreak && progress.remainingSec <= 5 && progress.remainingSec > 0 && (
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-success)" }} aria-live="assertive">
              Back to it in {progress.remainingSec}…
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
            Next: {next.minutes}m {next.kind === "break" ? "break" : next.label}
          </p>
        )}

        {/* Footer */}
        <div className="flex gap-2">
          {progress.done ? (
            <button
              onClick={endSession}
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
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            Vox · {state.minutes} min available
          </p>
          <button onClick={endSession} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>How long each takes</p>
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
            <Sparkles className="h-4 w-4" /> Plan my session
          </button>
        </div>
      </div>
    </div>
  );
}
