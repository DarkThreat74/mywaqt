"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Focus, X } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";
import { useSoundscape } from "@/components/soundscape-context";

/**
 * Refocus — a 15-second visual reset for a wandering mind.
 *
 * Choreography is built on the visual-attention research:
 *  1. FIXATE (0–5s)   — narrow gaze on one small point triggers the
 *     acetylcholine "attention spotlight"; mental focus follows visual focus.
 *  2. TRACK  (5–11s)  — smooth-pursuit figure-8 sweep drives bilateral eye
 *     movements (the dual-attention stimulus that measurably improves visual
 *     attention after the exercise).
 *  3. WIDEN  (11–15s) — panoramic release: rings bloom to the screen edges so
 *     the arousal spike drops and you return calm-but-alert.
 *
 * Sound: a rising sine swell, pursuit ticks, and a resolving bell — its own
 * AudioContext. While it runs, every other audio source is paused (the
 * soundscape engine via suspend, talks via the DOM <audio> element) and
 * resumed when you come back.
 */

const TOTAL_MS = 15_000;

const PHASES = [
  { at: 0, label: "Fix your eyes on the dot" },
  { at: 5000, label: "Follow it — eyes only" },
  { at: 11000, label: "Widen — take in the whole screen" },
];

function playRefocusAudio(): () => void {
  const ctx = new AudioContext();
  // iOS Safari can hand you a suspended context even inside a tap handler.
  if (ctx.state === "suspended") void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);

  const nodes: AudioNode[] = [];

  // Rising swell across the fixation + tracking phases
  const swell = ctx.createOscillator();
  const swellGain = ctx.createGain();
  swell.type = "sine";
  swell.frequency.setValueAtTime(196, ctx.currentTime); // G3
  swell.frequency.exponentialRampToValueAtTime(392, ctx.currentTime + 10.5); // G4
  swellGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  swellGain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.8);
  swellGain.gain.setValueAtTime(0.5, ctx.currentTime + 10.5);
  swellGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 14.5);
  swell.connect(swellGain).connect(master);
  swell.start();
  swell.stop(ctx.currentTime + 15);
  nodes.push(swell, swellGain);

  // Soft "tick" on each pursuit reversal
  for (const t of [5.3, 6.3, 7.3, 8.3, 9.3, 10.3]) {
    const tick = ctx.createOscillator();
    const g = ctx.createGain();
    tick.type = "triangle";
    tick.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
    tick.connect(g).connect(master);
    tick.start(ctx.currentTime + t);
    tick.stop(ctx.currentTime + t + 0.2);
    nodes.push(tick, g);
  }

  // Resolution bell at the end (E5 + octave shimmer)
  for (const [freq, vol, delay] of [[659, 0.5, 11.4], [1318, 0.18, 11.5]] as const) {
    const bell = ctx.createOscillator();
    const g = ctx.createGain();
    bell.type = "sine";
    bell.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + delay + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 2.2);
    bell.connect(g).connect(master);
    bell.start(ctx.currentTime + delay);
    bell.stop(ctx.currentTime + delay + 2.4);
    nodes.push(bell, g);
  }

  return () => {
    try {
      for (const n of nodes) {
        try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ }
        try { n.disconnect(); } catch { /* not connected */ }
      }
      void ctx.close().catch(() => {});
    } catch { /* context already gone */ }
  };
}

export default function Refocus({ compact = false }: { compact?: boolean }) {
  const { play } = useUISFX();
  const soundscape = useSoundscape();
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const stopAudioRef = useRef<(() => void) | null>(null);
  // Whatever we silenced, so it can come back when the exercise ends.
  const restoreRef = useRef<{ soundscape: boolean; audios: HTMLAudioElement[] } | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    // Hand the other audio back — soundscape resumes, paused <audio> replays.
    const restore = restoreRef.current;
    restoreRef.current = null;
    if (restore) {
      if (restore.soundscape) soundscape.togglePause();
      for (const el of restore.audios) void el.play().catch(() => {});
    }
    setRunning(false);
    setElapsedMs(0);
  }, [soundscape]);

  function begin() {
    play("play");
    // Silence everything else first — soundscapes suspend, talks pause.
    const audios = Array.from(document.querySelectorAll("audio"))
      .filter((el) => !el.paused);
    for (const el of audios) el.pause();
    const resumeSoundscape = !!soundscape.active && !soundscape.paused;
    if (resumeSoundscape) soundscape.togglePause();
    restoreRef.current = { soundscape: resumeSoundscape, audios };

    stopAudioRef.current = playRefocusAudio();
    startRef.current = performance.now();
    setRunning(true);
    const tick = () => {
      const t = performance.now() - startRef.current;
      setElapsedMs(t);
      if (t < TOTAL_MS) rafRef.current = requestAnimationFrame(tick);
      else stop();
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the overlay — otherwise the background scrolls
    // under your thumb on mobile.
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [running, stop]);

  useEffect(() => () => stop(), [stop]);

  // ── Visual driver ──────────────────────────────────────────────────────────
  // t in [0,1]. Phase 1 (0–0.33): dot dead center, halo contracts, gentle pulse.
  // Phase 2 (0.33–0.73): figure-8 pursuit sweep — the eyes get a real path to
  // chase, not a flat line.
  // Phase 3 (0.73–1): dot blooms into a soft orb, rings expand to the edges.
  const t = Math.min(elapsedMs / TOTAL_MS, 1);
  const inPursuit = t >= 0.33 && t < 0.73;
  const inExpand = t >= 0.73;

  // prefers-reduced-motion: shrink the sweep to a gentle drift — the exercise
  // still runs, it just doesn't throw the dot across the screen.
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const sweep = reducedMotion ? 9 : 34;

  const pursue = (t - 0.33) / 0.4;
  // Figure-8 (lemniscate): x = sin(θ), y = sin(θ)·cos(θ) scaled smaller.
  const theta = pursue * Math.PI * 4; // two full loops
  const dotX = inPursuit ? Math.sin(theta) * sweep : inExpand ? 0 : 0;
  const dotY = inPursuit ? Math.sin(theta) * Math.cos(theta) * (sweep * 0.45) : 0;
  const haloScale = t < 0.33 ? 1 - (t / 0.33) * 0.5 : 0.5;
  // Fixation pulse — the dot breathes slightly so the eye keeps a live target.
  const pulse = t < 0.33 ? 1 + Math.sin(t * Math.PI * 20) * 0.08 : 1;
  // In the widen phase the dot grows into an orb instead of vanishing.
  const dotScale = inExpand ? 1 + ((t - 0.73) / 0.27) * 6 : pulse;
  const dotOpacity = inExpand ? Math.max(0.35, 1 - (t - 0.73) / 0.27) : 1;

  const phaseLabel = [...PHASES].reverse().find((p) => elapsedMs >= p.at)?.label ?? PHASES[0].label;
  const remain = Math.ceil((TOTAL_MS - elapsedMs) / 1000);

  return (
    <>
      <button
        onClick={begin}
        className={compact
          ? "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          : "mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"}
        style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: compact ? 36 : undefined }}
      >
        <Focus className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} />
        {compact ? "Refocus · 15s" : "Mind wandered? Refocus in 15s"}
      </button>

      {running && (
        <div
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Refocus exercise"
          style={{ backgroundColor: "var(--color-paper-2)", overflow: "hidden" }}
        >
          <button
            onClick={stop}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="End refocus"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Stage — full viewport so the sweep uses the whole screen */}
          <div className="relative h-[60dvh] w-full">
            {/* Fixation halo — contracts toward the dot in phase 1 */}
            {!inExpand && (
              <div
                className="absolute left-1/2 top-1/2 h-48 w-48 rounded-full"
                style={{
                  border: "1.5px solid color-mix(in oklab, var(--color-accent) 45%, transparent)",
                  backgroundColor: "color-mix(in oklab, var(--color-accent) 5%, transparent)",
                  transform: `translate(-50%, -50%) scale(${haloScale})`,
                }}
              />
            )}

            {/* The dot */}
            <div
              className="absolute top-1/2 rounded-full"
              style={{
                width: 28,
                height: 28,
                left: `calc(50% + ${dotX}vw)`,
                backgroundColor: "var(--color-accent)",
                boxShadow:
                  "0 0 18px 4px color-mix(in oklab, var(--color-accent) 55%, transparent), 0 0 48px 16px color-mix(in oklab, var(--color-accent) 25%, transparent)",
                transform: `translate(-50%, -50%) translateY(${dotY}vh) scale(${dotScale})`,
                opacity: dotOpacity,
              }}
            />

            {/* Panoramic rings — bloom outward in the final phase */}
            {inExpand && [0.45, 0.75, 1.05].map((size, i) => {
              const p = Math.min(Math.max((t - 0.73 - i * 0.05) / 0.25, 0), 1);
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: "140vw",
                    height: "140vw",
                    border: "1.5px solid color-mix(in oklab, var(--color-warmth) 35%, transparent)",
                    transform: `translate(-50%, -50%) scale(${p * size})`,
                    opacity: p * 0.7,
                  }}
                />
              );
            })}
          </div>

          <p className="mt-8 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {phaseLabel}
          </p>
          <p className="mt-1 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {remain}s
          </p>
        </div>
      )}
    </>
  );
}
