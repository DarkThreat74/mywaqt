// Import wger.de exerciseinfo (CC-BY-SA/CC0 metadata) as EXERCISES_WGER.
// Metadata only — no images imported, so exercises render SVG art.
// Usage: node scripts/import-wger.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const cur = ["exercises.ts", "exercises-extra.ts"].map((f) =>
  readFileSync(join(root, "src/lib/workout", f), "utf8")).join("\n");
const takenSlugs = new Set([...cur.matchAll(/"slug":\s*"([^"]+)"|e\("([^"]+)"/g)].map((m) => m[1] || m[2]));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const takenNames = new Set([...cur.matchAll(/"name":\s*"([^"]+)"|e\("[^"]+",\s*"([^"]+)"/g)].map((m) => norm(m[1] || m[2])));

const MUSCLE = {
  abdominals: "abs", abs: "abs", abductors: "glute_med", adductors: "adductors",
  biceps: "biceps", calves: "gastroc", chest: "chest", forearms: "forearms",
  glutes: "glutes", hamstrings: "hamstrings", lats: "lats",
  "lower back": "erectors", "middle back": "mid_back", neck: "neck",
  quadriceps: "quads", quads: "quads", shoulders: "front_delts",
  traps: "upper_traps", triceps: "triceps",
};
const EQUIP = {
  barbell: "barbell", dumbbell: "dumbbell", machine: "machine", cable: "cable",
  kettlebell: "kettlebell", "body weight": "bodyweight", bodyweight: "bodyweight",
  bands: "band", band: "band", smith: "smith", "e-z curl bar": "barbell",
};

function pattern(name, instr) {
  const t = `${name} ${instr}`.toLowerCase();
  const has = (...ws) => ws.some((w) => t.includes(w));
  if (has("neck")) return "neck_multi";
  if (has("wrist")) return "wrist_flexion";
  if (has("finger", "grip", "pinch", "hang", "crush")) return has("crush") ? "crush_grip" : "static_grip";
  if (has("calf", "heel raise", "tibialis", "shin")) return has("tibialis") ? "dorsiflexion" : "plantar_flexion";
  if (has("shrug")) return "shrug";
  if (has("twist", "rotation", "woodchop")) return "rotation";
  if (has("crunch", "sit-up", "sit up", "v-up", "leg raise", "hollow")) return "spinal_flexion";
  if (has("plank", "hold", "isometric")) return "anti_extension";
  if (has("lunge", "split squat", "step-up", "step up", "bulgarian")) return "lunge";
  if (has("squat")) return "squat";
  if (has("deadlift", "rdl", "romanian", "good morning", "hyperextension", "hinge")) return "hinge";
  if (has("hip thrust", "glute bridge")) return "hip_extension";
  if (has("leg extension")) return "knee_extension";
  if (has("leg curl", "hamstring curl", "nordic")) return "knee_flexion";
  if (has("hip abduction", "clamshell", "fire hydrant", "band walk", "lateral walk")) return "abduction";
  if (has("hip adduction", "copenhagen")) return "adduction";
  if (has("pullover")) return "pullover";
  if (has("flye", "fly ", "crossover", "pec deck", "chest fly")) return has("incline") ? "incline_flye" : has("decline") ? "decline_flye" : "horizontal_flye";
  if (has("raise", "front raise", "lateral raise", "rear delt")) return has("rear", "face pull", "reverse fly") ? "rear_flye" : has("front") ? "front_raise" : "lateral_raise";
  if (has("pulldown", "pull-up", "pullup", "pull up", "chin-up", "chin up")) return "vertical_pull";
  if (has("row")) return "horizontal_pull";
  if (has("curl")) return "elbow_flexion";
  if (has("pressdown", "pushdown", "triceps", "skull", "kickback", "extension", "press")) {
    if (has("incline") && has("press")) return "incline_push";
    if (has("shoulder", "overhead", "military", "arnold", "push press", "z-press")) return "vertical_push";
    if (has("bench", "chest", "floor press", "incline press", "decline press", "landmine press")) return has("incline") ? "incline_push" : "horizontal_push";
    return "elbow_extension";
  }
  if (has("carry", "farmer", "suitcase", "walk")) return "carry";
  return "isometric";
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const UNI_RE = /single[- ]arm|one[- ]arm|single[- ]leg|one[- ]leg|unilateral|lunge|split[- ]squat|bulgarian|step[- ]up|pistol|cossack|meadows|concentration/i;

async function fetchAll() {
  const all = [];
  let url = "https://wger.de/api/v2/exerciseinfo/";
  while (url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`wger ${r.status}`);
    const j = await r.json();
    all.push(...j.results);
    url = j.next;
  }
  return all;
}

const raw = await fetchAll();
const out = [];
const unmappedMuscles = new Set();
let skipped = 0;
for (const x of raw) {
  const name = (x.translations || []).find((t) => t.language === 2)?.name
    || (x.translations || [])[0]?.name || "";
  if (!name || name.length > 80 || /[{}<>]/.test(name)) { skipped++; continue; }
  const n = norm(name);
  if (takenNames.has(n)) { skipped++; continue; }
  let slug = slugify(name);
  if (!slug || takenSlugs.has(slug)) { slug = `${slug}-w${out.length}`; }
  if (takenSlugs.has(slug)) { skipped++; continue; }
  takenSlugs.add(slug); takenNames.add(n);
  const wmuscle = (x.muscles || [])[0]?.name_en || "";
  const muscle = MUSCLE[wmuscle.toLowerCase()] || (unmappedMuscles.add(wmuscle), "abs");
  const equip = EQUIP[((x.equipment || [])[0]?.name || "").toLowerCase()] || "bodyweight";
  const desc = (x.translations?.[0]?.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  out.push({
    slug, name, muscle,
    pattern: pattern(name, desc.slice(0, 200)),
    equip,
    cue: (desc || name).slice(0, 110),
    howto: desc ? desc.slice(0, 400) : undefined,
    img: `/exercises/${slug}.gif`,
    uni: UNI_RE.test(name) || undefined,
    source: "wger",
  });
}

const header = `import type { Exercise } from "./exercises";\n\n// Auto-generated by scripts/import-wger.mjs — do not edit by hand.\n// wger.de exerciseinfo (CC-BY-SA/CC0 metadata; images not imported).\nexport const EXERCISES_WGER: Exercise[] = `;
writeFileSync(join(root, "src/lib/workout/exercises-wger.ts"), header + JSON.stringify(out, null, 1) + ";\n");
console.log(`imported ${out.length}, skipped ${skipped}`);
if (unmappedMuscles.size) console.log("unmapped muscles:", [...unmappedMuscles].join(", "));
