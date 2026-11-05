// Strength standards for a lifter of a given bodyweight/sex, interpolated
// from Strength Level's 1RM datasets (48M+ logged lifts). Tables are kg.
// Thresholds per lift: [beginner, novice, intermediate, advanced, elite].

interface Std { m: number[]; f: number[] }
// Reference values at 75kg bodyweight, scaled allometrically below.
const REF75: Record<string, Std> = {
  bench:    { m: [46, 68, 93, 121, 150], f: [20, 32, 50, 66, 83] },
  squat:    { m: [60, 85, 113, 147, 180], f: [32, 52, 75, 102, 128] },
  deadlift: { m: [75, 103, 136, 175, 216], f: [38, 61, 90, 122, 152] },
  ohp:      { m: [29, 44, 61, 80, 101], f: [13, 22, 34, 46, 58] },
  row:      { m: [40, 59, 82, 108, 135], f: [18, 30, 48, 65, 83] },
};

// Strength scales sub-linearly with bodyweight: lighter lifters carry higher
// strength-to-weight ratios. Exponent fit to Strength Level male bench data
// (103kg elite at 50kg BW vs 225kg at 130kg BW → ~x^0.67).
const SCALE = 0.67;

const LEVELS = ["beginner", "novice", "intermediate", "advanced", "elite"] as const;
export type StrengthLevel = (typeof LEVELS)[number];

/** Absolute 1RM thresholds (kg) for a lifter of this bodyweight/sex. */
export function thresholdsFor(lift: keyof typeof REF75, bwKg: number, sex: "m" | "f"): number[] {
  const ref = REF75[lift]?.[sex] ?? REF75[lift].m;
  const scale = Math.pow(Math.max(bwKg, 30) / 75, SCALE);
  return ref.map((v) => Math.round(v * scale));
}

export function levelFor(lift: keyof typeof REF75, e1Kg: number, bwKg: number, sex: "m" | "f"): { level: StrengthLevel; next: StrengthLevel | null; nextKg: number | null; pctToNext: number | null } {
  const t = thresholdsFor(lift, bwKg, sex);
  let i = -1;
  while (i < 4 && e1Kg >= t[i + 1]) i++;
  const level = LEVELS[Math.max(i, 0)];
  if (i >= 4) return { level: "elite", next: null, nextKg: null, pctToNext: null };
  const floor = i >= 0 ? t[i] : 0;
  const nextKg = t[i + 1];
  return {
    level,
    next: LEVELS[i + 1],
    nextKg,
    pctToNext: Math.min(100, Math.round(((e1Kg - floor) / Math.max(nextKg - floor, 1)) * 100)),
  };
}

/** Map our exercise slugs onto the standard lift families. */
export const LIFT_SLUGS: Record<string, string[]> = {
  bench: ["barbell-bench-press", "incline-barbell-press", "machine-chest-press", "incline-dumbbell-press", "smith-bench-press", "dumbbell-bench-press"],
  squat: ["barbell-squat", "back-squat", "front-squat", "leg-press", "hack-squat", "smith-squat", "goblet-squat"],
  deadlift: ["conventional-deadlift", "sumo-deadlift", "trap-bar-deadlift", "romanian-deadlift", "rdl", "deadlift"],
  ohp: ["barbell-overhead-press", "overhead-press", "military-press", "seated-ohp", "push-press", "dumbbell-shoulder-press", "machine-shoulder-press"],
  row: ["barbell-row", "pendlay-row", "bent-dumbbell-row", "chest-supported-row", "seated-cable-row", "single-arm-cable-row", "helms-row", "t-bar-row", "wide-grip-pulldown"],
};
