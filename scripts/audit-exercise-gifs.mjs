// Audit public/exercises/<slug>.gif against ExerciseDB with STRICT matching.
// Re-downloads only when a candidate passes strict token + target-muscle
// validation (or a title-checked fitnessprogramer post). Writes
// scripts/gif-fix-report.json: [{slug, source, matchedName}]
// Usage: node scripts/audit-exercise-gifs.mjs [slug ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const SRC = 'src/lib/workout/exercises.ts';
const OUT = 'public/exercises';
const REPORT = 'scripts/gif-fix-report.json';
mkdirSync(OUT, { recursive: true });

const src = readFileSync(SRC, 'utf8');
// reuse the synonym MAP from the original downloader
const mapSrc = src.includes('const MAP') ? '' :
  readFileSync('scripts/download-exercise-gifs.mjs', 'utf8');
const MAP = eval('(' + (mapSrc.match(/const MAP = (\{[\s\S]*?\n\});/)?.[1] || '{}') + ')');

const entries = [...src.matchAll(/\be\("([a-z0-9-]+)",\s*"([^"]+)",\s*"([a-z_]+)"/g)]
  .map(m => ({ slug: m[1], name: m[2], muscle: m[3] }));

const only = process.argv.slice(2);
const list = only.length ? entries.filter(e => only.includes(e.slug)) : entries;

const UA = { 'User-Agent': 'Mozilla/5.0 (audit-gifs)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async u => {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(u, { headers: UA });
      if (r.ok) { const t = await r.text(); try { return JSON.parse(t); } catch { /* 1102 etc */ } }
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(700 * (i + 1));
  }
  return null;
};
const dl = async (url, slug) => {
  try {
    const r = await fetch(url, { headers: UA }); if (!r.ok) return false;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 2000) return false;
    writeFileSync(`${OUT}/${slug}.gif`, b); return true;
  } catch { return false; }
};

// ── token machinery ──────────────────────────────────────────────
const EQUIP = new Set(['machine','cable','barbell','dumbbell','smith','band','banded','bodyweight','kettlebell','ez','lever','weighted','suspension','trx','plate','sled','trap','hex','cambered','v','vbar','rope','thick','fat','towel','cuff','partner','sliders','slider','stability','ball','swiss','medicine','landmine','tib','hangboard','ab','wheel','mini','resistance','assisted','bench']);
const POSTURE = new Set(['seated','standing','lying','prone','supine','kneeling','half','incline','decline','flat','bent','upright','lean','overhead','behind','front','deficit','paused','single','double','one','two','arm','hand','grip','cross','crossbody','floor','side','lateral','high','low','45','90','reclined','split']);
const SYN = {
  flye: ['fly','flye'], fly: ['fly','flye'],
  pushup: ['push','up'], 'push-up': ['push','up'],
  pressdown: ['pushdown','pressdown'], pushdown: ['pushdown','pressdown'],
  pullup: ['pull','up'], pulldown: ['pull','down'],
  db: ['dumbbell'], bb: ['barbell'],
  kickback: ['kickback'], extensions: ['extension'],
  rdl: ['romanian','deadlift'], 'dead-lift': ['deadlift'],
  'pull-over': ['pullover'], pullover: ['pullover'],
  skullcrusher: ['skull','crusher','triceps','extension','lying'],
  '21s': ['twenty','ones','barbell','curl'],
  chinup: ['chin','up'], 'chin-up': ['chin','up'],
  situp: ['sit','up'], 'sit-up': ['sit','up'],
  shrug: ['shrug'], raises: ['raise'],
  'leg-press': ['leg','press'],
};
const norm = s => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[+\u00d7x]/g, ' x ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const toks = s => {
  const out = [];
  for (const w of norm(s).split(' ')) {
    if (!w || /^\d+$/.test(w)) { if (w === '21' || w === '45' || w === '90') out.push(w); continue; }
    const e = SYN[w]; if (e) out.push(...e); else out.push(w);
  }
  return out;
};

// bank muscle -> compatible ExerciseDB targetMuscles
const GROUP = {
  chest: 'chest', upper_chest: 'chest', lower_chest: 'chest',
  lats: 'back', mid_back: 'back', rear_delts: 'back', erectors: 'back',
  upper_traps: 'back', lower_traps: 'back',
  front_delts: 'delts', side_delts: 'delts',
  biceps: 'biceps', triceps: 'triceps',
  forearms: 'forearms', grip: 'forearms', fingers: 'forearms',
  neck: 'neck',
  quads: 'quads', hamstrings: 'hamstrings',
  glutes: 'glutes', glute_med: 'glutes',
  gastroc: 'calves', soleus: 'calves', tibialis: 'calves',
  adductors: 'adductors', hip_flexors: 'hipflex',
  upper_abs: 'abs', lower_abs: 'abs', abs: 'abs', obliques: 'abs',
};
const TARGET_OK = {
  chest: ['pectorals', 'serratus anterior'],
  back: ['lats', 'traps', 'upper back', 'levator scapulae', 'spine', 'erector spinae', 'deltoids', 'delts', 'serratus anterior'],
  delts: ['delts', 'deltoids', 'traps', 'pectorals', 'serratus anterior'],
  biceps: ['biceps', 'forearms'],
  triceps: ['triceps'],
  forearms: ['forearms', 'biceps', 'triceps'],
  neck: ['*'], // exercisedb has no neck target; token match only
  quads: ['quads', 'quadriceps'],
  hamstrings: ['hamstrings', 'glutes'],
  glutes: ['glutes', 'abductors', 'adductors', 'hamstrings', 'quads', 'quadriceps'],
  calves: ['calves'],
  adductors: ['adductors', 'glutes', 'quads', 'quadriceps'],
  hipflex: ['quads', 'quadriceps', 'abs', 'glutes', 'hamstrings'],
  abs: ['abs'],
};
// action words that would contradict a different muscle group
const CONTRA = {
  biceps: ['squat','lunge','leg','calf','glute','deadlift','row','press','fly','raise','extension','pulldown','shrug','crunch','kickback'],
  triceps: ['squat','lunge','leg','calf','glute','deadlift','row','curl','pull','shrug','crunch','fly'],
  chest: ['curl','squat','lunge','calf','extension','row','pull','shrug','crunch','kickback','leg','glute','deadlift','raise'],
  back: ['curl','press','squat','lunge','calf','crunch','kickback','extension'],
  delts: ['curl','squat','lunge','calf','crunch','kickback','leg','extension','pulldown','row'],
  quads: ['curl','press','row','pull','crunch','shrug','fly','raise','extension'], // extension allowed? leg extension = quads -> handled below
  hamstrings: ['press','row','pull','crunch','shrug','fly','raise','curl?'],
  calves: ['press','row','pull','crunch','shrug','fly','curl','squat?'],
  abs: ['curl','squat','lunge','press','row','shrug','raise','extension','kickback','leg'],
  forearms: ['squat','lunge','press','row','crunch','fly','leg'],
  neck: ['triceps','biceps','quad','glute','calf','chest','pec','press','row','squat','lunge','crunch','shrug','pushdown','pulldown','kickback','fly','raise','deadlift'],
};
// words in CANDIDATE names we ignore for contra-check when bank name also has them
const isContra = (candToks, bankToks, muscle) => {
  const g = GROUP[muscle]; const bad = CONTRA[g] || [];
  const bset = new Set(bankToks);
  return candToks.some(t => bad.includes(t) && !bset.has(t) &&
    !(t === 'extension' && (g === 'quads' || muscle === 'triceps' || g === 'back')) &&
    !(t === 'curl' && (g === 'hamstrings' || g === 'biceps')) &&
    !(t === 'raise' && g === 'delts') &&
    !(t === 'kickback' && muscle === 'triceps'));
};

const targetOk = (x, muscle) => {
  const ok = TARGET_OK[GROUP[muscle]] || ['*'];
  if (ok.includes('*')) return true;
  const tm = (x.targetMuscles || []).map(s => s.toLowerCase());
  const sm = (x.secondaryMuscles || []).map(s => s.toLowerCase());
  return tm.some(t => ok.includes(t)) || (tm.length === 0 && sm.some(t => ok.includes(t)));
};

// required tokens: all non-equipment bank-name tokens must appear in candidate;
// posture tokens may be missing (seated vs standing variant is acceptable)
const strictMatch = (bankToks, candToks) => {
  const cset = new Set(candToks);
  const need = bankToks.filter(t => !EQUIP.has(t));
  const hardMissing = need.filter(t => !cset.has(t) && !POSTURE.has(t));
  if (hardMissing.length) return false;
  // require at least one distinguishing non-posture token (action or muscle word)
  const action = need.filter(t => !POSTURE.has(t));
  return action.length === 0 || action.some(t => cset.has(t));
};
// extra meaningful tokens the candidate adds (e.g. "hammer" in preacher curl)
const extraToks = (bankToks, candToks) =>
  [...new Set(candToks)].filter(t => !new Set(bankToks).has(t) && !EQUIP.has(t) && !POSTURE.has(t));

// ── search terms per exercise ────────────────────────────────────
const terms = e => {
  const t = [e.name.replace(/\([^)]*\)/g, '').trim()];
  const slugWords = e.slug.replace(/-/g, ' ');
  if (norm(slugWords) !== norm(t[0])) t.push(slugWords);
  for (const s of [...(AUDIT_EXTRA[e.slug] || []), ...(MAP[e.slug] || [])]) if (!t.includes(s)) t.push(s);
  return t;
};

// audit-only extra search terms (per slug), beyond the old MAP
const AUDIT_EXTRA = {
  "leg-extension": ["lever leg extension", "machine leg extension", "seated leg extension"],
  "db-overhead-extension": ["single arm overhead triceps extension", "one arm dumbbell triceps extension", "dumbbell overhead triceps extension single arm"],
  "jm-press": ["jm press", "close grip bench press triceps", "smith close grip press"],
  "reverse-nordic": ["sissy squat", "bodyweight leg extension", "nordic", "reverse nordic curl"],
  "towel-pullup": ["towel pull up", "towel grip pull up", "towel hang"],
  "rice-bucket": ["rice bucket", "hand digs", "finger extension"],
  "fat-grip-curl": ["thick bar curl", "fat grip curl", "fat gripz curl", "thick grip dumbbell curl"],
  "front-squat": ["barbell front squat", "front squat"],
};

// muscle word -> which bank groups it is compatible with (for WP title check)
const MUSCLE_WORD = {
  bicep: ['biceps'], biceps: ['biceps'], tricep: ['triceps'], triceps: ['triceps'],
  quad: ['quads'], quads: ['quads'], quadriceps: ['quads'],
  hamstring: ['hamstrings'], hamstrings: ['hamstrings'],
  glute: ['glutes'], glutes: ['glutes'], butt: ['glutes'],
  calf: ['calves'], calves: ['calves'], tibialis: ['calves'],
  chest: ['chest'], pec: ['chest'], pecs: ['chest'], pectoral: ['chest'],
  shoulder: ['delts','back'], shoulders: ['delts','back'], delt: ['delts'], delts: ['delts'],
  lat: ['back'], lats: ['back'], trap: ['back'], traps: ['back'],
  forearm: ['forearms'], forearms: ['forearms'], wrist: ['forearms'], grip: ['forearms'],
  abs: ['abs'], ab: ['abs'], core: ['abs','hipflex'], oblique: ['abs'],
  neck: ['neck'],
};

const ACTION = new Set(['press','push','pushdown','pull','pullup','pulldown','row','curl','extension','flexion','raise','fly','flye','squat','lunge','deadlift','hip','thrust','bridge','crunch','sit','plank','shrug','kickback','dip','dips','rotation','twist','abduction','adduction','hyperextension','pullover','up','down','hold','hang','carry','march','tuck','roll','circle','bend','sweep','chop','climb','step','jump','swing','clean','snatch','jerk','pinch','dig','digs','wring','wrench','pronation','supination','dorsiflexion','crunch','reverse','nordic']);

const report = [];
let audited = 0, corrected = 0, kept = 0;
for (const e of list) {
  audited++;
  const bankToks = toks(e.name);
  let found = null;
  for (const t of terms(e)) {
    const d = await j(`https://oss.exercisedb.dev/api/v1/exercises?name=${encodeURIComponent(t)}&limit=15`);
    const cands = (d?.data || []).filter(x => x.gifUrl);
    const scored = cands
      .filter(x => strictMatch(bankToks, toks(x.name)) &&
        targetOk(x, e.muscle) &&
        !isContra(toks(x.name), bankToks, e.muscle))
      .map(x => ({ x, s: bankToks.filter(b => new Set(toks(x.name)).has(b)).length / bankToks.length
        - 0.25 * extraToks(bankToks, toks(x.name)).length }))
      .sort((a, b) => b.s - a.s);
    if (scored[0]) { found = { source: 'exercisedb', name: scored[0].x.name, url: scored[0].x.gifUrl }; break; }
    await sleep(80);
  }
  // fallback: fitnessprogramer post title check — stricter: title must share
  // an action token AND have no unexplained extra action token
  if (!found) {
    for (const t of terms(e)) {
      const posts = await j(`https://fitnessprogramer.com/wp-json/wp/v2/posts?search=${encodeURIComponent(t)}&per_page=4`);
      for (const p of (Array.isArray(posts) ? posts : [])) {
        const title = (p.title?.rendered || '').replace(/<[^>]+>/g, '');
        const pt = toks(title);
        if (!strictMatch(bankToks, pt) || isContra(pt, bankToks, e.muscle)) continue;
        const bset = new Set(bankToks);
        if (!pt.some(w => ACTION.has(w) && bset.has(w))) continue;      // shared action
        if (pt.some(w => ACTION.has(w) && !bset.has(w) && !POSTURE.has(w) && !EQUIP.has(w))) continue;
        if (pt.some(w => MUSCLE_WORD[w] && !MUSCLE_WORD[w].includes(GROUP[e.muscle]))) continue;
        const gif = (p.content?.rendered || '').match(/https?:\/\/[^"'\s]+\.gif/)?.[0];
        if (gif) { found = { source: 'fitnessprogramer', name: title, url: gif }; break; }
      }
      if (found) break;
      await sleep(80);
    }
  }
  if (found) {
    const ok = await dl(found.url, e.slug);
    if (ok) { corrected++; report.push({ slug: e.slug, source: found.source, matchedName: found.name }); }
    else { kept++; report.push({ slug: e.slug, source: 'kept-existing', matchedName: `download-failed: ${found.name}` }); }
  } else {
    kept++; report.push({ slug: e.slug, source: 'kept-existing', matchedName: null });
  }
  if (audited % 25 === 0) console.log(`${audited}/${list.length} audited, ${corrected} corrected`);
  await new Promise(r => setTimeout(r, 60));
}
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`DONE audited=${audited} corrected=${corrected} kept=${kept}`);
console.log('kept-existing slugs:', report.filter(r => r.source === 'kept-existing').map(r => r.slug).join(', '));
