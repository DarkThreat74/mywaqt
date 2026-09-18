"use client";

import { useState, useRef, useEffect } from "react";
import { RotateCcw, Eraser } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

/**
 * Fidget — a pop-it bubble grid and a doodle pad.
 * Research: hand fidgeting sustains arousal/engagement during passive tasks
 * without hurting performance. These are deliberate idle-hand outlets.
 */

const GRID = 6; // 6x6 bubbles

function PopGrid() {
  const { play } = useUISFX();
  const [popped, setPopped] = useState<boolean[]>(() => Array(GRID * GRID).fill(false));

  function pop(i: number) {
    setPopped((prev) => {
      if (prev[i]) return prev;
      const next = [...prev];
      next[i] = true;
      return next;
    });
    play("press");
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function reset() {
    setPopped(Array(GRID * GRID).fill(false));
    play("swipe");
  }

  const allPopped = popped.every(Boolean);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
          Pop-it — {popped.filter(Boolean).length}/{GRID * GRID}
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 36 }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Flip & reset
        </button>
      </div>
      <div
        className="grid gap-2 rounded-2xl border p-3"
        style={{
          gridTemplateColumns: `repeat(${GRID}, 1fr)`,
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper-2)",
        }}
      >
        {popped.map((isPopped, i) => (
          <button
            key={i}
            onPointerDown={() => pop(i)}
            aria-label={isPopped ? "Popped bubble" : "Bubble"}
            className="aspect-square rounded-full transition-transform duration-150"
            style={{
              backgroundColor: isPopped ? "var(--color-paper-3)" : "var(--color-paper)",
              boxShadow: isPopped
                ? "inset 0 2px 4px color-mix(in oklab, var(--color-ink) 18%, transparent)"
                : "inset 0 -3px 5px color-mix(in oklab, var(--color-ink) 14%, transparent), 0 1px 2px color-mix(in oklab, var(--color-ink) 8%, transparent)",
              transform: isPopped ? "scale(0.92)" : "scale(1)",
            }}
          />
        ))}
      </div>
      {allPopped && (
        <p className="mt-2 text-center text-xs" style={{ color: "var(--color-success)" }}>
          All popped — flip it and go again.
        </p>
      )}
    </div>
  );
}

function DoodlePad() {
  const { play } = useUISFX();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Size canvas to element once mounted (devicePixelRatio-aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    drawingRef.current = true;
    lastRef.current = pos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    if (!drawingRef.current || !lastRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-ink") || "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }

  function end() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    play("delete");
  }

  return (
    <div>
      <div className="mb-3 mt-8 flex items-center justify-between sm:mt-0">
        <p className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
          Doodle pad — draw to unwind
        </p>
        <button
          onClick={clear}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 36 }}
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="h-56 w-full touch-none rounded-2xl border"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", cursor: "crosshair" }}
      />
    </div>
  );
}

export default function Fidget() {
  return (
    <div className="sm:grid sm:grid-cols-2 sm:gap-6 sm:items-start">
      <PopGrid />
      <DoodlePad />
      <p className="mt-4 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Small repetitive hand movements help sustain engagement during listening
        or reading — a place for restless hands while your mind works.
      </p>
    </div>
  );
}
