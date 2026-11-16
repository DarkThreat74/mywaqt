// Import Open-GYM / Workout Guide exercise illustrations (CC BY-SA 4.0,
// via Everkinetic pose art) as animated multi-frame SVG path data.
// Matches our catalog exercises to Open-GYM art by normalized name and
// writes public/exercise-art/<art>.txt + src/lib/workout/exercise-art-map.ts.
// Usage: node scripts/import-opengym-art.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OG = "https://raw.githubusercontent.com/smartworldarafath/Open-GYM/HEAD";
const OUT = join(root, "public/exercise-art");
mkdirSync(OUT, { recursive: true });

const SYNONYMS = [
  [/\bpushup\b/g, "push up"], [/\bpullup\b/g, "pull up"], [/\bchinup\b/g, "chin up"],
  [/\bpulldown\b/g, "pull down"], [/\bpushups\b/g, "push up"], [/\bpullups\b/g, "pull up"],
  [/\bchinups\b/g, "chin up"], [/\bpulldowns\b/g, "pull down"],
  [/\bflye\b/g, "fly"], [/\bflyes\b/g, "fly"], [/\bshrugs\b/g, "shrug"],
  [/\bcalfs\b/g, "calf"], [/\bglutes\b/g, "glute"], [/\blats\b/g, "lat"],
  [/\btraps\b/g, "trap"], [/\bdelts\b/g, "delt"], [/\babs\b/g, "ab"],
  [/\btbars?\b/g, "t bar"], [/\be ?z ?bar\b/g, "ez bar"],
  [/\bbattling\b/g, "battle"], [/\babdominals\b/g, "ab"], [/\bobliques\b/g, "oblique"],
  [/\bpressdowns?\b/g, "push down"], [/\bpushdowns?\b/g, "push down"],
  [/\bkickbacks?\b/g, "kickback"],
  [/\bshruggs?\b/g, "shrug"], [/\bwarmups?\b/g, "warm up"], [/\bcooldowns?\b/g, "cool down"],
];
const norm = (s) => {
  let n = s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ");
  for (const [re, rep] of SYNONYMS) n = n.replace(re, rep);
  return n.replace(/\s+/g, " ").trim();
};
const sing = (t) =>
  /(ches|shes|sses|xes|zes|oes)$/.test(t) ? t.slice(0, -2)
  : /ies$/.test(t) ? t.slice(0, -3) + "y"
  : t.replace(/s$/, "");
const tokens = (s) =>
  new Set(norm(s).split(" ").filter(Boolean).map(sing));

// ---- 1. Open-GYM catalog: name -> art slug ----
const catPath = join(root, "scripts/.og-catalog.dart");
if (!existsSync(catPath)) {
  const r = await fetch(`${OG}/lib/catalog/exercise_catalog.dart`);
  writeFileSync(catPath, await r.text());
}
const cat = readFileSync(catPath, "utf8");
const og = []; // { name, art }
{
  const re = /name:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(cat))) {
    const window = cat.slice(m.index, m.index + 1200);
    const a = window.match(/art:\s*'([^']*)'/);
    if (a && a[1]) og.push({ name: m[1], art: a[1] });
  }
}
console.log(`opengym exercises with art: ${og.length}`);

const ogByNorm = new Map(og.map((o) => [norm(o.name), o.art]));
const ogTokenSets = og.map((o) => ({ art: o.art, name: o.name, t: tokens(o.name) }));

// Aliases: canonical OG name -> [alt names]; index alt -> canonical art
// and add each alias as a token-match candidate too.
const aliasPath = join(root, "scripts/.og-aliases.dart");
if (!existsSync(aliasPath)) {
  const r = await fetch(`${OG}/lib/catalog/exercise_aliases.dart`);
  writeFileSync(aliasPath, await r.text());
}
{
  const al = readFileSync(aliasPath, "utf8");
  for (const m of al.matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) {
    const canon = ogByNorm.get(norm(m[1]));
    if (!canon) continue;
    for (const a of m[2].matchAll(/'([^']+)'/g)) {
      const k = norm(a[1]);
      if (!ogByNorm.has(k)) {
        ogByNorm.set(k, canon);
        ogTokenSets.push({ art: canon, name: a[1], t: tokens(a[1]) });
      }
    }
  }
}

// ---- 2. Our catalog: slug -> name ----
const ours = []; // { slug, name }
{
  const cur = readFileSync(join(root, "src/lib/workout/exercises.ts"), "utf8");
  for (const m of cur.matchAll(/\be\("([a-z0-9-]+)",\s*"([^"]+)"/g))
    ours.push({ slug: m[1], name: m[2] });
  for (const f of ["exercises-extra.ts", "exercises-wger.ts"]) {
    const src = readFileSync(join(root, "src/lib/workout", f), "utf8");
    const re = /"slug":\s*"([^"]+)",\s*\n\s*"name":\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) ours.push({ slug: m[1], name: m[2] });
  }
}
console.log(`our exercises: ${ours.length}`);

// ---- 3a. Art-slug list: descriptive file names (ez-bar-curl, etc.) ----
let artSlugs = [];
{
  const cacheFile = join(root, "scripts/.og-art-slugs.txt");
  if (existsSync(cacheFile)) {
    artSlugs = readFileSync(cacheFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  } else {
    const r = await fetch("https://api.github.com/repos/smartworldarafath/Open-GYM/contents/assets/art");
    const list = await r.json();
    artSlugs = list.map((f) => f.name.replace(/\.txt$/, ""));
    writeFileSync(cacheFile, artSlugs.join("\n") + "\n");
  }
}
const artTokenSets = artSlugs.map((a) => ({ art: a, t: tokens(a.replace(/-/g, " ")) }));

// ---- 3. Match names ----
const map = {}; // ourSlug -> artSlug
const misses = [];
for (const ex of ours) {
  const n = norm(ex.name);
  let art = ogByNorm.get(n);
  if (!art) {
    // token coverage: our tokens ⊆ og tokens (>=80%) or vice versa
    const ot = tokens(ex.name);
    let best = null, bestScore = 0;
    for (const o of ogTokenSets) {
      const inter = [...ot].filter((t) => o.t.has(t)).length;
      const score = inter / Math.max(ot.size, o.t.size);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (best && bestScore >= 0.8) art = best.art;
  }
  if (!art) {
    // subset match: all our tokens appear in an OG name (or vice versa) —
    // picks the candidate with the fewest extra tokens to stay specific
    const ot = tokens(ex.name);
    let best = null, bestExtra = Infinity;
    for (const o of ogTokenSets) {
      const oursIn = [...ot].every((t) => o.t.has(t));
      const ogIn = [...o.t].every((t) => ot.has(t));
      if (!oursIn && !ogIn) continue;
      const extra = Math.abs(o.t.size - ot.size);
      if (extra < bestExtra) { bestExtra = extra; best = o; }
    }
    // only trust tight subsets (<=2 token difference) to avoid wrong grabs
    if (best && bestExtra <= 2) art = best.art;
  }
  if (!art) {
    // equipment-insensitive pass: OG reuses one illustration across
    // barbell/dumbbell/machine variants, so strip gear words and retry
    const GEAR = new Set(["barbell", "dumbbell", "kettlebell", "cable", "machine",
      "smith", "band", "bands", "bodyweight", "lever", "bar", "ez", "plate", "with"]);
    const strip = (t) => new Set([...t].filter((x) => !GEAR.has(x)));
    const ot = strip(tokens(ex.name));
    if (ot.size >= 2) {
      let best = null, bestExtra = Infinity;
      for (const o of ogTokenSets) {
        const og = strip(o.t);
        if (og.size < 2) continue;
        const oursIn = [...ot].every((t) => og.has(t));
        const ogIn = [...og].every((t) => ot.has(t));
        if (!oursIn && !ogIn) continue;
        const extra = Math.abs(og.size - ot.size);
        if (extra < bestExtra) { bestExtra = extra; best = o; }
      }
      if (best && bestExtra <= 1) art = best.art;
    }
  }
  if (!art) {
    // art-slug pass: match our slug first (it's the most literal signal),
    // then the display name, against descriptive art file names
    for (const cand of [tokens(ex.slug.replace(/-/g, " ")), tokens(ex.name)]) {
      if (cand.size < 2) continue;
      let best = null, bestScore = 0;
      for (const a of artTokenSets) {
        if (a.t.size < 2) continue;
        const inter = [...cand].filter((t) => a.t.has(t)).length;
        const score = inter / Math.max(cand.size, a.t.size);
        if (score > bestScore) { bestScore = score; best = a; }
      }
      // require near-total overlap — art slugs are short, wrong grabs look bad
      if (best && bestScore >= 0.75) { art = best.art; break; }
    }
  }
  if (art) map[ex.slug] = art; else misses.push(ex.name);
}

// Manual overrides for matches the fuzzy passes got wrong — a wrong
// illustration is worse than the neutral diagram fallback.
const DENY = new Set([
  "back-lever", "barbell-incline-shoulder-raise", "smith-incline-shoulder-raise",
  "shoulder-raise", "shoulder-raise-dumbbell", "butterfly-sit-up",
  "clean", "dumbbell-clean", "dumbbell-hang-power-cleans", "power-clean",
  "power-clean-from-blocks", "smith-machine-hang-power-clean", "snatch",
  "elephant-walks", "bear-walk-2", "yoke-walk", "body-up", "body-ups",
  "muscle-up", "parallel-bar-hold", "ring-support-hold", "press-sit-up",
  "cable-flye",
]);
for (const s of DENY) {
  if (map[s]) { delete map[s]; misses.push(s); }
}
console.log(`matched: ${Object.keys(map).length}, unmatched: ${misses.length}`);

// ---- 4. Download art files (dedupe by art slug) ----
const needed = [...new Set(Object.values(map))];
let ok = 0, fail = 0;
for (const art of needed) {
  const dest = join(OUT, `${art}.txt`);
  if (existsSync(dest)) { ok++; continue; }
  try {
    const r = await fetch(`${OG}/assets/art/${art}.txt`);
    if (!r.ok) throw new Error(String(r.status));
    const body = await r.text();
    if (!body.trim()) throw new Error("empty");
    writeFileSync(dest, body);
    ok++;
  } catch (e) {
    console.log(`  FAIL ${art}: ${e.message}`);
    fail++;
  }
}
console.log(`art files: ${ok} ok, ${fail} failed`);

// ---- 5. Emit map ----
const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
const out = `// Auto-generated by scripts/import-opengym-art.mjs — do not edit by hand.
// ourSlug -> Open-GYM art slug. Art is CC BY-SA 4.0 (Workout Guide /
// Everkinetic pose illustrations via smartworldarafath/Open-GYM).
export const EXERCISE_ART: Record<string, string> = {
${entries.map(([s, a]) => `  ${JSON.stringify(s)}: ${JSON.stringify(a)},`).join("\n")}
};
`;
writeFileSync(join(root, "src/lib/workout/exercise-art-map.ts"), out);
console.log(`map written: ${entries.length} entries`);
if (misses.length) console.log("sample misses:", misses.slice(0, 15).join(" | "));
