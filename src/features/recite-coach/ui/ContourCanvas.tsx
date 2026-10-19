"use client";

import { useEffect, useRef } from "react";
import type { PitchFrame } from "../live/pitch";

// Canvas trail: fixed "now" line at right, history scrolls left. Emerald =
// your voice; a faint gold band marks each octave. DOM renders nothing here —
// Arabic text/UI live outside the canvas layer by design (two-layer split).

const FMIN = 60, FMAX = 600; // recitation voice range
const TRAIL_MS = 3800;

export default function ContourCanvas({ getFrames, active }: { getFrames: () => PitchFrame[]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function draw() {
      raf = requestAnimationFrame(draw);
      if (!cv || !ctx) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== (w * dpr | 0) || cv.height !== (h * dpr | 0)) {
        cv.width = w * dpr | 0;
        cv.height = h * dpr | 0;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // octave guide lines (log scale)
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let f = 65.4; f <= FMAX; f *= 2) {
        const y = yOf(f, h);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const frames = getFrames();
      if (!frames.length) return;
      const now = frames[frames.length - 1].t;
      const x0 = w - 8;

      // trail
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(74,222,128,0.85)";
      let started = false;
      let lx = 0, ly = 0;
      for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        const dt = (now - f.t) * 1000;
        if (dt > TRAIL_MS) break;
        const x = x0 - (dt / TRAIL_MS) * (w - 8);
        const y = yOf(f.hz || 0, h);
        if (!f.voiced) { started = false; continue; }
        if (!started) { ctx.moveTo(x, y); started = true; }
        else if (x - lx > 0.5 || Math.abs(y - ly) > 1.5) ctx.lineTo(x, y); // skip sub-pixel dupes
        lx = x; ly = y;
      }
      ctx.stroke();

      // leading dot on the newest voiced frame
      const last = [...frames].reverse().find((f) => f.voiced);
      if (last) {
        const y = yOf(last.hz, h);
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath(); ctx.arc(x0 - 1, y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getFrames]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      style={{ opacity: active ? 1 : 0.35, transition: "opacity 300ms" }}
      aria-hidden
    />
  );
}

function yOf(hz: number, h: number): number {
  const lo = Math.log2(FMIN), hi = Math.log2(FMAX);
  const v = hz > 0 ? (Math.log2(hz) - lo) / (hi - lo) : 0;
  return h - 8 - v * (h - 16);
}
