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
  upper_abs: "abs", lower_abs: "abs", abs: "abs", obliques: "obliques",
  neck: "neck",
};

export const bucketOf = (muscle: string): BodyBucket => KEY_TO_BUCKET[muscle] ?? "abs";

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
  [/biceps|brachii/i, "biceps"],
  [/triceps/i, "triceps"],
  [/brachioradialis|forearm|pronator|supinator|wrist flexor|wrist extensor|flexor.*carpi|extensor.*carpi/i, "forearms"],
  [/hand|finger|thumb|interossei|thenar|hypothenar/i, "grip"],
  [/quadriceps|vastus|rectus femoris|sartorius|gracilis/i, "quads"],
  [/hamstring|biceps femoris|semitendinosus|semimembranosus/i, "hamstrings"],
  [/gluteus maximus|glute max/i, "glutes"],
  [/gluteus medius|glute med|gluteus minimus|tensor fasciae/i, "glutes"],
  [/adductor/i, "adductors"],
  [/gastrocnemius|soleus|calf/i, "calves"],
  [/tibialis|peroneus|fibularis/i, "calves"],
  [/rectus abdominis|transversus|abs|abdominal/i, "abs"],
  [/obliqu|external oblique|internal oblique/i, "obliques"],
  [/sternocleidomastoid|neck/i, "neck"],
  [/pectoral/i, "chest"],
];

export function atlasBucket(muscleLabel: string, group: string): BodyBucket | null {
  const text = `${muscleLabel} ${group}`;
  for (const [re, b] of ATLAS_RULES) if (re.test(text)) return b;
  return null;
}

// Fatigue (0=fresh … 1=fully unrecovered) → warm-neutral to deep red ramp.
export function fatigueColor(f: number): string {
  const c = Math.max(0, Math.min(1, f));
  // #EDE5D3 (fresh paper) → #8E3419 (deep red). Two-stop lerp via mid tone.
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const mid = [0xC9, 0x6B, 0x45]; // #C96B45
  const rgb = c < 0.5 ? lerp([0xED, 0xE5, 0xD3], mid, c * 2) : lerp(mid, [0x8E, 0x34, 0x19], (c - 0.5) * 2);
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
