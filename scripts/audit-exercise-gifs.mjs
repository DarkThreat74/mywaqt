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
const POSTURE = new Set(['seated','standing','lying','prone','supine','kneeling','half','incline','decline','flat','bent','upright','lean','overhead','behind','front','deficit','paused','single','double','one','two','arm','hand','grip','cross','crossbody','floor','side','lateral','high','low','45','90','reclined','split','conventional','back']);
const SYN = {
  flye: ['fly'], fly: ['fly'],
  pushup: ['push','up'], 'push-up': ['push','up'],
  pressdown: ['pushdown'], pushdown: ['pushdown'],
  pullup: ['pull','up'], pulldown: ['pull','down'],
  db: ['dumbbell'], bb: ['barbell'],
  kickback: ['kickback'], extensions: ['extension'],
  rdl: ['romanian','deadlift'], 'dead-lift': ['deadlift'],
  'pull-over': ['pullover'], pullover: ['pullover'],
  skullcrusher: ['skullcrusher'], crusher: ['skullcrusher'], skull: ['skull'],
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
  chest: ['pectorals', 'pectoralis major', 'serratus anterior', 'triceps'],
  back: ['lats', 'latissimus dorsi', 'traps', 'trapezius', 'upper back', 'levator scapulae', 'spine', 'erector spinae', 'deltoids', 'delts', 'serratus anterior', 'rhomboids', 'glutes', 'hamstrings', 'biceps'],
  delts: ['delts', 'deltoids', 'traps', 'trapezius', 'pectorals', 'pectoralis major', 'serratus anterior'],
  biceps: ['biceps', 'biceps brachii', 'brachialis', 'forearms', 'lats', 'latissimus dorsi', 'upper back'],
  triceps: ['triceps', 'triceps brachii', 'pectorals'],
  forearms: ['forearms', 'biceps', 'triceps', 'brachialis', 'wrist flexors', 'wrist extensors'],
  neck: ['*'], // exercisedb has no neck target; token match only
  quads: ['quads', 'quadriceps', 'glutes'],
  hamstrings: ['hamstrings', 'glutes'],
  glutes: ['glutes', 'gluteus maximus', 'gluteus medius', 'abductors', 'adductors', 'hamstrings', 'quads', 'quadriceps'],
  calves: ['calves', 'gastrocnemius', 'soleus'],
  adductors: ['adductors', 'glutes', 'quads', 'quadriceps'],
  hipflex: ['quads', 'quadriceps', 'abs', 'glutes', 'hamstrings', 'hip flexors', 'iliopsoas'],
  abs: ['abs', 'abdominals', 'obliques', 'rectus abdominis', 'core'],
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
const hasTok = (cset, t) => cset.has(t) ||
  (t.endsWith('s') && t.length > 3 && cset.has(t.slice(0, -1))) ||
  cset.has(t + 's');
const strictMatch = (bankToks, candToks) => {
  const cset = new Set(candToks);
  const need = [...new Set(bankToks)].filter(t => !EQUIP.has(t));
  const hardMissing = need.filter(t => !hasTok(cset, t) && !POSTURE.has(t));
  if (hardMissing.length) return false;
  // require at least one distinguishing non-posture token (action or muscle word)
  const action = need.filter(t => !POSTURE.has(t));
  return action.length === 0 || action.some(t => hasTok(cset, t));
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
  // generic staples the fuzzy search misses on the plain name
  "pec-deck": ["pec deck fly", "machine fly", "seated machine fly", "butterfly machine"],
  "pull-up": ["pull up", "neutral grip pull up", "bodyweight pull up"],
  "chin-up": ["chin up", "assisted chin up"],
  "dips": ["chest dip", "triceps dip", "parallel bar dip", "dip"],
  "pressdown": ["tricep pushdown", "triceps pushdown", "cable pushdown", "straight bar pushdown"],
  "deadlift": ["barbell deadlift", "conventional deadlift"],
  "rdl": ["romanian deadlift", "barbell romanian deadlift"],
  "rdl-hamstrings": ["romanian deadlift", "barbell romanian deadlift"],
  "back-squat": ["back squat", "barbell squat", "barbell full squat", "high bar squat"],
  "low-bar-squat": ["low bar squat", "barbell back squat", "back squat"],
  "hip-thrust": ["hip thrust", "barbell hip thrust"],
  "ab-wheel": ["ab wheel rollout", "ab rollout", "ab wheel"],
  "side-plank": ["side plank", "plank"],
  "dead-bug": ["dead bug", "dead bug exercise"],
  "inverted-row": ["inverted row", "australian pull up", "bodyweight row"],
  "forward-lunge": ["forward lunge", "lunge", "walking lunge"],
  "step-up": ["step up", "box step up", "dumbbell step up"],
  "hanging-leg-raise": ["hanging leg raise", "hanging straight leg raise"],
  "hanging-knee-raise": ["hanging knee raise", "hanging leg raise"],
  "bicycle-crunch": ["bicycle crunch", "air bike"],
  "russian-twist": ["russian twist", "twist"],
  "machine-crunch": ["machine crunch", "seated crunch machine", "ab crunch machine"],
  "seated-cable-row": ["seated cable row", "cable row", "seated row"],
  "wide-grip-pulldown": ["wide grip lat pulldown", "lat pulldown", "wide pulldown"],
  "neutral-grip-pulldown": ["neutral grip lat pulldown", "lat pulldown", "close grip pulldown"],
  "close-grip-bench": ["close grip bench press", "narrow bench press", "triceps bench press"],
  "jm-press2": [],
  "machine-preacher-curl": ["machine preacher curl", "preacher curl machine"],
  "spider-curl": ["spider curl", "incline prone curl", "prone incline curl"],
  "machine-curl": ["machine curl", "bicep curl machine", "machine bicep curl"],
  "cable-curl-2": [],
  "bulgarian-split-squat": ["bulgarian split squat", "split squat", "rear foot elevated split squat"],
  "hack-squat": ["hack squat", "machine hack squat", "sled hack squat"],
  "nordic-curl": ["nordic curl", "nordic hamstring curl", "glute ham raise", "natural glute ham"],
  "stiff-leg-deadlift": ["stiff leg deadlift", "barbell stiff leg deadlift", "straight leg deadlift"],
  "single-leg-rdl": ["single leg romanian deadlift", "single leg deadlift", "one leg deadlift"],
  "hip-thrust-feet-forward": ["hip thrust", "barbell hip thrust"],
  "hip-thrust-wide": ["hip thrust", "barbell hip thrust"],
  "single-leg-hip-thrust": ["single leg hip thrust", "hip thrust"],
  "smith-hip-thrust": ["hip thrust", "smith machine hip thrust", "barbell hip thrust"],
  "frog-pump": ["frog pump", "glute bridge frog", "frog bridge"],
  "cable-glute-kickback": ["cable glute kickback", "cable kickback glute", "kickback"],
  "deficit-reverse-lunge": ["deficit reverse lunge", "reverse lunge", "deficit lunge"],
  "reverse-lunge": ["reverse lunge", "dumbbell reverse lunge", "barbell reverse lunge"],
  "zercher-squat": ["zercher squat"],
  "safety-bar-squat": ["safety bar squat", "safety squat bar squat", "hatfield squat"],
  "cyclist-squat": ["cyclist squat", "heels elevated squat", "squat wedge"],
  "belt-squat": ["belt squat", "machine belt squat"],
  "pause-squat": ["pause squat", "paused squat", "barbell squat"],
  "one-half-squat": ["one and a half squat", "squat", "1.5 squat"],
  "leg-press-wide": ["wide stance leg press", "leg press", "sled leg press"],
  "single-leg-press": ["single leg press", "leg press", "one leg press"],
  "sissy-squat": ["sissy squat", "bodyweight sissy squat"],
  "spanish-squat": ["spanish squat", "band spanish squat", "terminal knee extension"],
  "atg-split-squat": ["atg split squat", "split squat", "front foot elevated split squat"],
  "razor-curl": ["razor curl", "nordic curl", "glute ham raise"],
  "swiss-ball-curl": ["swiss ball leg curl", "stability ball leg curl", "ball leg curl"],
  "slider-leg-curl": ["slider leg curl", "sliding leg curl", "towel leg curl", "lying leg curl"],
  "good-morning": ["good morning", "barbell good morning"],
  "back-extension-glute": ["back extension", "hyperextension", "45 degree hyperextension"],
  "farmers-carry": ["farmers carry", "farmers walk", "suitcase carry"],
  "rope-climb": ["rope climb"],
  "dead-hang": ["dead hang", "pull up bar hang", "hang"],
  "active-hang": ["active hang", "scapular hang", "dead hang"],
  "one-arm-dead-hang": ["one arm hang", "single arm hang", "dead hang"],
  "plate-pinch": ["plate pinch", "pinch hold", "plate hold"],
  "neck-flexion": ["neck curl", "neck flexion", "lying neck flexion"],
  "neck-lateral": ["neck lateral flexion", "side neck", "neck side bend"],
  "neck-rotation": ["neck rotation", "neck turn"],
  "neck-extension": ["neck extension", "prone neck extension", "neck extension exercise"],
  "banded-neck-extension": ["neck extension", "band neck extension", "prone neck extension"],
  "harness-neck-flexion": ["neck flexion", "neck curl", "neck harness"],
  "harness-neck-extension": ["neck extension", "neck harness extension", "prone neck"],
  "wrist-roller": ["wrist roller", "forearm roller"],
  "wrist-roller-extensor": ["wrist roller", "forearm roller"],
  "gripper-crush": ["hand gripper", "gripper", "hand crush"],
  "hub-lift": ["hub lift", "pinch grip", "plate pinch"],
  "thick-bar-hold": ["thick bar hold", "fat bar hold", "dead hang"],
  "wrist-wrench": ["wrist wrench", "wrist curl", "forearm"],
  "radial-deviation": ["radial deviation", "wrist deviation", "wrist curl"],
  "ulnar-deviation": ["ulnar deviation", "wrist deviation", "wrist curl"],
  "supination-lever": ["supination", "forearm supination", "wrist rotation"],
  "finger-extension-band": ["finger extension", "band finger extension", "hand extension"],
  "finger-roll-curl": ["finger roll", "wrist roll curl", "finger curl"],
  "tibialis-raise": ["tibialis raise", "dorsiflexion", "shin raise"],
  "tib-bar-raise": ["tib bar raise", "tibialis raise", "tibialis bar"],
  "band-dorsiflexion": ["dorsiflexion", "band dorsiflexion", "tibialis raise"],
  "copenhagen-long": ["copenhagen plank", "copenhagen adduction", "side plank adduction"],
  "copenhagen-short": ["copenhagen plank", "short lever copenhagen", "adduction plank"],
  "cossack-squat": ["cossack squat", "side squat"],
  "slider-adduction": ["slider adduction", "copenhagen", "adductor slide"],
  "ball-squeeze-isometric": ["ball squeeze", "adductor squeeze", "hip adduction isometric"],
  "banded-knee-drive": ["band knee drive", "knee drive", "hip flexion band"],
  "lying-straight-leg-raise": ["lying straight leg raise", "straight leg raise", "lying leg raise"],
  "cable-hip-flexion": ["cable hip flexion", "standing cable hip flexion", "cable leg raise"],
  "roman-chair-raise": ["roman chair leg raise", "captains chair leg raise", "chair leg raise"],
  "weighted-high-knees": ["weighted high knees", "high knees", "standing knee raise"],
  "psoas-march": ["psoas march", "seated knee raise", "marching hip flexion", "seated march"],
  "captains-chair-raise": ["captains chair leg raise", "captains chair knee raise", "roman chair"],
  "garhammer-raise": ["garhammer raise", "hanging knee raise", "captains chair"],
  "stabilized-hanging-raise": ["hanging knee raise", "hanging leg raise", "captains chair"],
  "janda-situp": ["janda sit up", "sit up", "janda crunch"],
  "kneeling-cable-crunch": ["kneeling cable crunch", "cable crunch"],
  "lat-pulldown-crunch": ["cable crunch", "lat pulldown crunch", "kneeling crunch"],
  "ab-mat-crunch": ["ab mat crunch", "crunch"],
  "reverse-crunch-abmat": ["reverse crunch", "ab mat reverse crunch"],
  "banded-reverse-crunch": ["band reverse crunch", "reverse crunch"],
  "cable-woodchop": ["cable woodchop", "woodchop", "cable chop"],
  "side-crunch": ["side crunch", "oblique crunch"],
  "pallof-press": ["pallof press", "cable pallof press", "anti rotation press"],
  "pallof-kneeling": ["kneeling pallof press", "pallof press", "half kneeling pallof"],
  "cable-lift": ["cable lift", "cable chop lift", "low to high cable chop"],
  "side-plank-hip-dip": ["side plank hip dip", "side plank dips", "side plank"],
  "landmine-rotation": ["landmine rotation", "landmine twist", "barbell rotation"],
  "cross-body-climber": ["cross body mountain climber", "mountain climber", "cross climber"],
  "stir-the-pot": ["stir the pot", "stability ball stir", "ball plank circle"],
  "renegade-row": ["renegade row", "plank row"],
  "rkc-plank": ["rkc plank", "hardstyle plank", "plank"],
  "body-saw": ["body saw", "plank body saw", "saw plank"],
  "stomach-vacuum": ["stomach vacuum", "vacuum", "abdominal vacuum"],
  "mcgill-curl-up": ["mcgill curl up", "curl up", "mcgill crunch"],
  "bird-dog": ["bird dog", "quadruped bird dog", "bird dog exercise"],
  "hollow-body-hold": ["hollow body hold", "hollow hold", "hollow body"],
  "hollow-rock": ["hollow rock", "hollow body rock", "hollow hold"],
  "stability-ball-crunch": ["stability ball crunch", "swiss ball crunch", "ball crunch"],
  "decline-crunch": ["decline crunch", "decline sit up"],
  "weighted-crunch": ["weighted crunch", "cable crunch", "crunch"],
  "dead-bug-banded": ["band dead bug", "dead bug", "dead bug band"],
  "dead-bug-weighted": ["weighted dead bug", "dead bug"],
  "toes-to-bar": ["toes to bar", "toes to bar exercise"],
  "lying-leg-raise-hip-lift": ["lying leg raise hip lift", "leg raise hip thrust", "leg raise"],
  "decline-reverse-crunch": ["decline reverse crunch", "reverse crunch"],
  "dragon-flag": ["dragon flag", "dragonfly", "dragon flag exercise"],
  "l-sit-hold": ["l sit", "l sit hold", "l-sit"],
  "standing-cable-crunch": ["standing cable crunch", "cable crunch standing"],
  "barbell-rollout": ["barbell rollout", "barbell ab rollout", "rollout"],
  "standing-ab-wheel": ["standing ab wheel", "ab wheel standing", "ab rollout standing"],
  "cambered-bar-bench": ["cambered bar bench press", "deep bench press", "cambered bench"],
  "wide-grip-bench": ["wide grip bench press", "bench press"],
  "neutral-grip-db-bench": ["neutral grip dumbbell bench press", "dumbbell bench press neutral"],
  "weighted-pushup": ["weighted push up", "push up weighted", "weighted pushup"],
  "hex-press": ["hex press", "dumbbell hex press", "squeeze press"],
  "paused-bench": ["paused bench press", "pause bench press", "bench press pause"],
  "lengthened-partial-bench": ["partial bench press", "bench press partial", "bench press"],
  "low-to-high-cable-flye": ["low to high cable fly", "low cable fly", "incline cable fly low"],
  "high-to-low-cable-flye": ["high to low cable fly", "high cable fly", "decline cable fly"],
  "incline-cable-flye": ["incline cable fly", "cable fly incline"],
  "dumbbell-flye": ["dumbbell fly", "flat dumbbell fly", "dumbbell flye"],
  "deficit-pushup": ["deficit push up", "deep push up", "push up deficit"],
  "cable-press-around": ["press around", "cable press around", "around the world press"],
  "weighted-pullup": ["weighted pull up", "pull up weighted"],
  "eccentric-pullup": ["eccentric pull up", "negative pull up", "slow pull up"],
  "underhand-pulldown": ["underhand lat pulldown", "reverse grip pulldown", "supinated pulldown"],
  "vbar-pulldown": ["v bar pulldown", "close grip pulldown", "vbar lat pulldown"],
  "meadows-pulldown": ["one arm lat pulldown", "single arm lat pulldown", "meadows row"],
  "straight-arm-pulldown": ["straight arm pulldown", "stiff arm pulldown", "cable straight arm pull down"],
  "kneeling-pulldown": ["kneeling lat pulldown", "lat pulldown kneeling"],
  "single-arm-pulldown": ["single arm lat pulldown", "one arm pulldown", "single arm cable pulldown"],
  "half-kneeling-pulldown": ["half kneeling pulldown", "kneeling lat pulldown", "single arm pulldown"],
  "seal-row": ["seal row", "bench seal row", "chest supported barbell row"],
  "chest-supported-row": ["chest supported row", "incline bench row", "seal row"],
  "seated-cable-row2": [],
  "yates-row": ["yates row", "underhand barbell row", "reverse grip barbell row"],
  "helms-row": ["helms row", "single arm dumbbell row", "chest supported dumbbell row"],
  "machine-row": ["machine row", "seated machine row", "plate loaded row"],
  "smith-bent-row": ["smith machine row", "smith bent over row", "smith machine bent row"],
  "deficit-pendlay-row": ["deficit pendlay row", "pendlay row", "dead stop row"],
  "bent-dumbbell-row": ["bent over dumbbell row", "dumbbell row", "two arm dumbbell row"],
  "kroc-row": ["kroc row", "heavy dumbbell row", "single arm dumbbell row"],
  "meadows-row": ["meadows row", "landmine row", "one arm landmine row"],
  "face-pull-to-forehead": ["face pull", "rope face pull"],
  "face-pull-er": ["face pull external rotation", "face pull", "rope face pull"],
  "rope-face-pull": ["rope face pull", "face pull"],
  "seated-face-pull": ["seated face pull", "face pull", "cable face pull"],
  "kelso-shrug": ["kelso shrug", "incline shrug", "chest supported shrug"],
  "prone-w-raise": ["prone w raise", "w raise", "incline w raise"],
  "prone-y-raise": ["prone y raise", "y raise", "incline y raise"],
  "z-press": ["z press", "sitting overhead press", "z press dumbbell"],
  "push-press": ["push press", "barbell push press"],
  "arnold-press": ["arnold press", "dumbbell arnold press"],
  "barbell-ohp": ["barbell overhead press", "overhead press", "military press"],
  "behind-back-db-lateral": ["behind back lateral raise", "behind the back lateral raise"],
  "seated-strict-lateral": ["seated lateral raise", "seated dumbbell lateral raise", "strict lateral raise"],
  "lengthened-partial-lateral": ["lateral raise partial", "partial lateral raise", "lateral raise"],
  "scaption-raise": ["scaption raise", "scapular plane raise", "scaption"],
  "cable-lateral-raise2": [],
  "cable-y-raise": ["cable y raise", "y raise cable"],
  "cuffed-lateral-raise": ["cuff lateral raise", "cable lateral raise cuff", "cable lateral raise"],
  "leanin-lateral-raise": ["lean away lateral raise", "lean in lateral raise", "cable lateral raise lean"],
  "prone-rear-flye": ["prone rear delt fly", "incline reverse fly", "rear delt fly prone"],
  "bent-over-rear-flye": ["bent over rear delt fly", "rear delt fly", "bent over reverse fly"],
  "cable-crossbody-rear-flye": ["cross body rear delt fly", "rear delt cable fly", "reverse cable fly"],
  "single-arm-cable-rear-flye": ["single arm rear delt fly", "one arm cable rear fly", "rear delt cable fly"],
  "band-pull-apart": ["band pull apart", "band pull-apart", "pull apart"],
  "reverse-pec-deck": ["reverse pec deck", "reverse fly machine", "pec deck reverse"],
  "reverse-cable-crossover": ["reverse cable crossover", "rear delt crossover", "cable reverse fly"],
  "db-shrug": ["dumbbell shrug", "dumbbell shoulder shrug"],
  "barbell-shrug": ["barbell shrug", "barbell shoulder shrug"],
  "cable-shrug": ["cable shrug", "cable shoulder shrug"],
  "overhead-shrug": ["overhead shrug", "overhead barbell shrug"],
  "incline-db-shrug": ["incline dumbbell shrug", "incline shrug"],
  "behind-back-shrug": ["behind back shrug", "barbell shrug behind back"],
  "trap-bar-shrug": ["trap bar shrug", "hex bar shrug"],
  "scapular-pullup": ["scapular pull up", "scap pull up", "scapular pullup"],
  "push-up-plus": ["push up plus", "serratus push up", "push up protraction"],
  "bayesian-curl": ["bayesian curl", "cable curl behind back", "behind back cable curl"],
  "waiter-curl": ["waiter curl", "dumbbell waiter curl"],
  "twenty-ones": ["21s", "barbell 21s", "twenty ones curl", "barbell curl"],
  "concentration-curl": ["concentration curl", "dumbbell concentration curl"],
  "incline-curl": ["incline dumbbell curl", "incline curl"],
  "incline-curl-30": ["incline dumbbell curl", "incline curl"],
  "incline-curl-60": ["incline dumbbell curl", "incline curl"],
  "strict-wall-curl": ["wall curl", "strict curl", "wall bicep curl"],
  "cheat-curl": ["cheat curl", "barbell cheat curl", "heavy barbell curl"],
  "inverse-zottman": ["zottman curl", "reverse zottman curl", "dumbbell curl"],
  "pinwheel-curl": ["pinwheel curl", "cross body hammer curl"],
  "behind-back-db-curl": ["behind back dumbbell curl", "incline dumbbell curl", "dumbbell curl behind"],
  "double-biceps-cable-curl": ["overhead cable curl", "high cable curl", "double bicep cable curl"],
  "overhead-bar-extension": ["overhead bar triceps extension", "barbell overhead triceps extension", "french press"],
  "behind-head-skullcrusher": ["skull crusher behind head", "lying triceps extension behind", "skullcrusher"],
  "california-press": ["california press", "jm press", "close grip bench press"],
  "tate-press": ["tate press", "dumbbell tate press"],
  "vbar-pressdown": ["v bar pushdown", "tricep pushdown v bar", "vbar pushdown"],
  "cuff-pressdown": ["cuff pushdown", "tricep pushdown", "cable cuff pushdown"],
  "cuff-kickback": ["cable cuff kickback", "tricep kickback cable", "cable kickback triceps"],
  "lean-back-pressdown": ["lean back pushdown", "tricep pushdown", "cable pushdown lean"],
  "katana-extension": ["katana extension", "overhead cable triceps", "cross body triceps extension"],
  "crossface-overhead": ["cross body triceps extension", "overhead cable triceps extension", "crossface triceps"],
  "incline-overhead-cable": ["incline overhead triceps extension", "cable overhead triceps", "incline triceps extension"],
  "weighted-dip": ["weighted dip", "dip weighted", "triceps dip"],
  "bench-dip": ["bench dip", "triceps bench dip"],
  "reverse-grip-pressdown": ["reverse grip pushdown", "reverse grip tricep pushdown"],
  "wide-grip-ez-curl": ["wide grip ez bar curl", "ez bar curl wide", "wide grip curl"],
  "narrow-grip-ez-curl": ["close grip ez bar curl", "narrow grip curl", "close grip curl"],
  "reverse-curl": ["reverse curl", "barbell reverse curl", "ez reverse curl"],
  "zottman-curl": ["zottman curl", "dumbbell zottman curl"],
  "fat-grip-curl": ["fat grip curl", "thick bar curl", "fat gripz curl", "towel curl"],
  "towel-pullup": ["towel pull up", "towel pullup", "towel grip pull up"],
  "rice-bucket": ["rice bucket", "hand exercise rice", "finger digs"],
  "reverse-nordic": ["reverse nordic curl", "sissy squat", "reverse nordic"],
  "jm-press": ["jm press", "smith jm press", "close grip bench press triceps"],
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
