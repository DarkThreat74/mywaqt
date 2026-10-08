"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Focus, X } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

/**
 * Refocus — a 15-second visual reset for a wandering mind.
 *
 * Built on the visual-attention research: narrow gaze fixation triggers the
 * acetylcholine "attention spotlight" (visual focus precedes mental focus);
 * smooth-pursuit left↔right sweeps drive bilateral eye movements (the
 * EMDR-style dual-attention stimulus that measurably improves visual
 * attention); widening to panoramic vision afterward releases the arousal
 * spike so you return calm-but-alert. Sound: a rising sine swell into a soft
 * bell — synthesized on-device, separate from the soundscape engine so it
 * layers over whatever's already playing.
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
  master.gain.value = 0.16;
  master.connect(ctx.destination);

  const nodes: AudioNode[] = [];

  // Rising swell across the fixation + tracking phases
  const swell = ctx.createOscillator();
  const swellGain = ctx.createGain();
  swell.type = "sine";
  swell.frequency.setValueAtTime(196, ctx.currentTime); // G3
  swell.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 11); // E4
  swellGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  swellGain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2);
  swellGain.gain.setValueAtTime(0.5, ctx.currentTime + 10.5);
  swellGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 14.5);
  swell.connect(swellGain).connect(master);
  swell.start();
  swell.stop(ctx.currentTime + 15);
  nodes.push(swell, swellGain);

  // Soft "tick" pulse during the pursuit phase — one per sweep reversal
  for (const t of [5.5, 6.5, 7.5, 8.5, 9.5, 10.5]) {
    const tick = ctx.createOscillator();
    const g = ctx.createGain();
    tick.type = "triangle";
    tick.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
    tick.connect(g).connect(master);
    tick.start(ctx.currentTime + t);
    tick.stop(ctx.currentTime + t + 0.2);
    nodes.push(tick, g);
  }

  // Resolution bell at the end (E5 + octave shimmer)
  for (const [freq, vol, delay] of [[659, 0.5, 11.5], [1318, 0.18, 11.6]] as const) {
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
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const stopAudioRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    setRunning(false);
    setElapsedMs(0);
  }, []);

  function begin() {
    play("play");
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
  // t in [0,1]. Phase 1 (0–0.33): dot pinned dead center, halo contracts.
  // Phase 2 (0.33–0.73): dot sweeps horizontally — sine, ~3 full round trips.
  // Phase 3 (0.73–1): dot fades, rings bloom outward to the edges.
  const t = Math.min(elapsedMs / TOTAL_MS, 1);
  const inPursuit = t >= 0.33 && t < 0.73;
  const inExpand = t >= 0.73;

  // prefers-reduced-motion: shrink the sweep to a gentle drift — the exercise
  // still runs, it just doesn't throw the dot across the screen.
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const sweep = reducedMotion ? 10 : 38;
  const dotX = inPursuit || inExpand
    ? Math.sin(((t - 0.33) / 0.4) * Math.PI * 6) * sweep // ±sweep% of stage width
    : 0;
  const haloScale = t < 0.33 ? 1 - (t / 0.33) * 0.55 : 0.45;
  const dotOpacity = inExpand ? Math.max(0, 1 - (t - 0.73) / 0.14) : 1;

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
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Refocus exercise"
          style={{ backgroundColor: "var(--color-ink)", overflow: "hidden" }}
        >
          <button
            onClick={stop}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ color: "var(--color-paper)" }}
            aria-label="End refocus"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Stage */}
          <div className="relative h-64 w-full max-w-md">
            {/* Fixation halo — contracts toward the dot in phase 1 */}
            {!inExpand && (
              <div
                className="absolute left-1/2 top-1/2 h-40 w-40 rounded-full"
                style={{
                  border: "1px solid color-mix(in oklab, var(--color-accent) 40%, transparent)",
                  transform: `translate(-50%, -50%) scale(${haloScale})`,
                  opacity: 0.6,
                }}
              />
            )}

            {/* The dot */}
            <div
              className="absolute top-1/2 h-5 w-5 rounded-full"
              style={{
                left: `${50 + dotX}%`,
                backgroundColor: "var(--color-accent)",
                boxShadow: "0 0 24px 6px color-mix(in oklab, var(--color-accent) 45%, transparent)",
                transform: "translate(-50%, -50%)",
                opacity: dotOpacity,
              }}
            />

            {/* Panoramic rings — bloom outward in the final phase */}
            {inExpand && [0.4, 0.7, 1].map((size, i) => {
              const p = Math.min(Math.max((t - 0.73 - i * 0.05) / 0.25, 0), 1);
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: "180%",
                    paddingTop: "180%",
                    border: "1px solid color-mix(in oklab, var(--color-accent) 30%, transparent)",
                    transform: `translate(-50%, -50%) scale(${p * size})`,
                    opacity: p * 0.8,
                  }}
                />
              );
            })}
          </div>

          <p className="mt-8 text-sm font-medium" style={{ color: "var(--color-paper)" }}>
            {phaseLabel}
          </p>
          <p className="mt-1 text-xs tabular-nums" style={{ color: "color-mix(in oklab, var(--color-paper) 55%, transparent)" }}>
            {remain}s
          </p>
        </div>
      )}
    </>
  );
}
