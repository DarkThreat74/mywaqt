/**
 * Headless replay harness for @tilawa/core RecitationEngine.
 * Synthesizes CTC token streams from the phoneme corpus — no mic, no ONNX.
 *
 *   node scripts/engine-replay.mjs            # run all cases
 *   node scripts/engine-replay.mjs --verbose  # dump every event
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RecitationEngine, QuranCorpus, QuranIndex, DEFAULT_CONFIG, StructuralRules }
  from "@tilawa/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_JSON = JSON.parse(readFileSync(join(HERE, ".engine", "corpus.json"), "utf8"));
const STRUCT_INDEX = JSON.parse(readFileSync(
  join(HERE, "..", "node_modules", "@tilawa", "core", "dist", "recitation", "structural-index.json"), "utf8"));
const VERBOSE = process.argv.includes("--verbose");
const FRAMES_PER_CHAR = 3, MARGIN = 0.9, SETTLE = 40;

const corpus = new QuranCorpus(CORPUS_JSON);
const index = new QuranIndex(corpus, DEFAULT_CONFIG);
const rules = new StructuralRules(corpus, STRUCT_INDEX);

// Extended pairwise index (scripts/build-muta-index.mjs) — same schema,
// merged into rules.looks/both/ident exactly like recite.worker.ts does at
// session init, so replay cases exercise the union coverage.
const EXT_INDEX = JSON.parse(readFileSync(
  join(HERE, "..", "src", "features", "quran-tester", "muta-index.json"), "utf8"));
{
  const sig = (key, r) => `${key}>${r.m[0]}:${r.m[1]}|${r.regions.flat().join(",")}`;
  const seen = new Map();
  const add = (map, key, row) => {
    if (!map) return;
    const s = sig(key, row);
    let st = seen.get(key);
    if (!st) { st = new Set((map.get(key) ?? []).map((r) => sig(key, r))); seen.set(key, st); }
    if (st.has(s)) return;
    st.add(s);
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    arr.push(row);
  };
  for (const [key, rows] of Object.entries(EXT_INDEX.pairs)) {
    const [s, a] = key.split(":").map(Number);
    for (const flat of rows) {
      const m = [flat[0], flat[1]];
      const regions = [];
      for (let p = 2; p + 4 <= flat.length; p += 5)
        regions.push([flat[p], flat[p + 1], flat[p + 2], flat[p + 3], flat[p + 4]]);
      add(rules.looks, key, { m, regions });
      add(rules.both, key, { m, regions });
      add(rules.both, `${m[0]}:${m[1]}`, {
        m: [s, a],
        regions: regions.map(([t, i1, i2, j1, j2]) => [t === 1 ? 2 : t === 2 ? 1 : t, j1, j2, i1, i2]),
      });
    }
  }
  if (rules.ident) for (const k of EXT_INDEX.ident ?? []) rules.ident.add(k);
}

// ── recitation-script builder ─────────────────────────────────────
const ref = (s) => { const [surah, ayah, word] = s.split(":").map(Number); return { surah, ayah, word }; };
const wordPh = (r) => corpus.wordPhonemes(corpus.wordIndex(r.surah, r.ayah, r.word));
const ayahWords = (r) => Array.from({ length: corpus.ayahWordCount(r.surah, r.ayah) },
  (_, w) => corpus.wordPhonemes(corpus.wordIndex(r.surah, r.ayah, w)));

function makeRecite(ayahs, opts = {}) {
  const corrupt = new Map((opts.corrupt ?? []).map(c => [c.at, c]));
  const slip = opts.branchSlip
    ? { from: ref(opts.branchSlip.from), to: ref(opts.branchSlip.to), atWord: opts.branchSlip.atWord }
    : null;
  const pauses = new Map(Object.entries(opts.pauseAfter ?? {})); // "s:a:w" -> frames
  const words = [];
  for (const a of ayahs) {
    const r = ref(a);
    const ph = ayahWords(r);
    const isFrom = slip && r.surah === slip.from.surah && r.ayah === slip.from.ayah;
    const isTo = slip && r.surah === slip.to.surah && r.ayah === slip.to.ayah;
    const limit = isFrom ? slip.atWord : ph.length;
    const start = isTo ? slip.atWord : 0;
    for (let w = start; w < limit; w++) {
      const key = `${r.surah}:${r.ayah}:${w}`;
      const c = corrupt.get(key);
      if (c?.kind === "drop") continue;
      words.push({ key, phonemes: c?.kind === "sub" ? wordPh(ref(c.with)) : ph[w] });
      if (c?.kind === "insert") words.push({ key: key + "+ins", phonemes: wordPh(ref(c.with)) });
      if (c?.kind === "repeat") words.push({ key: key + "+rep", phonemes: ph[w] });
      // Pausal form: drop the trailing harakat token(s) of the word —
      // reciters stop voicing final vowels at ayah ends.
      if (c?.kind === "pausal") {
        words.pop();
        const trimmed = [...ph[w]];
        while (trimmed.length > 1 && /[ً-ْٰـ]/.test(trimmed[trimmed.length - 1])) trimmed.pop();
        words.push({ key: key + "+pausal", phonemes: trimmed.join("") });
      }
      if (pauses.has(key)) words.push({ pauseFrames: pauses.get(key) });
    }
    words.push({ pauseFrames: 8 }); // small ayah gap
  }
  return words;
}

function tokensOf(script, startFrame = 0) {
  const tokens = []; let f = startFrame;
  for (const item of script) {
    if (item.pauseFrames) { f += item.pauseFrames; continue; }
    for (const ch of [...item.phonemes]) { tokens.push({ sym: ch, frame: f, margin: MARGIN }); f += FRAMES_PER_CHAR; }
  }
  return { tokens, endFrame: f };
}

// ── driver ────────────────────────────────────────────────────────
function run(script, cfg = {}, { structural = false } = {}) {
  const engine = new RecitationEngine(corpus, index, { ...DEFAULT_CONFIG, ...cfg });
  if (structural) {
    engine.looks = rules.both ?? rules.looks;
    engine.idents = rules.ident;
  }
  engine.startSearch();
  const log = [];
  const { tokens, endFrame } = tokensOf(script);
  const CHUNK = 12;
  for (let i = 0; i < tokens.length; i += CHUNK)
    log.push(...engine.feed(tokens.slice(i, i + CHUNK), tokens[Math.min(i + CHUNK, tokens.length - 1)].frame + 1));
  for (const ev of engine.feed([], endFrame + SETTLE)) log.push(ev); // settle
  return { engine, log };
}

// ── assertions ────────────────────────────────────────────────────
const evs = (log, t) => log.filter(e => e.type === t);
function finalVerdicts(log) {
  const m = new Map();
  for (const e of evs(log, "verdicts")) for (const v of e.changes) m.set(v.wordIndex, v);
  return m;
}
const verdictAt = (log, s, a, w) => finalVerdicts(log).get(corpus.wordIndex(s, a, w))?.state;
const verdictFull = (log, s, a, w) => finalVerdicts(log).get(corpus.wordIndex(s, a, w));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function dump(log) { if (VERBOSE) for (const e of log) console.log("   ", JSON.stringify(e)); }

// ── cases ─────────────────────────────────────────────────────────
console.log("case 1: clean recite 1:1-7");
{
  const { log } = run(makeRecite(["1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7"]));
  dump(log);
  check("located once at surah 1", evs(log, "located").length === 1 && evs(log, "located")[0].surah === 1);
  const cur = evs(log, "cursor").map(c => c.wordIndex);
  check("cursor monotonic", cur.every((v, i) => i === 0 || v >= cur[i - 1]));
  check("no lost/locateFailed", !evs(log, "lost").length && !evs(log, "locateFailed").length);
  const fv = [...finalVerdicts(log).values()];
  check("mostly ok verdicts", fv.filter(v => v.state === "ok").length >= fv.length - 3,
    `${fv.filter(v => v.state === "ok").length}/${fv.length} ok`);
}

console.log("case 2: mid-ayah substitution in 1:5 word 1");
{
  const { log } = run(makeRecite(["1:5", "1:6", "1:7"], {
    corrupt: [{ at: "1:5:1", kind: "sub", with: "2:2:0" }] }));
  dump(log);
  check("sub word wrong|unsure", ["wrong", "unsure"].includes(verdictAt(log, 1, 5, 1)),
    `got ${verdictAt(log, 1, 5, 1)}`);
  check("no relocation", !evs(log, "relocated").length,
    JSON.stringify(evs(log, "relocated")));
}

console.log("case 8: pause + resume inside 1:6");
{
  const { log } = run(makeRecite(["1:6", "1:7"], { pauseAfter: { "1:6:0": SETTLE + 10 } }));
  dump(log);
  check("word0 committed ok after pause", verdictAt(log, 1, 6, 0) === "ok",
    `got ${verdictAt(log, 1, 6, 0)}`);
  check("recitation resumes", evs(log, "cursor").length > 1);
}

console.log("case 6: inserted extra word mid-ayah (1:6)");
{
  const { log } = run(makeRecite(["1:6", "1:7"], {
    corrupt: [{ at: "1:6:1", kind: "insert", with: "1:4:0" }] }));
  dump(log);
  check("no lost", !evs(log, "lost").length);
  check("following word still ok", verdictAt(log, 1, 6, 2) === "ok",
    `got ${verdictAt(log, 1, 6, 2)}`);
}

console.log("case 7: skip-ahead 1:1→1:4");
{
  const { log } = run(makeRecite(["1:1", "1:4", "1:5", "1:6", "1:7"]),
    { relocateEveryFrames: 20 });
  dump(log);
  const rel = evs(log, "relocated");
  // A skip may re-lock via the search path (located) rather than an
  // explicit relocate — both are correct "followed the jump" outcomes.
  const reloc = rel.length > 0 ||
    evs(log, "located").some(e => e.ayah >= 4);
  const skipped = [...finalVerdicts(log).values()].some(v => v.state === "skipped");
  check("followed skip (relocated|located≥4|skipped)", reloc || skipped,
    JSON.stringify({ rel: rel.length, located: evs(log, "located").map(e => `${e.surah}:${e.ayah}`), skipped }));
}

console.log("case 4: look-alike branch slip");
{
  // Find a real pair: a row with conf<0.7 and ≥1 provable j-side word.
  let pair = null;
  outer: for (const [key, rows] of rules.both) {
    const [s, a] = key.split(":").map(Number);
    for (const row of rows) {
      if ((row.conf ?? 0) >= 0.7) continue;
      for (const r of row.regions) {
        const jWords = [];
        for (let w = r[3]; w < r[4]; w++) {
          try {
            const t = index.table.encode(corpus.wordPhonemes(corpus.wordIndex(row.m[0], row.m[1], w)));
            if (t.length >= 4) jWords.push(w);
          } catch { }
        }
        if (jWords.length && r[3] > 2) { pair = { s, a, m: row.m, i1: r[1] }; break outer; }
      }
    }
  }
  if (!pair) console.log("  SKIP — no suitable pair found");
  else {
    console.log(`  using pair ${pair.s}:${pair.a} -> ${pair.m.join(":")} (diverge at word ${pair.i1})`);
    const { log } = run(
      makeRecite([`${pair.s}:${pair.a}`, `${pair.m[0]}:${pair.m[1]}`], {
        branchSlip: { from: `${pair.s}:${pair.a}`, to: `${pair.m[0]}:${pair.m[1]}`, atWord: pair.i1 },
      }),
      { relocateEveryFrames: 20 },
      { structural: true });
    dump(log);
    const rel = evs(log, "relocated");
    const landed = rel.some(e => e.to?.surah === pair.m[0] && e.to?.ayah === pair.m[1]) ||
      evs(log, "located").some(e => e.surah === pair.m[0] && e.ayah === pair.m[1]);
    const fv = [...finalVerdicts(log).values()];
    const namedAlt = fv.some(v => v.lookalike && v.lookalike.surah === pair.m[0] && v.lookalike.ayah === pair.m[1]);
    const wrongs = fv.filter(v => v.state === "wrong" || v.state === "unsure").length;
    check("branch detected (relocate|located|lookalike|wrong)", landed || namedAlt || wrongs > 0,
      JSON.stringify({ landed, namedAlt, wrongs }));
    check("no ident-style silent move", !rel.some(e => !e.from));
  }
}

console.log("case 5: identical refrain — no relocation");
{
  const idents = [...rules.ident].map(k => k.split(":").map(Number));
  if (idents.length < 2) console.log("  SKIP — ident set too small");
  else {
    const a = idents[0];
    const { log } = run(makeRecite([`${a[0]}:${a[1]}`]), { relocateEveryFrames: 20 }, { structural: true });
    dump(log);
    check("no relocated", !evs(log, "relocated").length,
      JSON.stringify(evs(log, "relocated").map(e => e.to)));
  }
}

console.log("case 9: partial noise → locateFailed");
{
  const eng = new RecitationEngine(corpus, index, DEFAULT_CONFIG);
  eng.startSearch();
  const { tokens } = tokensOf(makeRecite(["1:1"]));
  const lg = [...eng.feed(tokens.slice(0, 8), 30)];
  lg.push(...eng.feed([], 30 + DEFAULT_CONFIG.locateFailedFrames + 5));
  dump(lg);
  check("locateFailed emitted", evs(lg, "locateFailed").length === 1);
  check("no located", !evs(lg, "located").length);
}

console.log("case 3: vowel-only corruption in 1:5 word 1");
{
  const { log } = run(makeRecite(["1:5", "1:6", "1:7"], {
    corrupt: [{ at: "1:5:1", kind: "sub", with: "1:5:2" }] }));
  dump(log);
  const v = verdictFull(log, 1, 5, 1);
  check("vowel/word diff noticed (state|vowelErrors|distance)",
    v && (v.state !== "ok" || (v.vowelErrors ?? 0) > 0 || (v.distance ?? 0) > 0.15),
    JSON.stringify(v && { state: v.state, distance: v.distance, vowelErrors: v.vowelErrors }));
}

console.log("case 10: ending-variant slip (tail swap into a mutashabih twin)");
{
  // Find a tail-variant row from the extended index: single replace region
  // at the ayah's last word (d=1) — the غفور رحيم/حليم class.
  let tail = null;
  outer: for (const [key, rows] of rules.both) {
    const [s, a] = key.split(":").map(Number);
    const wc = corpus.ayahWordCount(s, a);
    for (const row of rows) {
      if (row.regions.length !== 1) continue;
      const r = row.regions[0];
      if (r[0] !== 0 || r[2] !== wc || r[4] !== r[3] + 1 || r[2] - r[1] !== 1) continue;
      const bw = corpus.ayahWordCount(row.m[0], row.m[1]);
      if (r[4] !== bw) continue;
      tail = { s, a, m: row.m, i1: r[1], j1: r[3], wc };
      break outer;
    }
  }
  if (!tail) console.log("  SKIP — no tail-variant pair found");
  else {
    console.log(`  ${tail.s}:${tail.a} ends like ${tail.m.join(":")} (diverge at word ${tail.i1})`);
    const { log } = run(
      makeRecite([`${tail.s}:${tail.a}`, `${tail.s}:${tail.a + 1}`], {
        branchSlip: { from: `${tail.s}:${tail.a}`, to: `${tail.m[0]}:${tail.m[1]}`, atWord: tail.i1 },
      }),
      { relocateEveryFrames: 20 },
      { structural: true });
    dump(log);
    const fv = [...finalVerdicts(log).values()];
    const namedAlt = fv.some(v => v.lookalike && v.lookalike.surah === tail.m[0] && v.lookalike.ayah === tail.m[1]);
    const wrongAt = verdictFull(log, tail.s, tail.a, tail.i1);
    check("ending slip noticed (lookalike|wrong|unsure)",
      namedAlt || ["wrong", "unsure"].includes(wrongAt?.state),
      JSON.stringify({ namedAlt, state: wrongAt?.state, lookalike: wrongAt?.lookalike }));
    // A tail slip must NOT silently relocate the tracker — the body differed.
    check("no far relocation", !evs(log, "relocated").some(e => e.to && (e.to.ayah - tail.a > 2 || e.to.surah !== tail.s)),
      JSON.stringify(evs(log, "relocated").map(e => e.to)));
  }
}

console.log("case 11: word repetition self-corrects (1:6 word 1 doubled)");
{
  const { log } = run(makeRecite(["1:6", "1:7"], {
    corrupt: [{ at: "1:6:1", kind: "repeat" }] }));
  dump(log);
  check("no lost", !evs(log, "lost").length);
  check("following word still judged", ["ok", "unsure"].includes(verdictAt(log, 1, 6, 2)),
    `got ${verdictAt(log, 1, 6, 2)}`);
  check("no relocation", !evs(log, "relocated").length);
}

console.log("case 12: pausal ending in 1:3 (final harakat dropped)");
{
  const last = corpus.ayahWordCount(1, 3) - 1;
  const { log } = run(makeRecite(["1:3"], {
    corrupt: [{ at: `1:3:${last}`, kind: "pausal" }] }));
  dump(log);
  const v = verdictFull(log, 1, 3, last);
  check("pausal form not flagged wrong",
    !v || v.state !== "wrong",
    JSON.stringify(v && { state: v.state, distance: v.distance }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
