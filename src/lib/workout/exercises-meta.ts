/**
 * Light exercise metadata — types + filter/group constants with NO catalog
 * data. Client components import from here so the ~2,000-entry exercise bank
 * (exercises.ts + generated extras) stays out of their initial JS chunk and
 * can be lazy-loaded via `import("@/lib/workout/exercises")`.
 */
export type LoadKind = "total" | "per_implement" | "added" | "band_estimate";

export interface Exercise {
  slug: string;
  name: string;
  muscle: string;        // fine-grained muscle key
  head?: string;         // sub-target: long_head|short_head|brachialis|upper|mid|lower|isometric|inner|outer|medial_head|lateral_head…
  pattern: string;       // movement pattern
  equip: string;         // barbell|dumbbell|cable|machine|smith|bodyweight|band
  compound?: boolean;
  tier?: "S" | "A" | "B" | "C" | "D" | "M" | "V";
  tierWhy?: string;      // evidence-based explanation shown under the badge
  cue: string;           // 1-line setup/execution cue
  howto?: string;        // detailed setup + execution (2-3 sentences)
  pros?: string;         // what makes it good — mechanism
  cons?: string;         // what makes it worse than alternatives
  source?: string;       // expert/study attribution
  img: string;
  uni?: boolean;         // inherently one-side-at-a-time → paired L/R set rows
  load?: LoadKind;       // how `weight` should be interpreted (defaulted from equip)
  family?: string;       // explicit variation-family override (else derived)
}

// muscle → parent group (two-level filter: group → head)
export const MUSCLE_GROUP: Record<string, string> = {
  chest: "chest", upper_chest: "chest", lower_chest: "chest",
  lats: "back", mid_back: "back", rear_delts: "back", erectors: "back", upper_traps: "back", lower_traps: "back",
  front_delts: "shoulders", side_delts: "shoulders",
  biceps: "biceps", triceps: "triceps", forearms: "forearms", grip: "forearms", fingers: "forearms",
  neck: "neck",
  quads: "legs", hamstrings: "legs", glutes: "legs", glute_med: "legs", gastroc: "legs", soleus: "legs",
  adductors: "legs", hip_flexors: "legs", tibialis: "legs",
  upper_abs: "abs", lower_abs: "abs", abs: "abs", obliques: "abs",
};

export const GROUPS: { key: string; label: string; heads: { key: string; label: string }[] }[] = [
  { key: "chest", label: "Chest", heads: [
    { key: "upper", label: "Upper (clavicular)" }, { key: "mid", label: "Mid" },
    { key: "lower", label: "Lower" }, { key: "isometric", label: "Isometric" }] },
  { key: "back", label: "Back", heads: [
    { key: "lats", label: "Lats" }, { key: "mid_back", label: "Mid traps / rhomboids" },
    { key: "rear_delts", label: "Rear delts" }, { key: "erectors", label: "Erectors" },
    { key: "upper_traps", label: "Upper traps" }, { key: "lower_traps", label: "Lower traps" }] },
  { key: "shoulders", label: "Shoulders", heads: [
    { key: "front_delts", label: "Front" }, { key: "side_delts", label: "Side" }] },
  { key: "biceps", label: "Biceps", heads: [
    { key: "long_head", label: "Long head" }, { key: "short_head", label: "Short head" }, { key: "brachialis", label: "Brachialis" }] },
  { key: "triceps", label: "Triceps", heads: [
    { key: "long_head", label: "Long head" }, { key: "lateral_head", label: "Lateral head" }, { key: "medial_head", label: "Medial head" }] },
  { key: "forearms", label: "Forearms", heads: [
    { key: "flexors", label: "Flexors" }, { key: "extensors", label: "Extensors" },
    { key: "grip", label: "Grip" }, { key: "fingers", label: "Fingers" }] },
  { key: "legs", label: "Legs", heads: [
    { key: "quads", label: "Quads" }, { key: "hamstrings", label: "Hamstrings" },
    { key: "glutes", label: "Glutes" }, { key: "glute_med", label: "Glute med" },
    { key: "gastroc", label: "Calves (gastroc)" }, { key: "soleus", label: "Calves (soleus)" },
    { key: "adductors", label: "Adductors" }, { key: "hip_flexors", label: "Hip flexors" },
    { key: "tibialis", label: "Tibialis" }] },
  { key: "abs", label: "Abs", heads: [
    { key: "upper_abs", label: "Upper" }, { key: "lower_abs", label: "Lower" },
    { key: "obliques", label: "Obliques" }, { key: "all_abs", label: "Whole core" }] },
  { key: "neck", label: "Neck", heads: [
    { key: "front", label: "Front" }, { key: "back", label: "Back" }, { key: "side", label: "Sides" }, { key: "rotation", label: "Rotation" }] },
];

export const MUSCLES = [
  { key: "chest", label: "Chest" }, { key: "upper_chest", label: "Upper chest" },
  { key: "lower_chest", label: "Lower chest" }, { key: "lats", label: "Lats" },
  { key: "mid_back", label: "Mid back / traps" }, { key: "rear_delts", label: "Rear delts" },
  { key: "erectors", label: "Erectors" }, { key: "front_delts", label: "Front delts" },
  { key: "side_delts", label: "Side delts" }, { key: "upper_traps", label: "Upper traps" },
  { key: "lower_traps", label: "Lower traps" }, { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" }, { key: "forearms", label: "Forearms" },
  { key: "grip", label: "Grip" }, { key: "fingers", label: "Fingers" },
  { key: "neck", label: "Neck" }, { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" }, { key: "glutes", label: "Glutes" },
  { key: "glute_med", label: "Glute med" }, { key: "gastroc", label: "Calves (gastroc)" },
  { key: "soleus", label: "Calves (soleus)" }, { key: "adductors", label: "Adductors" },
  { key: "hip_flexors", label: "Hip flexors" }, { key: "tibialis", label: "Tibialis" },
  { key: "upper_abs", label: "Upper abs" },
  { key: "lower_abs", label: "Lower abs" }, { key: "abs", label: "Abs" },
  { key: "obliques", label: "Obliques" },
] as const;

// Per-day day types — pick any of these for any weekday inside the editor.
export const DAY_TEMPLATES: Array<{ name: string; muscles: string[] }> = [
  { name: "Upper", muscles: ["chest", "upper_chest", "lats", "mid_back", "side_delts", "biceps", "triceps"] },
  { name: "Lower", muscles: ["quads", "hamstrings", "glutes", "erectors", "gastroc", "soleus"] },
  { name: "Legs", muscles: ["quads", "hamstrings", "glutes", "gastroc", "soleus"] },
  { name: "Push", muscles: ["chest", "upper_chest", "front_delts", "side_delts", "triceps"] },
  { name: "Push + Biceps", muscles: ["chest", "upper_chest", "front_delts", "side_delts", "triceps", "biceps"] },
  { name: "Pull", muscles: ["lats", "mid_back", "rear_delts", "biceps", "forearms"] },
  { name: "Pull + Triceps", muscles: ["lats", "mid_back", "rear_delts", "upper_traps", "biceps", "triceps"] },
  { name: "Arms", muscles: ["biceps", "triceps", "forearms", "grip"] },
  { name: "Abs + Shoulders", muscles: ["upper_abs", "lower_abs", "obliques", "front_delts", "side_delts", "rear_delts"] },
  { name: "Full Body", muscles: ["chest", "lats", "quads", "side_delts"] },
];

export const SPLIT_TEMPLATES: Record<string, { name: string; days: Record<number, { name: string; muscles: string[] }> }> = {
  week: {
    name: "Your 7-day split",
    days: {
      1: DAY_TEMPLATES[0], 2: DAY_TEMPLATES[1], 3: DAY_TEMPLATES[2],
      4: DAY_TEMPLATES[4], 5: DAY_TEMPLATES[6], 6: DAY_TEMPLATES[7], 0: DAY_TEMPLATES[8],
    },
  },
  ppl: {
    name: "Push / Pull / Legs",
    days: { 1: DAY_TEMPLATES[3], 3: DAY_TEMPLATES[5], 5: DAY_TEMPLATES[2] },
  },
  upper_lower: {
    name: "Upper / Lower",
    days: { 1: DAY_TEMPLATES[0], 2: DAY_TEMPLATES[1], 4: DAY_TEMPLATES[0], 5: DAY_TEMPLATES[1] },
  },
  full_body: {
    name: "Full Body ×3",
    days: { 1: DAY_TEMPLATES[9], 3: DAY_TEMPLATES[9], 5: DAY_TEMPLATES[9] },
  },
};
