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
  // second-pass synonyms for first-run misses
  "twenty-ones": ["21s", "seven seven seven curl", "barbell curl"],
  "guillotine-press": ["guillotine press", "neck press", "incline smith press"],
  "cambered-bar-bench": ["bench press", "deep bench press"],
  "neutral-grip-db-bench": ["neutral grip bench press", "dumbbell bench press neutral", "close grip dumbbell press"],
  "paused-bench": ["paused bench press", "bench press"],
  "lengthened-partial-bench": ["bench press partial", "bench press"],
  "low-to-high-cable-flye": ["low to high cable fly", "low cable fly", "cable crossover low"],
  "high-to-low-cable-flye": ["high to low cable fly", "high cable fly", "cable crossover"],
  "kneeling-cable-flye": ["kneeling cable fly", "cable fly"],
  "neutral-grip-pullup": ["neutral grip pull up", "parallel grip pull up", "hammer pull up"],
  "meadows-pulldown": ["one arm lat pulldown", "single arm lat pulldown"],
  "yates-row": ["underhand barbell row", "underhand bent over row", "reverse grip row"],
  "helms-row": ["single arm dumbbell row", "one arm dumbbell row", "chest supported dumbbell row"],
  "machine-row": ["machine row", "seated row machine", "plate loaded row"],
  "face-pull-er": ["face pull", "rope face pull"],
  "kelso-shrug": ["kelso shrug", "incline shrug", "scapular retraction"],
  "prone-w-raise": ["prone w raise", "w raise", "incline w raise"],
  "prone-t-raise": ["prone t raise", "t raise", "incline t raise"],
  "behind-back-db-lateral": ["behind back lateral raise", "behind the back lateral raise"],
  "lengthened-partial-lateral": ["lateral raise", "dumbbell lateral raise"],
  "scaption-raise": ["scaption", "scapular plane raise", "thumb up raise"],
  "prone-incline-lateral": ["incline lateral raise", "prone lateral raise", "chest supported lateral raise"],
  "incline-front-raise": ["incline front raise", "front raise"],
  "prone-rear-flye": ["incline reverse fly", "rear delt fly", "prone reverse fly"],
  "cable-crossbody-rear-flye": ["rear delt cable fly", "reverse cable fly", "cross body rear delt"],
  "incline-db-shrug": ["incline dumbbell shrug", "dumbbell shrug"],
  "behind-back-shrug": ["behind back shrug", "barbell shrug behind"],
  "trap-bar-shrug": ["trap bar shrug", "hex bar shrug"],
  "safety-bar-squat": ["safety bar squat", "safety squat bar"],
  "reclined-leg-extension": ["leg extension", "seated leg extension"],
  "spanish-squat": ["spanish squat", "band squat", "terminal knee extension squat"],
  "slider-leg-curl": ["slider leg curl", "towel leg curl", "sliding leg curl"],
  "deficit-rdl": ["deficit romanian deadlift", "romanian deadlift"],
  "snatch-grip-rdl": ["snatch grip deadlift", "romanian deadlift"],
  "kas-bridge": ["glute bridge", "barbell glute bridge"],
  "deficit-reverse-lunge": ["deficit lunge", "reverse lunge"],
  "calf-lengthened-partials": ["calf raise", "standing calf raise"],
  "slider-adduction": ["copenhagen", "copenhagen plank", "adductor side plank"],
  "sumo-squat": ["sumo squat", "wide stance squat", "plié squat"],
  "wide-grip-ez-curl": ["wide grip curl", "ez bar curl"],
  "narrow-grip-ez-curl": ["close grip curl", "ez bar curl"],
  "inverse-zottman": ["zottman curl", "dumbbell curl"],
  "pinwheel-curl": ["pinwheel curl", "cross body hammer curl"],
  "behind-back-db-curl": ["incline dumbbell curl", "dumbbell curl"],
  "double-biceps-cable-curl": ["overhead cable curl", "high cable curl", "cable curl"],
  "incline-db-overhead-ext": ["incline triceps extension", "overhead dumbbell extension", "incline overhead triceps"],
  "two-arm-db-overhead": ["dumbbell overhead triceps extension", "overhead triceps extension"],
  "behind-head-skullcrusher": ["skull crusher", "lying triceps extension"],
  "california-press": ["jm press", "close grip bench press"],
  "suspension-triceps": ["trx triceps extension", "suspension triceps", "bodyweight triceps extension"],
  "vbar-pressdown": ["v bar pushdown", "tricep pushdown", "triceps pushdown"],
  "reverse-grip-pressdown": ["reverse grip pushdown", "tricep pushdown"],
  "single-arm-pressdown": ["one arm tricep pushdown", "single arm pushdown", "tricep pushdown"],
  "cuff-pressdown": ["tricep pushdown", "cable triceps extension"],
  "rope-pressdown": ["rope pushdown", "rope tricep pushdown", "tricep pushdown rope"],
  "pronation-lever": ["wrist pronation", "forearm pronation"],
  "hub-lift": ["plate pinch", "pinch grip"],
  "thick-bar-hold": ["dead hang", "fat grip"],
  "hollow-rock": ["hollow hold", "hollow body"],
  "decline-reverse-crunch": ["reverse crunch", "decline crunch"],
  "mcgill-curl-up": ["curl up", "crunch"],
  "banded-chin-tuck": ["chin tuck", "neck flexion"],
  "neck-4way-machine": ["neck machine", "neck extension", "four way neck"],
  "iso-neck-4way": ["neck isometric", "neck exercise"],
  "banded-neck-extension": ["neck extension", "banded neck"],
  "partner-neck-curl": ["neck curl", "neck flexion"],
  "prone-neck-y-lift": ["prone y raise", "prone neck extension"],
  "wrestlers-bridge": ["neck bridge", "wrestlers bridge", "bridge neck"],
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
