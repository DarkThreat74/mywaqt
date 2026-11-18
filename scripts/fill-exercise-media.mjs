// Eliminate stick-figure fallbacks: for every catalog exercise with no
// Open-GYM art mapping AND no self-hosted GIF —
//   1) fetch a real technique GIF (ExerciseDB, then fitnessprogramer WP)
//   2) else map it to the nearest existing Open-GYM pose art by name/
//      muscle/pattern similarity, appending to exercise-art-map.ts
// Usage: node scripts/fill-exercise-media.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';

const OUT = 'public/exercises';
mkdirSync(OUT, { recursive: true });

// ---- catalog: slug -> { name, muscle, pattern } ----
const ex = new Map();
{
  const cur = readFileSync('src/lib/workout/exercises.ts', 'utf8');
  for (const m of cur.matchAll(/\be\("([a-z0-9-]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g))
    ex.set(m[1], { name: m[2], muscle: m[3], pattern: m[4] });
  for (const f of ['exercises-extra.ts', 'exercises-wger.ts']) {
    const src = readFileSync('src/lib/workout/' + f, 'utf8');
    const re = /"slug":\s*"([^"]+)",\s*\n\s*"name":\s*"([^"]+)",\s*\n\s*"muscle":\s*"([^"]+)",\s*\n\s*"pattern":\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) if (!ex.has(m[1])) ex.set(m[1], { name: m[2], muscle: m[3], pattern: m[4] });
  }
}
// art map: ourSlug -> artSlug
const MAP_FILE = 'src/lib/workout/exercise-art-map.ts';
const art = new Map();
for (const m of readFileSync(MAP_FILE, 'utf8').matchAll(/^  "([a-z0-9-]+)": "([a-z0-9-]+)"/gm))
  art.set(m[1], m[2]);
const gifs = new Set(readdirSync(OUT).filter(f => f.endsWith('.gif')).map(f => f.slice(0, -4)));

const missing = [...ex.keys()].filter(s => !art.has(s) && !gifs.has(s));
console.log(`${ex.size} exercises | art ${art.size} | gifs ${gifs.size} | missing ${missing.length}`);
if (!missing.length) process.exit(0);

// ---- token scoring ----
const norm = s => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => norm(s).split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w));
const score = (have, want) => {
  const hw = new Set(words(have)); const ww = words(want);
  return ww.length ? ww.filter(w => hw.has(w)).length / ww.length : 0;
};
const j = async u => { try { const r = await fetch(u); if (!r.ok) return null; return JSON.parse(await r.text()); } catch { return null; } };
const dl = async (url, slug) => {
  try {
    const r = await fetch(url); if (!r.ok) return false;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 2000) return false;
    writeFileSync(`${OUT}/${slug}.gif`, b); return true;
  } catch { return false; }
};

// ---- 1. GIF fetch over missing slugs ----
let okN = 0; const still = [];
for (const slug of missing) {
  const name = ex.get(slug).name;
  const t = name.replace(/\([^)]*\)/g, '').trim();
  let done = false;
  const d = await j(`https://oss.exercisedb.dev/api/v1/exercises?name=${encodeURIComponent(t)}&limit=10`);
  const cands = (d?.data || []).filter(x => x.gifUrl);
  const best = cands.map(x => ({ x, s: score(x.name, name) })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= 0.45 && await dl(best.x.gifUrl, slug)) done = true;
  if (!done) {
    const posts = await j(`https://fitnessprogramer.com/wp-json/wp/v2/posts?search=${encodeURIComponent(t)}&per_page=6`);
    for (const p of (Array.isArray(posts) ? posts : [])) {
      const gif = (p.content?.rendered || '').match(/https?:\/\/[^"'\s]+\.gif/)?.[0];
      if (gif && await dl(gif, slug)) { done = true; break; }
    }
  }
  if (!done) {
    const media = await j(`https://fitnessprogramer.com/wp-json/wp/v2/media?search=${encodeURIComponent(t)}&per_page=8`);
    const gif = (Array.isArray(media) ? media : []).find(m => m.guid?.rendered?.endsWith('.gif'))?.guid?.rendered
      || (Array.isArray(media) ? media : []).find(m => m.source_url?.endsWith('.gif'))?.source_url;
    if (gif && await dl(gif, slug)) done = true;
  }
  if (done) okN++; else still.push(slug);
  await new Promise(r => setTimeout(r, 100));
}
console.log(`gifs downloaded: ${okN} | still art-less: ${still.length}`);

// ---- 2. Map leftovers to nearest real pose art ----
// Candidate donors: exercises already mapped to art. Score = token overlap
// + muscle bonus + pattern bonus. Same-pattern donor always beats same-name.
const donors = [...art.keys()].filter(s => ex.has(s))
  .map(s => ({ slug: s, art: art.get(s), t: new Set(words(ex.get(s).name)), muscle: ex.get(s).muscle, pattern: ex.get(s).pattern }));
const additions = [];
for (const slug of still) {
  const e = ex.get(slug);
  const wt = words(e.name);
  let bestS = 0, bestA = null;
  for (const d of donors) {
    const ov = wt.length ? wt.filter(w => d.t.has(w)).length / wt.length : 0;
    const s = ov + (d.muscle === e.muscle ? 0.3 : 0) + (d.pattern === e.pattern ? 0.2 : 0);
    if (s > bestS) { bestS = s; bestA = d.art; }
  }
  if (bestA) additions.push([slug, bestA, bestS.toFixed(2)]);
}
if (additions.length) {
  const block = additions.map(([s, a]) => `  "${s}": "${a}",`).join('\n');
  const src = readFileSync(MAP_FILE, 'utf8');
  const idx = src.lastIndexOf('};');
  writeFileSync(MAP_FILE, src.slice(0, idx) + block + '\n' + src.slice(idx));
}
console.log(`art mappings added: ${additions.length} | weakest matches:`,
  additions.filter(a => +a[2] < 0.6).slice(0, 15));
