// Maps our fine-grained muscle keys → broad buckets used by the anatomy
// atlas (fitmitwith full-body GLB). Buckets match atlas muscle labels/groups.
export type BodyBucket =
  | "chest" | "front_delts" | "side_delts" | "rear_delts"
  | "lats" | "mid_back" | "traps" | "lower_back"
  | "biceps" | "triceps" | "forearms" | "grip"
  | "quads" | "hamstrings" | "glutes" | "adductors" | "calves"
  | "abs" | "obliques" | "neck";

const KEY_TO_BUCKET: Record<string, BodyBucket> = {
  chest: "chest", upper_chest: "chest", lower_chest: "chest",
  front_delts: "front_delts", side_delts: "side_delts", rear_delts: "rear_delts",
  lats: "lats", mid_back: "mid_back", upper_traps: "traps", lower_traps: "traps",
  erectors: "lower_back",
  biceps: "biceps", triceps: "triceps", forearms: "forearms", grip: "grip", fingers: "forearms",
  quads: "quads", hamstrings: "hamstrings", glutes: "glutes", glute_med: "glutes",
  adductors: "adductors", gastroc: "calves", soleus: "calves", tibialis: "calves", hip_flexors: "quads",
  upper_abs: "abs", lower_abs: "abs", abs: "abs", all_abs: "abs", obliques: "obliques",
  neck: "neck",
};

// Unknown muscle keys return null — never guess a bucket (unknown ≠ abs).
export const bucketOf = (muscle: string): BodyBucket | null => KEY_TO_BUCKET[muscle] ?? null;

// Atlas muscle label/group → bucket. Order matters — first match wins.
const ATLAS_RULES: [RegExp, BodyBucket][] = [
  [/clavicular|upper.*pec|pectoralis.*clav|anterior.*chest/i, "chest"],
  [/chest|sternal|sternocostal|pectoral/i, "chest"],
  [/anterior.*deltoid|clavicular.*deltoid|front.*deltoid/i, "front_delts"],
  [/deltoid.*middle|middle.*deltoid|lateral.*deltoid|side.*deltoid|acromial/i, "side_delts"],
  [/posterior.*deltoid|rear.*deltoid|deltoid.*posterior|spinal.*deltoid/i, "rear_delts"],
  [/deltoid|shoulder/i, "front_delts"],
  [/latissimus|lat /i, "lats"],
  [/trapezius.*middle|middle.*trapezius|rhomboid|mid.*trap/i, "mid_back"],
  [/trapezius.*upper|upper.*trapezius|levator/i, "traps"],
  [/trapezius.*lower|lower.*trapezius/i, "traps"],
  [/erector|spinalis|longissimus|iliocostalis|lower back|lumbar/i, "lower_back"],
  // Biceps femoris is a HAMSTRING — must run before the arm-biceps rule.
  [/hamstring|biceps femoris|semitendinosus|semimembranosus/i, "hamstrings"],
  [/biceps|brachii/i, "biceps"],
  [/triceps/i, "triceps"],
  [/brachioradialis|forearm|pronator|supinator|wrist flexor|wrist extensor|flexor.*carpi|extensor.*carpi/i, "forearms"],
  [/hand|finger|thumb|interossei|thenar|hypothenar/i, "grip"],
  [/quadriceps|vastus|rectus femoris|sartorius|gracilis/i, "quads"],
  [/gluteus maximus|glute max/i, "glutes"],
  [/gluteus medius|glute med|gluteus minimus|tensor fasciae/i, "glutes"],
  [/adductor/i, "adductors"],
  [/gastrocnemius|soleus|calf/i, "calves"],
  [/tibialis|peroneus|fibularis/i, "calves"],
  // Obliques BEFORE abs — an oblique muscle inside an "abdominal" group must
  // not be swallowed by the abs rule.
  [/obliqu|external oblique|internal oblique/i, "obliques"],
  [/rectus abdominis|transversus|abdominal|\babs\b/i, "abs"],
  [/sternocleidomastoid|neck/i, "neck"],
  [/pectoral/i, "chest"],
];

export function atlasBucket(muscleLabel: string, group: string): BodyBucket | null {
  const text = `${muscleLabel} ${group}`;
  for (const [re, b] of ATLAS_RULES) if (re.test(text)) return b;
  return null;
}

// Finer mapping: atlas mesh → our tracked muscle key. Where the atlas splits
// a muscle we actually track (soleus vs gastroc, deltoid heads, trap parts,
// glute med), the mesh can show its own recovery instead of the bucket color.
// Keys not in the stats simply fall back to their bucket.
const ATLAS_FINE_RULES: [RegExp, string][] = [
  [/clavicular|upper.*pec|pectoralis.*clav/i, "upper_chest"],
  [/sternal|sternocostal|costal/i, "lower_chest"],
  [/pectoral|chest/i, "chest"],
  [/anterior.*deltoid|clavicular.*deltoid|front.*deltoid/i, "front_delts"],
  [/middle.*deltoid|lateral.*deltoid|side.*deltoid|acromial/i, "side_delts"],
  [/posterior.*deltoid|rear.*deltoid|deltoid.*posterior|spinal.*deltoid/i, "rear_delts"],
  [/deltoid/i, "front_delts"],
  [/latissimus|lat /i, "lats"],
  [/trapezius.*upper|upper.*trapezius|levator/i, "upper_traps"],
  [/trapezius.*lower|lower.*trapezius/i, "lower_traps"],
  [/trapezius.*middle|middle.*trapezius|rhomboid|mid.*trap/i, "mid_back"],
  [/erector|spinalis|longissimus|iliocostalis|lower back|lumbar/i, "erectors"],
  [/hamstring|biceps femoris|semitendinosus|semimembranosus/i, "hamstrings"],
  [/biceps|brachii/i, "biceps"],
  [/triceps/i, "triceps"],
  [/hand|finger|thumb|interossei|thenar|hypothenar/i, "grip"],
  [/brachioradialis|forearm|pronator|supinator|wrist flexor|wrist extensor|flexor.*carpi|extensor.*carpi/i, "forearms"],
  [/quadriceps|vastus|rectus femoris|sartorius|gracilis/i, "quads"],
  [/gluteus medius|glute med|gluteus minimus|tensor fasciae/i, "glute_med"],
  [/gluteus maximus|glute max/i, "glutes"],
  [/adductor/i, "adductors"],
  [/gastrocnemius|calf/i, "gastroc"],
  [/soleus/i, "soleus"],
  [/tibialis|peroneus|fibularis/i, "tibialis"],
  [/psoas|iliacus|hip flexor/i, "hip_flexors"],
  [/obliqu/i, "obliques"],
  [/rectus abdominis|transversus|abdominal|\babs\b/i, "abs"],
  [/sternocleidomastoid|neck/i, "neck"],
];

export function atlasMuscleKey(muscleLabel: string, group: string): string | null {
  const text = `${muscleLabel} ${group}`;
  for (const [re, k] of ATLAS_FINE_RULES) if (re.test(text)) return k;
  return null;
}

// Fatigue (0=fresh … 1=fully unrecovered) → warm-neutral to deep red ramp.
// THE recovery ramp — body meshes sample the continuous lerp, list rows and
// legend swatches use the same function so they can never drift apart.
export function fatigueColor(f: number): string {
  const c = Math.max(0, Math.min(1, f));
  // #EDE5D3 (fresh paper) → #8E3419 (deep red). Two-stop lerp via mid tone.
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const mid = [0xC9, 0x6B, 0x45]; // #C96B45
  const rgb = c < 0.5 ? lerp([0xED, 0xE5, 0xD3], mid, c * 2) : lerp(mid, [0x8E, 0x34, 0x19], (c - 0.5) * 2);
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Named bands over the same ramp — labels and swatch colors always agree.
export const RECOVERY_STATES = [
  { label: "fresh", max: 0.15, swatchF: 0.07 },
  { label: "recovering", max: 0.45, swatchF: 0.3 },
  { label: "tired", max: 0.75, swatchF: 0.6 },
  { label: "overdue", max: 1.01, swatchF: 0.9 },
] as const;
export const recoveryStateIndex = (f: number): number =>
  Math.max(0, RECOVERY_STATES.findIndex((s) => f < s.max));
export const recoveryStateColor = (i: number): string =>
  fatigueColor(RECOVERY_STATES[Math.min(i, RECOVERY_STATES.length - 1)].swatchF);
