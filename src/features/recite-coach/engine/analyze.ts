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
  held: boolean;      // terminal note sustained — a deliberate qaflah
  score: number;      // 0..4 rubric, partial credit per signal
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

export interface AxisScore { key: string; label: string; value: number; max: number; note: string; why: string }

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
        pauses.push({ start: gapStart, dur: f.t - gapStart, breathy: breathy(frames, gapStart, f.t) });
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

  // ---- vibrato: for phrases >600ms, detrended F0 oscillation. Present
  // (any measurable oscillation) and regular (4–8Hz, 25–160¢) are tracked
  // separately so a subtle waver still shows a number, not "none detected".
  let regCount = 0, extSum = 0, vibN = 0, presentCount = 0;
  const vibs: VibratoStat[] = [];
  for (const ph of phrases) {
    if (ph.end - ph.start < 0.6) continue;
    const vs = vibratoOf(ph.frames, med);
    vibs.push(vs);
    vibN++;
    if (vs.regular) { regCount++; extSum += vs.extentCents; }
    if (vs.rate >= 2 && vs.rate <= 11 && vs.extentCents >= 8) presentCount++;
  }
  const meanExtent = vibN ? mean(vibs.map((x) => x.extentCents)) : 0;

  // ---- breath: two measurable signals. Inhalation surfaces as a ZCR spike
  // inside the gap (fricative air = broadband noise) — RMS alone can't see it
  // when the noise floor is near zero, which is why the old check always
  // scored 100. Placement: pauses at phrase ends are planned; very long
  // pauses and frequent mid-phrase stops cost points. ----
  const gasps = pauses.filter((p) => p.breathy && p.dur < 0.8).length;
  const breathyPauses = pauses.filter((p) => p.breathy).length;
  const plannedRatio = pauses.length ? pauses.filter((p) => !p.breathy).length / pauses.length : 1;
  const longPauses = pauses.filter((p) => p.dur > 3).length;
  // pause density: pauses per voiced phrase — more than ~1 per phrase = choppy
  const pauseDensity = phrases.length ? pauses.length / phrases.length : 0;
  const breathScore = clamp(plannedRatio * 100 - gasps * 12 - longPauses * 8 - Math.max(0, pauseDensity - 1.2) * 15, 0, 100);

  // ---- ghunnah proxy: share of voiced time with high nasal-band ratio ----
  const nasalShare = v.length ? v.filter((f) => f.nasalRatio > 0.12).length / v.length : 0;
  const meanNasal = mean(v.map((f) => f.nasalRatio));

  // ---- axes (0-100 style subscores scaled into the /1000 model) ----
  const cadenceMean = phrases.length ? mean(phrases.map((x) => x.cadence.score)) / 4 : 0;
  const cleanLandings = phrases.filter((x) => x.cadence.score >= 2.5).length;
  const axes: AxisScore[] = [
    axis("tempo", "Pace", syl > 0 ? clamp(100 - Math.abs(drift) * 400, 0, 100) : 0,
      `${syl.toFixed(1)} onsets/s · drift ${(drift * 100).toFixed(0)}%`,
      Math.abs(drift) < 0.15
        ? `Your speed held steady — under ~15% drift reads as one locked tempo.`
        : `You drifted ${(drift * 100).toFixed(0)}% ${drift > 0 ? "faster" : "slower"} over the take — pick a tempo on the first word and hold it.`),
    axis("pitch", "Pitch control", clamp(100 - jitter * 1.4, 0, 100),
      `median ${med.toFixed(0)}Hz · step jitter ${jitter.toFixed(1)}¢`,
      jitter < 40
        ? `Steps averaged ${jitter.toFixed(0)}¢ — under ~40¢ your slides read as smooth.`
        : `Steps averaged ${jitter.toFixed(0)}¢ between frames — the line jagged instead of gliding. Aim for slides, not stairs.`),
    axis("range", "Range use", monotone ? 35 : clamp((range[1] - range[0]) / 6, 0, 100),
      `${Math.round(range[1] - range[0])}¢ used`,
      monotone
        ? `You stayed inside ${Math.round(range[1] - range[0])}¢ — under ~120¢ reads monotone; let phrases rise and fall across ~300¢+.`
        : `You spanned ${Math.round(range[1] - range[0])}¢ — enough movement to carry melody without straining.`),
    axis("vibrato", "Vibrato",
      vibN ? clamp(((presentCount / vibN) * 60) + ((regCount / Math.max(1, vibN)) * 40), 0, 100) : 0,
      vibN
        ? regCount
          ? `regular in ${regCount}/${vibN} phrases · ~${Math.round(extSum / Math.max(1, regCount))}¢`
          : presentCount
            ? `light in ${presentCount}/${vibN} phrases · ~${Math.round(meanExtent)}¢ — irregular`
            : `steady-held · extent ~${Math.round(meanExtent)}¢`
        : "no long phrases",
      !vibN
        ? `No phrase ran long enough (>0.6s) to measure — sustained endings are where vibrato shows.`
        : regCount
          ? `Your sustained notes oscillated ~${Math.round(extSum / Math.max(1, regCount))}¢ at a regular rate — that's a controlled waver, what teachers mean by vibrato.`
          : presentCount
            ? `You wavered ~${Math.round(meanExtent)}¢ on held notes but not at a steady rate — settle the pitch for a beat, then let it pulse evenly.`
            : `Your held notes stayed flat (~${Math.round(meanExtent)}¢ wobble) — for a warmer ending, let the last note pulse gently.`),
    axis("cadence", "Endings", cadenceMean * 100,
      `${cleanLandings}/${phrases.length} clean landings`,
      cleanLandings === phrases.length && phrases.length
        ? `Every phrase landed — fell, held, or faded.`
        : `A landing is one of three moves at the last syllable: pitch falls, the note holds steady, or the voice fades out. ${phrases.length - cleanLandings} of ${phrases.length} phrases ended mid-air.`),
    axis("breath", "Breath", breathScore,
      gasps ? `${gasps} mid-phrase gasp${gasps > 1 ? "s" : ""}` : longPauses ? `${longPauses} long pause${longPauses > 1 ? "s" : ""}` : "planned pauses",
      gasps || longPauses
        ? `${gasps ? `${gasps} inhale${gasps > 1 ? "s" : ""} cut a phrase short` : ""}${gasps && longPauses ? "; " : ""}${longPauses ? `${longPauses} pause${longPauses > 1 ? "s" : ""} ran over 3s` : ""} — plan the stop at the āyah end before air runs out.`
        : `Your inhales landed at phrase boundaries — nothing flagged, which is why this reads high.`),
    axis("ghunnah", "Nasal color", clamp(meanNasal * 400, 0, 100),
      `nasal band ${(meanNasal * 100).toFixed(0)}% mean`,
      meanNasal > 0.18
        ? `Strong nasal resonance — your noon/meem hums resonate.`
        : `Nasal band averaged ${(meanNasal * 100).toFixed(0)}% — ghunnah letters (noon/meem shaddah) should hum for two counts.`),
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

function axis(key: AxisKey, label: string, value: number, note: string, why: string): AxisScore {
  return { key, label, value: Math.round(clamp(value, 0, 100)), max: AXIS_MAX[key], note, why };
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
  // sustained: the terminal third holds one note (low spread) — a deliberate
  // qaflah hold reads as a clean landing even without a fade
  const tailSpread = tailC.length ? Math.max(...tailC) - Math.min(...tailC) : 0;
  const held = tailSpread < 90;
  // Partial credit per signal — a beautiful ending is usually a held note
  // that fades, or a clear fall. Requiring all three at full strength is
  // what kept honest landings at 0.
  const toneScore = fellCents > 120 ? 2 : fellCents > 60 ? 1.6 : fellCents > 25 ? 1
    : tailSpread < 60 ? 1.4 : held ? 1.2 : tailSpread < 160 ? 0.6 : 0;
  const energyScore = faded ? 1 : endRms < peakRms * 0.55 ? 0.6 : 0;
  const paceScore = slowed ? 1 : 0;
  return {
    start, end, frames,
    meanCents: mean(cs),
    cadence: { fell, fellCents: Math.round(fellCents), slowed, faded, held, score: toneScore + energyScore + paceScore },
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

// Inhale inside a silence gap. Two probes because rooms differ:
//   1. RMS spike — works when the gap floor isn't fully zero
//   2. ZCR spike — fricative air is broadband; catches inhales even when the
//      silence floor sits at ~0 (the case that always scored 100 before)
function breathy(frames: PitchFrame[], gapStart: number, gapEnd: number): boolean {
  const gap = frames.filter((f) => f.t >= gapStart && f.t <= gapEnd);
  if (!gap.length) return false;
  const peak = Math.max(...gap.map((f) => f.rms), 0);
  const unvoiced = frames.filter((f) => !f.voiced);
  const floor = median(unvoiced.map((f) => f.rms)) || 0;
  if (floor > 0 && peak > floor * 3) return true;
  const zFloor = median(unvoiced.map((f) => f.zcr)) || 0;
  const zPeak = Math.max(...gap.map((f) => f.zcr), 0);
  // zcr of 0 across the session means the worklet didn't report it — no probe
  return zFloor > 0 && zPeak > zFloor * 1.8 && peak > floor * 1.5;
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
