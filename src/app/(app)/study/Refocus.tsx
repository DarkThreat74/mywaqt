"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Focus, X } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";
import { useSoundscape } from "@/components/soundscape-context";
import { TECHNIQUES, playTechniqueAudio } from "./refocus-techniques";

/**
 * Refocus — a ~15-second visual reset for a wandering mind.
 *
 * Each press draws one of twenty techniques at random (never the same one
 * twice in a row). Each maps to a published attention mechanism — gaze
 * narrowing, smooth pursuit, bilateral saccades, accommodation, panoramic
 * release, paced sighing, nature micro-breaks — see refocus-techniques.tsx.
 *
 * While a technique runs, every other audio source is paused (the soundscape
 * engine via suspend, talks via the DOM <audio> element) and resumed when
 * it ends. Esc or the × exits early.
 */

export default function Refocus({ compact = false }: { compact?: boolean }) {
  const { play } = useUISFX();
  const soundscape = useSoundscape();
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [techIdx, setTechIdx] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const lastIdxRef = useRef(-1);
  const stopAudioRef = useRef<(() => void) | null>(null);
  // Whatever we silenced, so it can come back when the exercise ends.
  const restoreRef = useRef<{ soundscape: boolean; audios: HTMLAudioElement[] } | null>(null);
  const technique = TECHNIQUES[techIdx];

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    // Hand the other audio back — soundscape resumes, paused <audio> replays.
    const restore = restoreRef.current;
    restoreRef.current = null;
    if (restore) {
      // Only ever resume here — a stale togglePause captured before we paused
      // would suspend again instead. Guard on the live paused flag.
      if (restore.soundscape && soundscape.paused) soundscape.togglePause();
      for (const el of restore.audios) void el.play().catch(() => {});
    }
    setRunning(false);
    setElapsedMs(0);
  }, [soundscape]);
  // stop() is recreated whenever the soundscape context object changes (the
  // provider hands down a fresh value object on every state change). Effects
  // must call it through a ref or pausing the soundscape mid-run would fire
  // the cleanup and kill the exercise.
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; });

  function begin() {
    play("play");
    // Pick a technique — any but the one that just ran.
    let next = Math.floor(Math.random() * TECHNIQUES.length);
    if (TECHNIQUES.length > 1 && next === lastIdxRef.current) {
      next = (next + 1 + Math.floor(Math.random() * (TECHNIQUES.length - 1))) % TECHNIQUES.length;
    }
    lastIdxRef.current = next;
    setTechIdx(next);
    setElapsedMs(0);
    const tech = TECHNIQUES[next];

    // Open the overlay FIRST — ducking audio must never be able to block it
    // (a suspended AudioContext or a provider hiccup would otherwise leave
    // sounds paused with nothing on screen).
    startRef.current = performance.now();
    setRunning(true);

    // Silence everything else — soundscapes suspend, talks pause. Each step
    // is best-effort so one failing source can't take the whole exercise down.
    try {
      const audios = Array.from(document.querySelectorAll("audio"))
        .filter((el) => !el.paused);
      for (const el of audios) {
        try { el.pause(); } catch { /* one bad element can't stop the rest */ }
      }
      let resumeSoundscape = false;
      try {
        resumeSoundscape = !!soundscape.active && !soundscape.paused;
        if (resumeSoundscape) soundscape.togglePause();
      } catch { resumeSoundscape = false; }
      restoreRef.current = { soundscape: resumeSoundscape, audios };
    } catch { /* ducking is best-effort */ }

    try {
      stopAudioRef.current = playTechniqueAudio(tech.audio);
    } catch { /* silent exercise beats no exercise */ }
    const tick = () => {
      const t = performance.now() - startRef.current;
      setElapsedMs(t);
      if (t < tech.duration) rafRef.current = requestAnimationFrame(tick);
      // Fresh stop via ref — the closure-captured stop holds a togglePause
      // that predates our pause and would re-suspend instead of resuming.
      else stopRef.current();
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stopRef.current(); };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the overlay — otherwise the background scrolls
    // under your thumb on mobile.
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [running]);

  // Unmount cleanup only — see stopRef note above.
  useEffect(() => () => stopRef.current(), []);

  const t = Math.min(elapsedMs / technique.duration, 1);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const step = [...technique.steps].reverse().find((s) => elapsedMs >= s.at)?.label
    ?? technique.steps[0].label;
  const remain = Math.ceil((technique.duration - elapsedMs) / 1000);

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
          aria-label={`Refocus exercise: ${technique.name}`}
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

          {/* Stage — full viewport so movement uses the whole visual field */}
          <div className="relative h-[60dvh] w-full overflow-hidden">
            <technique.Scene t={t} rm={reducedMotion} />
          </div>

          <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
            {technique.name}
          </p>
          <p className="mt-2 max-w-[280px] text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {step}
          </p>
          <p className="mt-1 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {remain}s
          </p>
        </div>
      )}
    </>
  );
}
