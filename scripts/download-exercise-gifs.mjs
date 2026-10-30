// Download technique GIFs for every EXERCISES slug missing public/exercises/<slug>.gif
// 1) ExerciseDB name search (best token-overlap match) → gifUrl
// 2) fallback: fitnessprogramer WP posts search → first .gif in content.rendered
// 3) fallback: fitnessprogramer WP media search → .gif attachment
// Usage: node scripts/download-exercise-gifs.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const SRC = 'src/lib/workout/exercises.ts';
const OUT = 'public/exercises';
mkdirSync(OUT, { recursive: true });

const src = readFileSync(SRC, 'utf8');
const entries = [...src.matchAll(/\be\("([a-z0-9-]+)",\s*"([^"]+)"/g)]
  .map(m => ({ slug: m[1], name: m[2] }));

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

// Extra search terms for slugs whose display name won't match source titles
const MAP = {
  "seated-db-press": ["seated dumbbell shoulder press"],
  "cuffed-lateral-raise": ["cable lateral raise"],
  "leanin-lateral-raise": ["lean away lateral raise"],
  "abduction-upright": ["hip abduction machine"],
  "abduction-lean-back": ["hip abduction machine"],
  "rope-climb": ["rope climb"],
  "hangboard-half-crimp": ["dead hang"],
  "hangboard-max-hang": ["weighted dead hang"],
  "hangboard-repeaters": ["dead hang"],
  "hangboard-one-arm": ["one arm hang"],
  "pinch-block-hang": ["plate pinch"],
  "stomach-vacuum": ["stomach vacuum"],
  "wrist-wrench": ["wrist curl"],
  "ball-squeeze-isometric": ["hip adduction"],
  "psoas-march": ["marching hip flexion", "seated knee raise"],
  "band-dorsiflexion": ["tibialis raise"],
  "tib-bar-raise": ["tibialis raise"],
  "push-up-plus": ["push up plus", "serratus punch"],
  "scapular-pullup": ["scapular pull up"],
  "one-half-squat": ["squat"],
  "bike": ["bicycle crunch"],
};

const missing = entries.filter(e => !existsSync(`${OUT}/${e.slug}.gif`));
console.log(`${entries.length} exercises, ${missing.length} missing GIFs`);

let okN = 0, edbN = 0; const failed = [];
for (const { slug, name } of missing) {
  const terms = [name.replace(/\([^)]*\)/g, '').trim(), ...(MAP[slug] || [])];
  let done = false;
  for (const t of terms) {
    // ExerciseDB name search — best token overlap
    const d = await j(`https://oss.exercisedb.dev/api/v1/exercises?name=${encodeURIComponent(t)}&limit=10`);
    const cands = (d?.data || []).filter(x => x.gifUrl);
    const best = cands.map(x => ({ x, s: score(x.name, name) + score(x.name, t) * 0.5 })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.45 && await dl(best.x.gifUrl, slug)) { okN++; edbN++; done = true; break; }
    // WP posts search → first .gif in content
    const posts = await j(`https://fitnessprogramer.com/wp-json/wp/v2/posts?search=${encodeURIComponent(t)}&per_page=6`);
    for (const p of (Array.isArray(posts) ? posts : [])) {
      const gif = (p.content?.rendered || '').match(/https?:\/\/[^"'\s]+\.gif/)?.[0];
      if (gif && await dl(gif, slug)) { okN++; done = true; break; }
    }
    if (done) break;
    // WP media search → .gif attachments
    const media = await j(`https://fitnessprogramer.com/wp-json/wp/v2/media?search=${encodeURIComponent(t)}&per_page=8`);
    const gif = (Array.isArray(media) ? media : []).find(m => m.guid?.rendered?.endsWith('.gif'))?.guid?.rendered
      || (Array.isArray(media) ? media : []).find(m => m.source_url?.endsWith('.gif'))?.source_url;
    if (gif && await dl(gif, slug)) { okN++; done = true; break; }
    await new Promise(r => setTimeout(r, 120));
  }
  if (!done) failed.push(slug);
}

const have = entries.filter(e => existsSync(`${OUT}/${e.slug}.gif`)).length;
console.log(`downloaded: ${okN} (${edbN} from ExerciseDB) | coverage: ${have}/${entries.length}`);
console.log(`failed (${failed.length}): ${failed.join(', ')}`);
