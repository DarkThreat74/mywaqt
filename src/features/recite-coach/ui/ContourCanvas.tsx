"use client";

import { useEffect, useRef } from "react";
import type { PitchFrame } from "../live/pitch";

// Canvas trail: fixed "now" line at right, history scrolls left. Emerald =
// your voice; a faint gold band marks each octave. DOM renders nothing here —
// Arabic text/UI live outside the canvas layer by design (two-layer split).

const FMIN = 60, FMAX = 600; // recitation voice range
const TRAIL_MS = 3800;

export default function ContourCanvas({ getFrames, active, reference }: { getFrames: () => PitchFrame[]; active: boolean; reference?: PitchFrame[] | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const refRef = useRef<PitchFrame[] | null>(null);
  const refMed = useRef(110);
  useEffect(() => {
    refRef.current = reference ?? null;
    // median once per reference, not per animation frame
    refMed.current = reference ? (median(reference.filter((f) => f.voiced).map((f) => f.hz)) || 110) : 110;
  }, [reference]);

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

      // gold reference contour — stretched to the canvas width, octaves
      // ignored: we draw shape, not register (range-invariant compare).
      const rf = refRef.current;
      if (rf?.length) {
        const r0 = rf[0].t, rDur = rf[rf.length - 1].t - r0 || 1;
        const rMed = refMed.current;
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(251,191,36,0.55)";
        let started = false;
        for (const f of rf) {
          if (!f.voiced) { started = false; continue; }
          // shift reference into the viewer's octave so shapes overlay
          const shifted = nearestOctaveTo(f.hz, rMed);
          const x = ((f.t - r0) / rDur) * w;
          const y = yOf(shifted, h);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const frames = getFrames();
      if (!frames.length) return;
      const now = frames[frames.length - 1].t;
      const x0 = w - 8;

      // trail — voiced frames only, but short unvoiced gaps (<~250ms, the
      // saktah/faṣl breath gaps) bridge straight across so the melody reads
      // as one line instead of stuttering. Longer gaps stay a real break.
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(74,222,128,0.85)";
      let started = false;
      let lx = 0, ly = 0;
      let gapStartT = -1;
      let lastVoiced: { x: number; y: number } | null = null;
      for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        const dt = (now - f.t) * 1000;
        if (dt > TRAIL_MS) break;
        const x = x0 - (dt / TRAIL_MS) * (w - 8);
        if (!f.voiced) {
          if (gapStartT < 0) gapStartT = f.t;
          continue;
        }
        const y = yOf(f.hz, h);
        if (lastVoiced && gapStartT >= 0 && lastVoiced.x - x > 0) {
          const gapMs = (gapStartT - f.t) * 1000;
          if (gapMs < 250) { ctx.lineTo(lastVoiced.x, lastVoiced.y); ctx.lineTo(x, y); }
          else ctx.moveTo(x, y);
        } else if (!started) {
          ctx.moveTo(x, y); started = true;
        } else if (x - lx > 0.5 || Math.abs(y - ly) > 1.5) {
          ctx.lineTo(x, y);
        }
        gapStartT = -1;
        lx = x; ly = y;
        lastVoiced = { x, y };
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

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

// Fold a reference note into the octave closest to the clip's own median so
// the gold line sits in the band the student will actually sing in.
function nearestOctaveTo(hz: number, target: number): number {
  let out = hz;
  while (out > target * 1.9) out /= 2;
  while (out < target * 0.53) out *= 2;
  return out;
}
