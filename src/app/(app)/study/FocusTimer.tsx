"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Plus } from "lucide-react";

type Mode = "pomodoro" | "stopwatch";

const PRESETS = [
  { label: "25 / 5", work: 25 * 60, rest: 5 * 60 },
  { label: "50 / 10", work: 50 * 60, rest: 10 * 60 },
  { label: "15 / 3", work: 15 * 60, rest: 3 * 60 },
];

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function FocusTimer() {
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [preset, setPreset] = useState(0);
  const [phase, setPhase] = useState<"work" | "rest">("work");
  const [seconds, setSeconds] = useState(PRESETS[0].work);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // stopwatch
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      if (mode === "stopwatch") {
        setElapsed((e) => e + 1);
      } else {
        setSeconds((s) => {
          if (s > 1) return s - 1;
          // Phase complete — switch work↔rest, notify
          if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
          const p = PRESETS[preset];
          const next = phaseRef.current === "work" ? "rest" : "work";
          setPhase(next);
          return next === "work" ? p.work : p.rest;
        });
      }
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, preset]);

  function selectPreset(i: number) {
    setPreset(i);
    setPhase("work");
    setSeconds(PRESETS[i].work);
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    if (mode === "stopwatch") {
      setElapsed(0);
    } else {
      setPhase("work");
      setSeconds(PRESETS[preset].work);
    }
  }

  const shown = mode === "stopwatch" ? elapsed : seconds;
  const total = mode === "pomodoro" ? (phase === "work" ? PRESETS[preset].work : PRESETS[preset].rest) : 0;
  const progress = total > 0 ? 1 - seconds / total : 0;

  return (
    <div>
      {/* Mode switch */}
      <div className="mb-5 flex gap-2">
        {(["pomodoro", "stopwatch"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setRunning(false); }}
            className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors"
            style={{
              borderColor: mode === m ? "var(--color-accent)" : "var(--color-paper-3)",
              color: mode === m ? "var(--color-accent)" : "var(--color-ink-muted)",
              backgroundColor: mode === m ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "var(--color-paper)",
              minHeight: 40,
            }}
          >
            {m === "pomodoro" ? "Pomodoro" : "Stopwatch"}
          </button>
        ))}
      </div>

      {/* Presets */}
      {mode === "pomodoro" && (
        <div className="mb-5 flex gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => selectPreset(i)}
              className="flex-1 rounded-lg border px-2 py-2 text-xs font-medium tabular-nums transition-colors"
              style={{
                borderColor: preset === i ? "var(--color-accent)" : "var(--color-paper-3)",
                color: preset === i ? "var(--color-accent)" : "var(--color-ink-muted)",
                backgroundColor: preset === i ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "var(--color-paper)",
                minHeight: 40,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Face */}
      <div
        className="flex flex-col items-center rounded-2xl border py-10"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: phase === "rest" && mode === "pomodoro" ? "var(--color-accent-faint)" : "var(--color-paper-2)",
        }}
      >
        <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          {mode === "stopwatch" ? "elapsed" : phase === "work" ? "focus" : "rest"}
        </p>
        <p className="mt-2 text-6xl font-bold tabular-nums leading-none" style={{ color: "var(--color-ink)" }}>
          {fmt(shown)}
        </p>

        {/* Progress bar (pomodoro only) */}
        {mode === "pomodoro" && (
          <div className="mt-5 h-1 w-40 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress * 100}%`, backgroundColor: phase === "work" ? "var(--color-accent)" : "var(--color-success)" }}
            />
          </div>
        )}

        {/* Controls */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={reset}
            className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:bg-[var(--color-paper-3)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            aria-label="Reset timer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex h-14 w-14 items-center justify-center rounded-full transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            aria-label={running ? "Pause" : "Start"}
          >
            {running ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          {mode === "pomodoro" && phase === "work" ? (
            <button
              onClick={() => setSeconds((s) => s + 5 * 60)}
              className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:bg-[var(--color-paper-3)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
              aria-label="Add 5 minutes"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-11" />
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Work in focused sprints, then take the break — it&apos;s part of the method,
        not a failure. The timer vibrates when a phase ends.
      </p>
    </div>
  );
}
