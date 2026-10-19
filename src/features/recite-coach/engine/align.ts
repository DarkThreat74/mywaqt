// Reference compare: banded DTW between two pitch contours in cents relative
// to each contour's own median — voice-range invariant (a bass and a tenor
// matching shape score identically). Returns a match score and the worst
// divergent windows for the report's localized diff list.

import type { PitchFrame } from "../live/pitch";

export interface Divergence {
  tSec: number;      // start (session time)
  durSec: number;
  centsOff: number;  // mean signed gap in the window
}

export interface CompareResult {
  /** 0–100 contour match over voiced overlap */
  match: number;
  /** mean absolute cents deviation on voiced frames */
  meanCents: number;
  /** worst divergent windows, worst-first */
  divergences: Divergence[];
  /** tempo ratio mine/reference — >1 = I recited faster */
  tempoRatio: number;
}

const C = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);
const med = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

// cents series at fixed 50ms grid over voiced frames; unvoiced → NaN.
function centsSeries(frames: PitchFrame[], gridSec = 0.05): { cs: number[]; t0: number } {
  if (!frames.length) return { cs: [], t0: 0 };
  const t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  const ref = med(frames.filter((f) => f.voiced).map((f) => f.hz)) || 110;
  const cs = new Array(Math.max(0, Math.ceil((t1 - t0) / gridSec))).fill(NaN);
  for (const f of frames) if (f.voiced) cs[Math.floor((f.t - t0) / gridSec)] = C(f.hz, ref);
  return { cs, t0 };
}

export function compareContours(mine: PitchFrame[], ref: PitchFrame[]): CompareResult | null {
  const A = centsSeries(mine), B = centsSeries(ref);
  if (!A.cs.length || !B.cs.length) return null;
  const n = A.cs.length, m = B.cs.length;
  const band = Math.max(20, Math.floor(Math.max(n, m) * 0.25)); // ±25% warp

  // banded DTW, NaN cells penalised as gaps
  const GAP = 100; // cents penalty for aligning to silence
  const D: Float64Array[] = [];
  for (let i = 0; i <= n; i++) {
    D[i] = new Float64Array(m + 1).fill(Infinity);
    D[i][0] = i * GAP;
  }
  for (let j = 0; j <= m; j++) D[0][j] = j * GAP;
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const j0 = Math.max(1, Math.floor((m / n) * i) - band);
    const j1 = Math.min(m, Math.ceil((m / n) * i) + band);
    for (let j = j0; j <= j1; j++) {
      const a = A.cs[i - 1], b = B.cs[j - 1];
      const cost = Number.isNaN(a) || Number.isNaN(b) ? GAP : Math.abs(a - b);
      D[i][j] = cost + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }

  // backtrack for per-index gaps (to place divergences)
  const gaps: { i: number; off: number }[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const a = A.cs[i - 1], b = B.cs[j - 1];
    const off = Number.isNaN(a) || Number.isNaN(b) ? GAP : a - b;
    gaps.push({ i: i - 1, off: Number.isNaN(off) ? 0 : off });
    const d = Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    if (d === D[i - 1][j - 1]) { i--; j--; } else if (d === D[i - 1][j]) i--; else j--;
  }
  gaps.reverse();

  const valid = gaps.filter((g) => Math.abs(g.off) < GAP);
  const meanCents = valid.length ? valid.reduce((s, g) => s + Math.abs(g.off), 0) / valid.length : 0;
  const match = Math.max(0, Math.min(100, 100 - meanCents / 2)); // 200¢ avg gap → 0

  // divergent windows: contiguous runs where |off| > 80¢ for ≥0.5s
  const WIN = Math.round(0.5 / 0.05);
  const divs: Divergence[] = [];
  let s = -1, acc = 0;
  gaps.forEach((g, idx) => {
    const bad = Math.abs(g.off) > 80 && Math.abs(g.off) < GAP;
    if (bad && s < 0) { s = idx; acc = 0; }
    if (bad) acc += g.off;
    if ((!bad || idx === gaps.length - 1) && s >= 0) {
      if (idx - s >= WIN) divs.push({ tSec: A.t0 + s * 0.05, durSec: (idx - s) * 0.05, centsOff: acc / (idx - s) });
      s = -1;
    }
  });
  divs.sort((a, b) => Math.abs(b.centsOff) - Math.abs(a.centsOff));

  const durA = mine.length ? mine[mine.length - 1].t - mine[0].t : 0;
  const durB = ref.length ? ref[ref.length - 1].t - ref[0].t : 0;
  return { match, meanCents, divergences: divs.slice(0, 5), tempoRatio: durB > 0 ? durA / durB : 1 };
}
