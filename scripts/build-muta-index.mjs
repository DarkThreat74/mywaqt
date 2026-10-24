#!/usr/bin/env node
/**
 * build-muta-index.mjs — generate the exhaustive pairwise mutashabihat index
 * the recite engine consumes.
 *
 * Output: src/features/quran-tester/muta-index.json
 * Schema: identical to @tilawa/core's structural-index.json —
 *   { v: 1, pairs: { "s:a": [[ms, ma, tag,i1,i2,j1,j2, tag,...], ...] }, ident: ["s:a"] }
 *   tag: 0 = replace, 1 = delete (source has words partner lacks),
 *        2 = insert (partner has words source lacks)
 *   i/j ranges are 0-based word-in-ayah indices [start, end).
 *
 * Pair sources:
 *   1. Waqar144 curated pairs (hifz-confusion set, scripts/data/mutashabihat-waqar.json)
 *   2. Auto-derived: every ayah pair sharing a normalized 3-word seed run
 *      (catches repeated fragments incl. multiple mutashabihat inside one ayah
 *      AND ending variants like غفور رحيم vs غفور حليم — the shared prefix
 *      contains a seed, the differing tail becomes the region)
 *   3. Ending-variant clusters: ayahs sharing a normalized prefix of ≥3 words
 *      whose final 1–3 words differ (mostly a subset of 2, kept as backstop)
 *   4. ident: ayahs whose full normalized text is identical (refrain twins —
 *      relocations between them are never real divergences)
 *
 * Regions come from a Needleman–Wunsch alignment of normalized words
 * (match 0, substitute 1, indel 1), grouped into contiguous diff blocks.
 *
 * Run: node scripts/build-muta-index.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Normalization — same semantics as src/lib/content/quran.ts normWord,
//    plus ى→ي ة→ه hamza-seat unification so orthographic noise can't split
//    a real shared run. ────────────────────────────────────────────────
// Harakat (064B–0652), extended Quranic marks incl. ٞ (0653–065F),
// dagger alef (0670), tatweel (0640), small-high marks (06D6–06ED),
// and the 08E0–08FF extended block (open dammatan & friends).
const MARK_RE = /[ً-ٰٟـۖ-ۭ࣠-ࣿ]/g;
function normWord(w) {
  let s = w
    .replace(MARK_RE, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  if (s.length > 3 && /^[وفبل]/.test(s)) s = s.slice(1);
  return s;
}
const normAyah = (ar) => ar.split(/\s+/).filter(Boolean).map(normWord);

// ── Load corpus ───────────────────────────────────────────────────────
const quran = JSON.parse(readFileSync(join(ROOT, "public/data/quran.json"), "utf8"));
/** ayahs: [{s, a, ar, nw[]}] ; absToSA: absolute 1..6236 → {s,a} */
const ayahs = [];
const absToSA = [];
for (const surah of quran) {
  for (const [a, ar] of surah.verses) {
    const rec = { s: surah.s, a, ar, nw: normAyah(ar) };
    ayahs.push(rec);
    absToSA.push(rec);
  }
}
// ── Pair collection ───────────────────────────────────────────────────
/** pairKey "idxA,idxB" (idxA < idxB) → {curated} */
const pairSet = new Map();
const addPair = (ia, ib, curated) => {
  if (ia === ib) return;
  const k = ia < ib ? `${ia},${ib}` : `${ib},${ia}`;
  const e = pairSet.get(k);
  if (e) e.curated ||= curated;
  else pairSet.set(k, { curated });
};

// 1. Waqar144 curated (absolute ayah ids; arrays zip positionally, else cross)
const waqar = JSON.parse(readFileSync(join(ROOT, "scripts/data/mutashabihat-waqar.json"), "utf8"));
const waqarEntries = Array.isArray(waqar) ? waqar : Object.values(waqar).flat();
let waqarPairs = 0;
for (const e of waqarEntries) {
  const srcs = Array.isArray(e.src.ayah) ? e.src.ayah : [e.src.ayah];
  for (const m of e.muts ?? []) {
    const ms = Array.isArray(m.ayah) ? m.ayah : [m.ayah];
    if (srcs.length === ms.length && srcs.length > 1) {
      for (let i = 0; i < srcs.length; i++) {
        addPair(srcs[i] - 1, ms[i] - 1, true);
        waqarPairs++;
      }
    } else {
      for (const x of srcs) for (const y of ms) {
        addPair(x - 1, y - 1, true);
        waqarPairs++;
      }
    }
  }
}

// 2+3. Shared normalized 3-gram seeds → candidate pairs (covers fragments
// inside ayahs, repeated phrases, and shared-prefix ending variants).
const SEED = 3;
const grams = new Map(); // "w1 w2 w3" → ayah indexes
for (let i = 0; i < ayahs.length; i++) {
  const nw = ayahs[i].nw;
  for (let p = 0; p + SEED <= nw.length; p++) {
    const g = nw[p] + " " + nw[p + 1] + " " + nw[p + 2];
    let arr = grams.get(g);
    if (!arr) grams.set(g, (arr = []));
    if (arr[arr.length - 1] !== i) arr.push(i);
  }
}
let seedPairs = 0;
for (const arr of grams.values()) {
  if (arr.length < 2) continue;
  // Fragments repeated very often (basmala, refrains) are still valid pairs —
  // the engine needs them for ident/veto — but cap the combinatorics at a
  // level where each pair is still a real confusion candidate.
  if (arr.length > 60) continue;
  for (let x = 0; x < arr.length; x++)
    for (let y = x + 1; y < arr.length; y++) {
      if (!pairSet.has(`${Math.min(arr[x], arr[y])},${Math.max(arr[x], arr[y])}`)) {
        addPair(arr[x], arr[y], false);
        seedPairs++;
      }
    }
}

// 3b. Ending variants — the classic hifz confusion (…غفور رحيم vs …غفور
// حليم) shares only a short TAIL context, so the 3-gram seed pass can't
// see it and a whole-ayah alignment would mark the whole dissimilar body
// divergent. Cluster ayahs by the normalized context BEFORE the tail;
// members with different tails get a tail-only divergent region.
// tailPairs: Map<"ia,ib", {d}> — emitted directly, bypassing regionsFor.
const tailPairs = new Map();
for (let d = 1; d <= 3; d++) {
  for (let c = 2; c <= 4; c++) {
    const groups = new Map(); // ctxKey → [{i, tail}]
    for (let i = 0; i < ayahs.length; i++) {
      const nw = ayahs[i].nw;
      if (nw.length < c + d + 1) continue;
      const key = nw.slice(nw.length - c - d, nw.length - d).join(" ");
      const tail = nw.slice(nw.length - d).join(" ");
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push({ i, tail });
    }
    for (const arr of groups.values()) {
      const tails = new Set(arr.map((x) => x.tail));
      if (tails.size < 2 || arr.length > 60) continue;
      for (let x = 0; x < arr.length; x++)
        for (let y = x + 1; y < arr.length; y++) {
          if (arr[x].tail === arr[y].tail) continue;
          const k = arr[x].i < arr[y].i ? `${arr[x].i},${arr[y].i}` : `${arr[y].i},${arr[x].i}`;
          const e = tailPairs.get(k);
          // Prefer the row with the longest shared context (d smallest,
          // c largest = deepest shared suffix anchor).
          if (!e || d < e.d) tailPairs.set(k, { d });
        }
    }
  }
}

// 4. ident — identical full normalized text (also covers pairs so similar
//    they have no divergent region).
const byText = new Map();
for (let i = 0; i < ayahs.length; i++) {
  const t = ayahs[i].nw.join(" ");
  let arr = byText.get(t);
  if (!arr) byText.set(t, (arr = []));
  arr.push(i);
}
const ident = [];
for (const arr of byText.values()) {
  if (arr.length < 2) continue;
  // Every identical ayah is "identical to" every other member; store the
  // canonical list once — consumers treat membership as a set.
  for (const i of arr) ident.push(`${ayahs[i].s}:${ayahs[i].a}`);
  for (let x = 0; x < arr.length; x++)
    for (let y = x + 1; y < arr.length; y++) addPair(arr[x], arr[y], true);
}

// ── NW alignment → divergent regions ──────────────────────────────────
function regionsFor(A, B) {
  const n = A.length, m = B.length;
  // dp[i][j] = cost to align A[i:] with B[j:]
  const dp = new Uint16Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) dp[i * W + m] = (n - i);
  for (let j = m - 1; j >= 0; j--) dp[n * W + j] = (m - j);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const sub = dp[(i + 1) * W + j + 1] + (A[i] === B[j] ? 0 : 1);
      const del = dp[(i + 1) * W + j] + 1;
      const ins = dp[i * W + j + 1] + 1;
      dp[i * W + j] = Math.min(sub, del, ins);
    }
  // Traceback → ops; group consecutive non-matches into regions.
  const regions = [];
  let i = 0, j = 0;
  let r = null; // {tag,i1,i2,j1,j2}
  const flush = () => {
    if (r) { regions.push(r); r = null; }
  };
  while (i < n || j < m) {
    const isMatch = i < n && j < m && A[i] === B[j] &&
      dp[i * W + j] === dp[(i + 1) * W + j + 1];
    if (isMatch) { flush(); i++; j++; continue; }
    // choose the op consistent with dp
    const sub = i < n && j < m ? dp[(i + 1) * W + j + 1] + 1 : Infinity;
    const del = i < n ? dp[(i + 1) * W + j] + 1 : Infinity;
    const ins = j < m ? dp[i * W + j + 1] + 1 : Infinity;
    const best = Math.min(sub, del, ins);
    if (best === sub) {
      if (!r) r = { tag: 0, i1: i, i2: i, j1: j, j2: j };
      r.i2 = ++i; r.j2 = ++j;
      if (r.tag !== 0) r.tag = 0; // mixed → replace
    } else if (best === del) {
      if (!r) r = { tag: 1, i1: i, i2: i, j1: j, j2: j };
      r.i2 = ++i;
      if (r.tag === 2) r.tag = 0;
    } else {
      if (!r) r = { tag: 2, i1: i, i2: i, j1: j, j2: j };
      r.j2 = ++j;
      if (r.tag === 1) r.tag = 0;
    }
  }
  flush();
  return regions;
}

// Confusability score: shared words weigh for, divergent span weighs
// against — used only to cap rows per ayah, not stored (engine computes
// its own conf at runtime).
function score(A, B, regions) {
  const divA = regions.reduce((s, r) => s + (r.i2 - r.i1), 0);
  const shared = A.length - divA;
  return shared * 2 - regions.length - divA * 0.5;
}

const pairs = {};
const perAyah = new Map();
let kept = 0, dropped = 0;
const MAX_ROWS_PER_AYAH = 50;

// First pass: build all rows.
const rows = [];
for (const [key, meta] of pairSet) {
  const [ia, ib] = key.split(",").map(Number);
  const A = ayahs[ia].nw, B = ayahs[ib].nw;
  const regs = regionsFor(A, B);
  if (!meta.curated) {
    // Auto pairs need a real shared run (≥ SEED consecutive matched words)
    // — NW alone can fabricate similarity on short ayahs.
    let run = 0, best = 0;
    let i = 0, j = 0;
    // cheap check: longest common substring of normalized words
    const dp = new Uint16Array((A.length + 1) * (B.length + 1));
    const W = B.length + 1;
    for (let x = 1; x <= A.length; x++)
      for (let y = 1; y <= B.length; y++) {
        if (A[x - 1] === B[y - 1]) {
          dp[x * W + y] = dp[(x - 1) * W + y - 1] + 1;
          if (dp[x * W + y] > best) best = dp[x * W + y];
        }
      }
    void run; void i; void j;
    if (best < SEED) { dropped++; continue; }
    // And require the pair to be genuinely confusable: mostly shared.
    if (best < Math.min(A.length, B.length) * 0.4 && regs.length > 4) { dropped++; continue; }
  }
  if (regs.length === 0) { // identical — ident already covers it
    dropped++; continue;
  }
  rows.push({ ia, ib, regs, sc: score(A, B, regs) });
}

// Ending-variant tail rows — region covers ONLY the differing tail
// (replace, i/j ranges = last d words of each ayah). The rest of the
// body simply has no region, so flagDiv stays quiet until the ending.
let tailKept = 0;
for (const [key, { d }] of tailPairs) {
  const [ia, ib] = key.split(",").map(Number);
  const A = ayahs[ia].nw, B = ayahs[ib].nw;
  rows.push({
    ia, ib,
    regs: [{ tag: 0, i1: A.length - d, i2: A.length, j1: B.length - d, j2: B.length }],
    sc: 1000 - d, // tail variants outrank body-diff pairs in the per-ayah cap
  });
  tailKept++;
}

// Group rows per source ayah, cap by score, then serialize.
const byAyah = new Map();
for (const r of rows) {
  for (const [self, other, swap] of [[r.ia, r.ib, false], [r.ib, r.ia, true]]) {
    let arr = byAyah.get(self);
    if (!arr) byAyah.set(self, (arr = []));
    arr.push({ other, swap, regs: r.regs, sc: r.sc });
  }
}
for (const [ia, list] of byAyah) {
  list.sort((a, b) => b.sc - a.sc);
  const v = ayahs[ia];
  const key = `${v.s}:${v.a}`;
  const out = pairs[key] ?? (pairs[key] = []);
  for (const row of list.slice(0, MAX_ROWS_PER_AYAH)) {
    const o = ayahs[row.other];
    const flat = [o.s, o.a];
    for (const g of row.regs) {
      flat.push(row.swap ? g.tag === 1 ? 2 : g.tag === 2 ? 1 : g.tag : g.tag,
        row.swap ? g.j1 : g.i1, row.swap ? g.j2 : g.i2,
        row.swap ? g.i1 : g.j1, row.swap ? g.i2 : g.j2);
    }
    out.push(flat);
    kept++;
  }
  perAyah.set(key, out.length);
}

const out = { v: 1, pairs, ident: [...new Set(ident)].sort() };
const dest = join(ROOT, "src/features/quran-tester/muta-index.json");
writeFileSync(dest, JSON.stringify(out));
const bytes = JSON.stringify(out).length;
console.log(`ayahs: ${ayahs.length}`);
console.log(`waqar pairs: ${waqarPairs} | seed pairs: ${seedPairs} | candidate pairs: ${pairSet.size}`);
console.log(`rows kept: ${kept} (tail-variant candidates: ${tailKept}) | dropped: ${dropped} | ayahs with pairs: ${Object.keys(pairs).length} | ident: ${out.ident.length}`);
console.log(`wrote ${dest} (${(bytes / 1024).toFixed(0)} KB)`);

// Sanity: ending-variant spot checks.
for (const probe of ["2:285", "4:46", "6:141", "3:18", "59:22"]) {
  const rowsP = pairs[probe];
  if (rowsP) console.log(`${probe}: ${rowsP.length} partner rows`);
}
