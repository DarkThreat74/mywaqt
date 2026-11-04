export interface LoadRecommendation {
  kg: number;
  reason: "hold-high-rir" | "small-progress" | "late-fatigue" | "unknown-effort";
}

// Epley is reliable enough at low/moderate reps; high-rep sets are excluded
// by callers because their error grows rapidly beyond ~10-12 repetitions.
export function estimateE1rm(weightKg: number, reps: number): number {
  return reps > 0 && reps <= 12 ? weightKg * (1 + reps / 30) : weightKg;
}

// One source of truth for next-load guidance. Missing RIR is deliberately
// neutral: it must not be interpreted as failure and cause an aggressive jump.
export function recommendLoadKg(weightKg: number, rir: number | null | undefined, position = 0): LoadRecommendation {
  if (!(weightKg > 0)) return { kg: 0, reason: "unknown-effort" };
  if (rir == null) return { kg: weightKg, reason: "unknown-effort" };
  if (rir >= 3) return { kg: weightKg, reason: "hold-high-rir" };
  if (position >= 2 && rir <= 1) return { kg: weightKg, reason: "late-fatigue" };
  return { kg: weightKg * (rir === 2 ? 1.025 : 1.05), reason: "small-progress" };
}
