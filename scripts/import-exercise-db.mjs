// Import free-exercise-db (Unlicense) into the workout catalog as
// EXERCISES_EXTRA — curated entries in exercises.ts always win on name clashes.
// Usage: node scripts/import-exercise-db.mjs [path-to-exercises.json]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] || join(root, "fed-tmp.json");
const data = JSON.parse(readFileSync(src, "utf8"));

// Existing catalog — slugs and normalized names to dedupe against.
const cur = readFileSync(join(root, "src/lib/workout/exercises.ts"), "utf8");
const takenSlugs = new Set([...cur.matchAll(/e\("([^"]+)"/g)].map((m) => m[1]));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const takenNames = new Set([...cur.matchAll(/e\("[^"]+",\s*"([^"]+)"/g)].map((m) => norm(m[1])));

const MUSCLE = {
  abdominals: "abs", abductors: "glute_med", adductors: "adductors",
  biceps: "biceps", calves: "gastroc", chest: "chest", forearms: "forearms",
  glutes: "glutes", hamstrings: "hamstrings", lats: "lats",
  "lower back": "erectors", "middle back": "mid_back", neck: "neck", quadriceps: "quads",
  shoulders: "front_delts", traps: "upper_traps", triceps: "triceps",
};
const EQUIP = {
  "body only": "bodyweight", dumbbell: "dumbbell", barbell: "barbell",
  cable: "cable", machine: "machine", kettlebells: "kettlebell",
  bands: "band", "e-z curl bar": "barbell", "medicine ball": "bodyweight",
  "exercise ball": "bodyweight", "foam roll": "bodyweight", other: "bodyweight",
};

function pattern(name, instr, muscle) {
  const t = `${name} ${instr[0] || ""}`.toLowerCase();
  const has = (...ws) => ws.some((w) => t.includes(w));
  if (has("neck")) return muscle === "neck" ? "neck_flexion" : "neck_multi";
  if (has("wrist")) return "wrist_flexion";
  if (has("finger", "grip", "pinch", "hang")) return has("crush") ? "crush_grip" : "static_grip";
  if (has("calf", "calves", "heel raise", "tibialis", "shin")) return has("tibialis", "dorsiflex") ? "dorsiflexion" : "plantar_flexion";
  if (has("shrug", "scapula", "scap ")) return "shrug";
  if (has("twist", "rotation", "woodchop", "Russian")) return "rotation";
  if (has("crunch", "sit-up", "sit up", "v-up", "leg raise", "hollow")) return "spinal_flexion";
  if (has("plank", "hold", "isometric", "static")) return "anti_extension";
  if (has("lunge", "split squat", "step-up", "step up")) return "lunge";
  if (has("squat", "sissy")) return "squat";
  if (has("deadlift", "rdl", "romanian", "good morning", "hyperextension", "back extension", "hinge")) return "hinge";
  if (has("hip thrust", "glute bridge", "bridge")) return "hip_extension";
  if (has("leg extension", "knee extension")) return "knee_extension";
  if (has("leg curl", "hamstring curl", "nordic")) return "knee_flexion";
  if (has("hip abduction", "clamshell", "fire hydrant", "band walk", "lateral walk")) return "abduction";
  if (has("hip adduction", "copenhagen", "squeeze ball")) return "adduction";
  if (has("pullover")) return "pullover";
  if (has("flye", "fly ", "crossover", "pec deck", "chest fly")) return has("incline") ? "incline_flye" : has("decline") ? "decline_flye" : "horizontal_flye";
  if (has("raise", "front raise", "lateral raise", "rear delt")) return has("rear", "face pull", "reverse fly") ? "rear_flye" : has("front") ? "front_raise" : "lateral_raise";
  if (has("pulldown", "pull-up", "pullup", "pull up", "chin-up", "chin up", "lat pulldown")) return "vertical_pull";
  if (has("row", "shrug")) return "horizontal_pull";
  if (has("curl")) return "elbow_flexion";
  if (has("pressdown", "pushdown", "triceps", "skull", "kickback", "extension", "press")) {
    if (has("incline") && has("press")) return "incline_push";
    if (has("shoulder", "overhead", "military", "arnold", "push press")) return "vertical_push";
    if (has("bench", "chest", "floor press", "incline press", "decline press")) return has("incline") ? "incline_push" : "horizontal_push";
    return "elbow_extension";
  }
  if (has("carry", "farmer", "suitcase", "walk")) return "carry";
  return "isometric";
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const UNI_RE = /single[- ]arm|one[- ]arm|single[- ]leg|one[- ]leg|unilateral|lunge|split[- ]squat|bulgarian|step[- ]up|pistol|cossack|meadows|concentration/i;

const out = [];
const seen = new Set();
let skipped = 0;
for (const x of data) {
  const name = (x.name || "").trim();
  if (!name || name.length > 80) { skipped++; continue; }
  const n = norm(name);
  if (takenNames.has(n)) { skipped++; continue; }
  let slug = slugify(name);
  if (!slug || takenSlugs.has(slug) || seen.has(slug)) { slug = `${slug}-${seen.size}`; }
  if (takenSlugs.has(slug)) { skipped++; continue; }
  seen.add(slug); takenSlugs.add(slug); takenNames.add(n);
  const muscle = MUSCLE[(x.primaryMuscles || [])[0]] || "abs";
  const equip = EQUIP[x.equipment] || "bodyweight";
  const instr = Array.isArray(x.instructions) ? x.instructions : [];
  const cue = (instr[0] || name).replace(/\.$/, "").slice(0, 110);
  out.push({
    slug, name, muscle,
    pattern: pattern(name, instr, muscle),
    equip,
    cue,
    howto: instr.slice(0, 3).join(" ").slice(0, 400) || undefined,
    img: `/exercises/${slug}.gif`,
    uni: UNI_RE.test(name) || undefined,
    source: "free-exercise-db",
  });
}

const header = `import type { Exercise } from "./exercises";\n\n// Auto-generated by scripts/import-exercise-db.mjs — do not edit by hand.\n// free-exercise-db (Unlicense). Curated entries in exercises.ts win clashes.\nexport const EXERCISES_EXTRA: Exercise[] = `;
writeFileSync(join(root, "src/lib/workout/exercises-extra.ts"), header + JSON.stringify(out, null, 1) + ";\n");
console.log(`imported ${out.length}, skipped ${skipped}, total catalog ${out.length + 367}`);
const unmapped = [...new Set(data.map((x) => x.primaryMuscles?.[0]).filter((m) => m && !MUSCLE[m]))];
if (unmapped.length) console.log("unmapped muscles:", unmapped.join(", "));
