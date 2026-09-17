"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Square } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

/**
 * Guided breathing — box breathing (4-4-4-4) and 4-7-8.
 * A circle scales with the phase; the label tells you what to do.
 * Pure timers + CSS transform — cheap, battery-friendly.
 */

const PATTERNS = [
  { id: "box", label: "Box · 4-4-4-4", steps: [["In", 4], ["Hold", 4], ["Out", 4], ["Hold", 4]] as const },
  { id: "478", label: "4-7-8", steps: [["In", 4], ["Hold", 7], ["Out", 8]] as const },
] as const;

type Step = { name: string; secs: number };

export default function Breathe() {
  const { play } = useUISFX();
  const [patternId, setPatternId] = useState<"box" | "478">("box");
  const [running, setRunning] = useState(false);
  const [stepName, setStepName] = useState("Ready");
  const [scale, setScale] = useState(0.55);
  const [cycles, setCycles] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pattern = PATTERNS.find((p) => p.id === patternId)!;

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const steps: Step[] = pattern.steps.map(([name, secs]) => ({ name, secs }));
    let idx = 0;
    let cancelled = false;

    const runStep = () => {
      if (cancelled) return;
      const step = steps[idx % steps.length];
      setStepName(step.name);
      // Animate the circle: expand on "In", hold, shrink on "Out"
      setScale(step.name === "In" ? 1 : step.name === "Out" ? 0.55 : scale => scale);
      timerRef.current = setTimeout(() => {
        idx++;
        if (idx % steps.length === 0) setCycles((c) => c + 1);
        runStep();
      }, step.secs * 1000);
    };
    runStep();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, patternId]);

  return (
    <div>
      {/* Pattern picker */}
      <div className="mb-6 flex gap-2">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            onClick={() => { play("select"); setPatternId(p.id); setCycles(0); }}
            disabled={running}
            className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              borderColor: patternId === p.id ? "var(--color-accent)" : "var(--color-paper-3)",
              color: patternId === p.id ? "var(--color-accent)" : "var(--color-ink-muted)",
              backgroundColor: patternId === p.id ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "var(--color-paper)",
              minHeight: 40,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Breathing circle */}
      <div className="flex flex-col items-center py-6">
        <div className="relative flex h-48 w-48 items-center justify-center">
          {/* Outer guide ring */}
          <div
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: "var(--color-paper-3)" }}
          />
          {/* Breathing disc */}
          <div
            className="absolute rounded-full"
            style={{
              inset: "12%",
              backgroundColor: "color-mix(in oklab, var(--color-accent) 16%, var(--color-paper))",
              border: "1.5px solid var(--color-accent)",
              transform: `scale(${scale})`,
              transition: `transform ${stepName === "In" ? 4 : stepName === "Out" ? (patternId === "478" ? 8 : 4) : 0.4}s ease-in-out`,
            }}
          />
          <p className="relative text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            {stepName}
          </p>
        </div>

        <button
          onClick={() => {
            play(running ? "stop" : "play");
            if (running) {
              // Stopping — reset the display immediately
              setStepName("Ready");
              setScale(0.55);
            }
            setRunning((r) => !r);
          }}
          className="mt-8 flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--color-accent)",
            color: "var(--color-accent)",
            backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
            minHeight: 48,
          }}
        >
          {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Stop" : "Begin"}
        </button>

        {cycles > 0 && (
          <p className="mt-3 text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {cycles} {cycles === 1 ? "cycle" : "cycles"} completed
          </p>
        )}
      </div>

      <p className="text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Slow breathing lowers heart rate and settles the mind before deep work.
        4-7-8 is especially good for winding down.
      </p>
    </div>
  );
}
