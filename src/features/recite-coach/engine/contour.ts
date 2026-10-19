// Offline pitch extraction: the same MPM/NSDF algorithm as the live worklet,
// run on a decoded PCM buffer. Used for reference clips (practice mode) —
// where latency doesn't matter and every sample is already known.

import type { PitchFrame } from "../live/pitch";

const N = 2048;

export function extractContour(pcm: Float32Array, sr: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  const hop = Math.floor(sr / 93); // ~10.7ms hop, matches the worklet
  const tauMin = Math.floor(sr / 1000);
  const tauMax = Math.min(Math.floor(sr / 65), N >> 1);
  const r = new Float32Array(tauMax + 1);
  const m = new Float32Array(tauMax + 1);
  let runStart = -1;
  const med: number[] = [];

  for (let off = 0; off + N <= pcm.length; off += hop) {
    const t = off / sr;
    let e = 0;
    for (let i = 0; i < N; i++) e += pcm[off + i] * pcm[off + i];
    const rms = Math.sqrt(e / N);

    for (let tau = tauMin; tau <= tauMax; tau++) {
      let ac = 0, mm = 0;
      for (let j = 0; j < N - tau; j++) {
        const a = pcm[off + j], b = pcm[off + j + tau];
        ac += a * b;
        mm += a * a + b * b;
      }
      r[tau] = ac;
      m[tau] = mm;
    }
    let maxPeak = 0;
    const peaks: number[] = [];
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      const v = m[tau] > 0 ? (2 * r[tau]) / m[tau] : 0;
      if (v > 0 && v >= (2 * r[tau - 1]) / (m[tau - 1] || 1) && v > (2 * r[tau + 1]) / (m[tau + 1] || 1)) {
        peaks.push(tau);
        if (v > maxPeak) maxPeak = v;
      }
    }
    let hz = 0, clarity = 0;
    if (peaks.length && maxPeak > 0.3) {
      let pick = peaks[peaks.length - 1];
      for (const tau of peaks) {
        if ((2 * r[tau]) / m[tau] >= maxPeak * 0.82) { pick = tau; break; }
      }
      const a = (2 * r[pick - 1]) / m[pick - 1];
      const b = (2 * r[pick]) / m[pick];
      const c = (2 * r[pick + 1]) / m[pick + 1];
      hz = sr / (pick + (a - c) / (2 * (a - 2 * b + c) || 1));
      clarity = b;
    }

    // same contour hygiene as the live path: median-of-3 + octave snap + blip drop
    med.push(hz);
    if (med.length > 3) med.shift();
    const s = [...med].sort((x, y) => x - y);
    let f0 = s[s.length >> 1];
    const prev = frames.length ? frames[frames.length - 1].hz : 0;
    const voiced = hz > 0 && clarity >= 0.6;
    if (voiced && prev > 0 && f0 > 0) {
      while (f0 > prev * 1.9) f0 /= 2;
      while (f0 < prev * 0.53) f0 *= 2;
    }
    if (voiced && runStart < 0) runStart = t;
    if (!voiced) {
      med.length = 0;
      if (runStart >= 0 && (t - runStart) * 1000 < 80) {
        while (frames.length && frames[frames.length - 1].t >= runStart) frames.pop();
      }
      runStart = -1;
    }
    frames.push({ hz: voiced ? f0 : 0, clarity, rms, voiced, t, zcr: 0, centroid: 0, nasalRatio: 0 });
  }
  return frames;
}
