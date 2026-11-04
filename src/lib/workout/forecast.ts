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
  if (ordered.length < 3) {
    return { status: "insufficient-data", weeksObserved: 0, sessionsObserved: ordered.length, currentE1rm: ordered.at(-1)?.e1 ?? null, monthlyE1rmChangePct: null, expectedMonthlyRangePct: null, confidence: 0, limitingSignals: ["Need at least three valid sessions"] };
  }
  const firstAt = Date.parse(ordered[0].at);
  const lastAt = Date.parse(ordered.at(-1)!.at);
  const weeks = Math.max(0, (lastAt - firstAt) / 604800000);
  if (weeks < 2) {
    return { status: "calibrating", weeksObserved: weeks, sessionsObserved: ordered.length, currentE1rm: ordered.at(-1)!.e1, monthlyE1rmChangePct: null, expectedMonthlyRangePct: null, confidence: 0.2, limitingSignals: ["Trend window is shorter than two weeks"] };
  }
  const xMean = ordered.reduce((s, p) => s + Date.parse(p.at), 0) / ordered.length;
  const yMean = ordered.reduce((s, p) => s + p.e1, 0) / ordered.length;
  const denom = ordered.reduce((s, p) => s + (Date.parse(p.at) - xMean) ** 2, 0) || 1;
  const slopePerMs = ordered.reduce((s, p) => s + (Date.parse(p.at) - xMean) * (p.e1 - yMean), 0) / denom;
  const current = ordered.at(-1)!.e1;
  const monthlyPct = (slopePerMs * 2592000000 / Math.max(current, 1)) * 100;
  const residuals = ordered.map((p) => p.e1 - (yMean + slopePerMs * (Date.parse(p.at) - xMean)));
  const noisePct = Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length) / Math.max(current, 1) * 100;
  const confidence = Math.min(0.95, Math.max(0.25, (Math.min(ordered.length, 10) / 10) * Math.min(1, weeks / 8) * (1 / (1 + noisePct / 10))));
  const margin = Math.max(0.5, noisePct * 1.5);
  return {
    status: "forecast",
    weeksObserved: Math.round(weeks * 10) / 10,
    sessionsObserved: ordered.length,
    currentE1rm: Math.round(current * 10) / 10,
    monthlyE1rmChangePct: Math.round(monthlyPct * 10) / 10,
    expectedMonthlyRangePct: [Math.round((monthlyPct - margin) * 10) / 10, Math.round((monthlyPct + margin) * 10) / 10],
    confidence: Math.round(confidence * 100) / 100,
    limitingSignals: noisePct > 8 ? ["High session-to-session variability"] : [],
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
