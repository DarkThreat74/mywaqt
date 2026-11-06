export type SignalStatus = "measured" | "derived" | "missing";

export interface AlgorithmSignal {
  value: number | null;
  status: SignalStatus;
  confidence: number;
  source: string;
}

export interface GrowthForecast {
  status: "insufficient-data" | "calibrating" | "forecast";
  weeksObserved: number;
  sessionsObserved: number;
  currentE1rm: number | null;
  monthlyE1rmChangePct: number | null;
  expectedMonthlyRangePct: [number, number] | null;
  confidence: number;
  limitingSignals: string[];
}

interface Point {
  at: string;
  e1: number;
}

const signal = (value: number | null, status: SignalStatus, confidence: number, source: string): AlgorithmSignal => ({
  value, status, confidence, source,
});

// Forecast only from a trend with enough time and observations. It intentionally
// returns a range: individual strength changes are noisy and are not muscle-mass
// measurements.
export function forecastGrowth(points: Point[]): GrowthForecast {
  const ordered = points
    .filter((p) => Number.isFinite(p.e1) && p.e1 > 0 && Number.isFinite(Date.parse(p.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (ordered.length < 4) {
    return { status: "insufficient-data", weeksObserved: 0, sessionsObserved: ordered.length, currentE1rm: ordered.at(-1)?.e1 ?? null, monthlyE1rmChangePct: null, expectedMonthlyRangePct: null, confidence: 0, limitingSignals: ["Need four comparable workouts"] };
  }
  const firstAt = Date.parse(ordered[0].at);
  const lastAt = Date.parse(ordered.at(-1)!.at);
  const weeks = Math.max(0, (lastAt - firstAt) / 604800000);
  if (weeks < 3) {
    return { status: "calibrating", weeksObserved: weeks, sessionsObserved: ordered.length, currentE1rm: ordered.at(-1)!.e1, monthlyE1rmChangePct: null, expectedMonthlyRangePct: null, confidence: 0.2, limitingSignals: ["Need three weeks of comparable workouts"] };
  }
  const current = ordered.at(-1)!.e1;
  // Theil–Sen slope: median of all pairwise slopes. One unusually good or
  // bad workout cannot bend the forecast as much as ordinary least squares.
  const slopes: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const dt = Date.parse(ordered[j].at) - Date.parse(ordered[i].at);
      if (dt > 0) slopes.push((ordered[j].e1 - ordered[i].e1) / dt);
    }
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  const slopePerMs = median(slopes);
  const intercepts = ordered.map((p) => p.e1 - slopePerMs * Date.parse(p.at));
  const intercept = median(intercepts);
  const monthlyPct = (slopePerMs * 2592000000 / Math.max(current, 1)) * 100;
  const residuals = ordered.map((p) => p.e1 - (intercept + slopePerMs * Date.parse(p.at)));
  const noisePct = median(residuals.map((x) => Math.abs(x))) / Math.max(current, 1) * 100;
  const confidence = Math.min(0.95, Math.max(0.2, (Math.min(ordered.length, 10) / 10) * Math.min(1, weeks / 8) * (1 / (1 + noisePct / 8))));
  // Prediction interval is intentionally wider than the fitted trend. This is
  // a monitoring estimate, not a promise of future strength.
  const margin = Math.max(1.5, noisePct * 1.8);
  const limitingSignals: string[] = [];
  if (noisePct > 8) limitingSignals.push("Workouts vary a lot");
  if (ordered.length < 6) limitingSignals.push("More workouts will improve this");
  if (Math.abs(monthlyPct) > 12) limitingSignals.push("Large trend may include technique or rep-range changes");
  return {
    status: "forecast",
    weeksObserved: Math.round(weeks * 10) / 10,
    sessionsObserved: ordered.length,
    currentE1rm: Math.round(current * 10) / 10,
    monthlyE1rmChangePct: Math.round(monthlyPct * 10) / 10,
    expectedMonthlyRangePct: [Math.round((monthlyPct - margin) * 10) / 10, Math.round((monthlyPct + margin) * 10) / 10],
    confidence: Math.round(confidence * 100) / 100,
    limitingSignals,
  };
}

export function buildAlgorithmSignals(input: {
  sessions: number;
  sets: number;
  tonnage: number;
  weeklyTonnage: number;
  previousWeeklyTonnage: number;
  averageRir: number | null;
  failureRate: number | null;
  averageRestSec: number | null;
  latestBodyweightKg: number | null;
  bodyweightChangeKg: number | null;
  sleepHours: number | null;
  soreness: number | null;
  energy: number | null;
  painRate: number | null;
}): Record<string, AlgorithmSignal> {
  const volumeDelta = input.previousWeeklyTonnage > 0
    ? (input.weeklyTonnage - input.previousWeeklyTonnage) / input.previousWeeklyTonnage
    : null;
  return {
    sessions: signal(input.sessions, "measured", 0.99, "workout_sessions"),
    completedSets: signal(input.sets, "measured", 0.99, "workout_sets.done"),
    lifetimeTonnageKg: signal(input.tonnage, "measured", 0.99, "weighted sets"),
    weeklyTonnageKg: signal(input.weeklyTonnage, "measured", 0.99, "last seven days"),
    previousWeeklyTonnageKg: signal(input.previousWeeklyTonnage, "measured", 0.99, "preceding seven days"),
    weeklyTonnageDelta: signal(volumeDelta, "derived", volumeDelta === null ? 0 : 0.85, "weekly tonnage comparison"),
    averageRir: signal(input.averageRir, input.averageRir === null ? "missing" : "measured", input.averageRir === null ? 0 : 0.7, "logged RIR"),
    failureRate: signal(input.failureRate, input.failureRate === null ? "missing" : "measured", input.failureRate === null ? 0 : 0.85, "failure set ratio"),
    averageRestSec: signal(input.averageRestSec, input.averageRestSec === null ? "missing" : "measured", input.averageRestSec === null ? 0 : 0.8, "set timestamps"),
    latestBodyweightKg: signal(input.latestBodyweightKg, input.latestBodyweightKg === null ? "missing" : "measured", input.latestBodyweightKg === null ? 0 : 0.99, "body_metrics"),
    bodyweightChangeKg: signal(input.bodyweightChangeKg, input.bodyweightChangeKg === null ? "missing" : "derived", input.bodyweightChangeKg === null ? 0 : 0.8, "body_metrics trend"),
    sleepHours: signal(input.sleepHours, input.sleepHours === null ? "missing" : "measured", input.sleepHours === null ? 0 : 0.65, "session readiness"),
    soreness: signal(input.soreness, input.soreness === null ? "missing" : "measured", input.soreness === null ? 0 : 0.65, "session readiness"),
    energy: signal(input.energy, input.energy === null ? "missing" : "measured", input.energy === null ? 0 : 0.65, "session readiness"),
    painRate: signal(input.painRate, input.painRate === null ? "missing" : "derived", input.painRate === null ? 0 : 0.75, "set pain flags"),
  };
}
