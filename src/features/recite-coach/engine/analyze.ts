// Session analyzer: consumes the recorded pitch-frame stream and produces the
// report-card measurements. Reference-free v1 — Nakano-style quality signals
// (pitch-interval stability, vibrato regularity, contour control) plus the
// golden-rule proxies that need no alignment: pacing, pause structure,
// cadence quality, breath planning, range/stability. Tajwīd-verdict signals
// (madd/ghunnah vs legal counts) join in P3 once word alignment feeds spans.

import type { PitchFrame } from "../live/pitch";

export interface Phrase {
  start: number;      // seconds
  end: number;
  frames: PitchFrame[];
  meanCents: number;  // relative to session median
  cadence: Cadence;
}

export interface Cadence {
  fell: boolean;      // terminal F0 dropped
  fellCents: number;  // magnitude of terminal drop
  slowed: boolean;    // onset rate decelerated into the end
  faded: boolean;     // RMS decayed into silence
  score: number;      // 0..3 rubric
}

export interface Pause { start: number; dur: number; breathy: boolean }
export interface VibratoStat { phrase: number; rate: number; extentCents: number; regular: boolean }

export interface Report {
  durationSec: number;
  voicedRatio: number;
  phrases: Phrase[];
  pauses: Pause[];
  tempo: { sylPerSec: number; drift: number; steady: boolean };
  pitch: { medianHz: number; rangeCents: [number, number]; stabilityCents: number; monotone: boolean };
  vibrato: { present: boolean; regularCount: number; meanExtentCents: number };
  breath: { gasps: number; breathyPauses: number; plannedRatio: number };
  ghunnah: { nasalPhraseShare: number; meanNasalRatio: number };
  axes: AxisScore[];
  score: number; // /1000 composite over measured signals only
  fixes: string[];
}

export interface AxisScore { key: string; label: string; value: number; max: number; note: string }

const C = (hz: number, ref: number) => 1200 * Math.log2(hz / ref); // cents vs ref

export function analyze(frames: PitchFrame[]): Report {
  const v = frames.filter((f) => f.voiced);
  const dur = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  const med = median(v.map((f) => f.hz)) || 110;

  // ---- segments: voiced runs ≥250ms = phrases; unvoiced ≥400ms = pauses ----
  const phrases: Phrase[] = [];
  const pauses: Pause[] = [];
  let runStart = -1, run: PitchFrame[] = [];
  let gapStart = -1;
  for (const f of frames) {
    if (f.voiced) {
      if (gapStart >= 0 && f.t - gapStart >= 0.4)
        pauses.push({ start: gapStart, dur: f.t - gapStart, breathy: breathy(frames.filter((x) => !x.voiced), frames, gapStart, f.t) });
      gapStart = -1;
      if (runStart < 0) runStart = f.t;
      run.push(f);
    } else {
      if (runStart >= 0 && run.length && run[run.length - 1].t - runStart >= 0.25) {
        phrases.push(makePhrase(runStart, run[run.length - 1].t, run, med));
      }
      runStart = -1; run = [];
      if (gapStart < 0) gapStart = f.t;
    }
  }
  if (runStart >= 0 && run.length && run[run.length - 1].t - runStart >= 0.25)
    phrases.push(makePhrase(runStart, run[run.length - 1].t, run, med));

  // ---- tempo: syllable onsets over the FULL frame stream. Voicing
  // transitions alone only count phrase starts — syllables inside a voiced
  // run surface as RMS peaks (a syllable's vowel is its energy crest).
  const onsetTs = onsetTimes(frames);
  const t0 = frames[0]?.t ?? 0;
  const syl = dur > 0 ? onsetTs.length / dur : 0;
  const midT = t0 + dur / 2;
  const firstRate = onsetRate(onsetTs, t0, midT), lastRate = onsetRate(onsetTs, midT, t0 + dur);
  const drift = firstRate > 0 ? (lastRate - firstRate) / firstRate : 0;

  // ---- pitch stats ----
  const cents = v.map((f) => C(f.hz, med));
  const p = cents.slice().sort((a, b) => a - b);
  const range: [number, number] = [p[Math.floor(p.length * 0.2)] ?? 0, p[Math.floor(p.length * 0.8)] ?? 0];
  // jitter: only frame pairs actually adjacent in time — the gap across a
  // pause is a pitch reset, not instability
  const jit: number[] = [];
  for (let i = 1; i < v.length; i++)
    if (v[i].t - v[i - 1].t < 0.06) jit.push(Math.abs(C(v[i].hz, v[i - 1].hz)));
  const jitter = mean(jit);
  const monotone = range[1] - range[0] < 120; // < ~1.2 semitone band used = flat

  // ---- vibrato: for phrases >600ms, detrended F0 oscillation ----
  let regCount = 0, extSum = 0, vibN = 0;
  const vibs: VibratoStat[] = [];
  for (const ph of phrases) {
    if (ph.end - ph.start < 0.6) continue;
    const vs = vibratoOf(ph.frames, med);
    vibs.push(vs);
    vibN++;
    if (vs.regular) { regCount++; extSum += vs.extentCents; }
  }

  // ---- breath: short unvoiced gaps with energy spike = gasp ----
  const gasps = pauses.filter((p) => p.breathy && p.dur < 0.8).length;
  const breathyPauses = pauses.filter((p) => p.breathy).length;
  const plannedRatio = pauses.length ? pauses.filter((p) => !p.breathy).length / pauses.length : 1;

  // ---- ghunnah proxy: share of voiced time with high nasal-band ratio ----
  const nasalShare = v.length ? v.filter((f) => f.nasalRatio > 0.12).length / v.length : 0;
  const meanNasal = mean(v.map((f) => f.nasalRatio));

  // ---- axes (0-100 style subscores scaled into the /1000 model) ----
  const axes: AxisScore[] = [
    axis("tempo", "Pace", syl > 0 ? clamp(100 - Math.abs(drift) * 400, 0, 100) : 0,
      `${syl.toFixed(1)} onsets/s · drift ${(drift * 100).toFixed(0)}%`),
    axis("pitch", "Pitch control", clamp(100 - jitter * 1.4, 0, 100),
      `median ${med.toFixed(0)}Hz · step jitter ${jitter.toFixed(1)}¢`),
    axis("range", "Range use", monotone ? 35 : clamp((range[1] - range[0]) / 6, 0, 100),
      `${Math.round(range[1] - range[0])}¢ used`),
    axis("vibrato", "Vibrato", vibN ? (regCount / vibN) * 100 : 0,
      regCount ? `regular in ${regCount}/${vibN} phrases · ~${Math.round(extSum / Math.max(1, regCount))}¢` : "none detected"),
    axis("cadence", "Endings", phrases.length ? (mean(phrases.map((x) => x.cadence.score)) / 3) * 100 : 0,
      `${phrases.filter((x) => x.cadence.score === 3).length}/${phrases.length} clean landings`),
    axis("breath", "Breath", clamp(plannedRatio * 100 - gasps * 12, 0, 100),
      gasps ? `${gasps} mid-phrase gasp${gasps > 1 ? "s" : ""}` : "planned pauses"),
    axis("ghunnah", "Nasal color", clamp(meanNasal * 400, 0, 100),
      `nasal band ${(meanNasal * 100).toFixed(0)}% mean`),
  ];

  // composite /1000 over measured axes, confidence-scaled by voiced coverage
  const coverage = dur > 0 ? v.length / frames.length : 0;
  const wSum = axes.reduce((s, a) => s + a.value * (a.max / 100), 0);
  const maxSum = axes.reduce((s, a) => s + a.max, 0);
  const score = Math.round(maxSum ? (wSum / maxSum) * 1000 * clamp(coverage * 2.5, 0.3, 1) : 0);

  const fixes: string[] = [];
  for (const a of axes.slice().sort((x, y) => x.value - y.value).slice(0, 3))
    if (a.value < 70) fixes.push(fixFor(a.key, a));
  if (!fixes.length) fixes.push("Nothing urgent — keep building consistency.");

  return {
    durationSec: dur,
    voicedRatio: coverage,
    phrases, pauses,
    tempo: { sylPerSec: syl, drift, steady: Math.abs(drift) < 0.15 },
    pitch: { medianHz: med, rangeCents: range, stabilityCents: jitter, monotone },
    vibrato: { present: regCount > 0, regularCount: regCount, meanExtentCents: regCount ? extSum / regCount : 0 },
    breath: { gasps, breathyPauses, plannedRatio },
    ghunnah: { nasalPhraseShare: nasalShare, meanNasalRatio: meanNasal },
    axes, score, fixes,
  };
}

// ---------------------------------------------------------------- internals

const AXIS_MAX = { tempo: 130, pitch: 140, range: 90, vibrato: 90, cadence: 150, breath: 120, ghunnah: 120 } as const;
type AxisKey = keyof typeof AXIS_MAX;

function axis(key: AxisKey, label: string, value: number, note: string): AxisScore {
  return { key, label, value: Math.round(clamp(value, 0, 100)), max: AXIS_MAX[key], note };
}

function fixFor(key: string, a: AxisScore): string {
  switch (key) {
    case "cadence": return "Endings: let each ayah fall and fade — don't hang on the last syllable.";
    case "tempo": return "Pace drifted — lock your opening tempo and hold it through the ayah.";
    case "pitch": return "Pitch stepped unsteadily — aim for smoother slides between notes.";
    case "range": return "Very flat contour — let the voice rise and fall; monotone reads as unsure.";
    case "vibrato": return "Vibrato irregular — sustained notes waver instead of settling.";
    case "breath": return "Breath ran short mid-phrase — plan the stop before the air runs out.";
    case "ghunnah": return "Nasal resonance thin — let noon/meem hums resonate a full count.";
    default: return `${a.label} needs attention.`;
  }
}

function makePhrase(start: number, end: number, frames: PitchFrame[], med: number): Phrase {
  const cs = frames.map((f) => C(f.hz, med));
  const last = Math.max(1, Math.floor(frames.length * 0.3));
  const tailC = cs.slice(-last), headC = cs.slice(0, last);
  const tail = frames.slice(-last);
  const fellCents = (mean(headC) - mean(tailC));
  const peakRms = Math.max(...frames.map((f) => f.rms), 1e-6);
  const endRms = mean(tail.map((f) => f.rms));
  // deceleration: syllable-onset rate in first vs last third
  const ts = onsetTimes(frames);
  const onFirst = onsetRate(ts, start, start + (end - start) / 3);
  const onLast = onsetRate(ts, end - (end - start) / 3, end);
  const slowed = onFirst > 0 && onLast / onFirst < 0.75;
  const fell = fellCents > 60;
  const faded = endRms < peakRms * 0.35;
  return {
    start, end, frames,
    meanCents: mean(cs),
    cadence: { fell, fellCents: Math.round(fellCents), slowed, faded, score: (fell ? 1 : 0) + (slowed ? 1 : 0) + (faded ? 1 : 0) },
  };
}

function vibratoOf(frames: PitchFrame[], med: number): VibratoStat {
  const cs = frames.map((f) => C(f.hz, med));
  // detrend: subtract 5-frame moving average
  const det = cs.map((c, i) => c - mean(cs.slice(Math.max(0, i - 2), i + 3)));
  // zero-crossing rate of detrended signal → oscillation rate
  let crossings = 0;
  for (let i = 1; i < det.length; i++) if (det[i] * det[i - 1] < 0) crossings++;
  const dur = frames[frames.length - 1].t - frames[0].t;
  const rate = dur > 0 ? crossings / 2 / dur : 0;
  const extent = (Math.max(...det) - Math.min(...det)) / 2;
  const regular = rate >= 4 && rate <= 8 && extent >= 25 && extent <= 160;
  return { phrase: 0, rate, extentCents: extent, regular };
}

function breathy(unvoiced: PitchFrame[], frames: PitchFrame[], gapStart: number, gapEnd: number): boolean {
  const gap = frames.filter((f) => f.t >= gapStart && f.t <= gapEnd);
  const peak = Math.max(...gap.map((f) => f.rms), 0);
  // floor is the SILENCE level (unvoiced frames), not session mean — speech
  // RMS would swamp any inhale and the test could never fire.
  const floor = median(unvoiced.map((f) => f.rms)) || 0;
  return peak > floor * 3; // energy spike inside a silence = inhale/gasp
}

// Syllable onsets across the full stream: a voiced-run start, or an RMS crest
// inside a run (each syllable's vowel peaks energetically).
function onsetTimes(frames: PitchFrame[]): number[] {
  const ts: number[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const f = frames[i];
    if (!f.voiced) continue;
    if (!frames[i - 1].voiced) { ts.push(f.t); continue; }
    if (f.rms > frames[i - 1].rms * 1.6 && f.rms >= frames[i + 1].rms && f.rms > 0.015) ts.push(f.t);
  }
  return ts;
}
function onsetRate(ts: number[], t0: number, t1: number): number {
  const n = ts.filter((t) => t >= t0 && t < t1).length;
  return t1 > t0 ? n / (t1 - t0) : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}
