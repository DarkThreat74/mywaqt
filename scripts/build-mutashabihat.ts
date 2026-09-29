/**
 * Build public/data/mutashabihat.json — the offline dataset for Mutashabih.
 *
 * Source: scripts/data/mutashabihat-waqar.json — hafiz-curated mutashabihat
 * pairs (Waqar144/Quran_Mutashabihat_Data, based on Qari Idrees Al-Asim).
 * It lists AYAH-level similarities by absolute ayah number; we compute the
 * shared fragment ourselves as the longest common contiguous word-run over
 * normalized text (same normWord as the game), then record display-word
 * spans so the client can color the shared part vs divergent tails.
 *
 * Run: pnpm exec tsx scripts/build-mutashabihat.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCorpus, type Verse } from "../src/lib/content/quran";

type RawEntry = { src: { ayah: number | number[] }; muts: { ayah: number }[]; ctx?: number };

const corpus = loadCorpus(
  JSON.parse(readFileSync("public/data/quran.json", "utf-8")),
);
const byAbs: Verse[] = [];
for (const v of corpus) byAbs.push(v); // corpus order = absolute order

const raw: Record<string, RawEntry[]> = JSON.parse(
  readFileSync("scripts/data/mutashabihat-waqar.json", "utf-8"),
);

// ── Union-find over absolute ayah ids → connected families ─────────────────
const parent = new Map<number, number>();
const find = (x: number): number => {
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r)!;
  while (parent.get(x)! !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
  return r;
};
const union = (a: number, b: number) => parent.set(find(a), find(b));

const srcList: { abs: number; ctx?: number }[] = [];
for (const entries of Object.values(raw)) {
  for (const e of entries) {
    const srcs = Array.isArray(e.src.ayah) ? e.src.ayah : [e.src.ayah];
    for (const s of srcs) {
      parent.set(s, s);
      srcList.push({ abs: s, ctx: e.ctx });
    }
    for (const m of e.muts) {
      parent.set(m.ayah, m.ayah);
      for (const s of srcs) union(s, m.ayah);
    }
  }
}
const families = new Map<number, { abs: number; ctx?: number }[]>();
for (const s of srcList) {
  const r = find(s.abs);
  if (!families.has(r)) families.set(r, []);
  families.get(r)!.push(s);
}
// pull pure-mut ayahs (never a src) into their family
for (const entries of Object.values(raw)) for (const e of entries) {
  for (const m of e.muts) {
    const r = find(m.ayah);
    const fam = families.get(r);
    if (fam && !fam.some((x) => x.abs === m.ayah)) fam.push({ abs: m.ayah });
  }
}

// ── Longest common contiguous run (normalized words) between two verses ────
/** All longest contiguous normalized-word runs shared by a and b — [i0,i1) in `a`. */
function lcsRun(a: string[], b: string[]): [number, number][] {
  let bestLen = 0;
  const best: [number, number][] = [];
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > bestLen) { bestLen = k; best.length = 0; }
      if (k === bestLen && k > 0) best.push([i, i + k]);
    }
  }
  return best;
}

function containsRun(nw: string[], frag: string[]): number {
  outer: for (let i = 0; i + frag.length <= nw.length; i++) {
    for (let j = 0; j < frag.length; j++) if (nw[i + j] !== frag[j]) continue outer;
    return i;
  }
  return -1;
}

const out: {
  frag: string;          // shared portion, uthmani display text
  instances: { s: number; a: number; ar: string; i0: number; i1: number }[];
  ctx?: number;
  curated?: boolean;
}[] = [];
let dropped = 0;

console.log(`families to process: ${families.size}`);
let fi = 0;
for (const fam of families.values()) {
  if (++fi % 50 === 0) console.log(`  fam ${fi}/${families.size}`);
  const verses = fam.map((f) => byAbs[f.abs - 1]).filter(Boolean);
  if (verses.length < 2) { dropped++; continue; }
  const src = verses[0];
  // Candidate fragments: longest runs shared between src and each member
  const cand = new Map<string, { nw: string[]; count: number }>();
  for (const v of verses.slice(1)) {
    for (const [i0, i1] of lcsRun(src.nw, v.nw)) {
      const frag = src.nw.slice(i0, i1);
      if (frag.length < 2) continue;
      const key = frag.join(" ");
      const cnt = 1 + verses.slice(1).filter((o) => containsRun(o.nw, frag) >= 0).length;
      const cur = cand.get(key);
      if (!cur || cnt > cur.count) cand.set(key, { nw: frag, count: cnt });
    }
  }
  // pick: most coverage, then longest
  const best = [...cand.values()].sort((x, y) => y.count - x.count || y.nw.length - x.nw.length)[0];
  if (!best || best.count < 2) { dropped++; continue; }
  // The game states "appears N times in the Quran" — that must be the TRUE
  // corpus-wide count, not just the curated family. Enumerate every
  // occurrence of the fragment (any position, any ayah) and keep only
  // fragments that stay within the 2–7 cap the modes promise.
  const inst: { s: number; a: number; ar: string; i0: number; i1: number }[] = [];
  for (const v of corpus) {
    let off = 0;
    for (;;) {
      const i = containsRun(v.nw.slice(off), best.nw);
      if (i < 0) break;
      inst.push({ s: v.s, a: v.a, ar: v.ar, i0: off + i, i1: off + i + best.nw.length });
      off += i + 1;
    }
  }
  if (inst.length < 2 || inst.length > 7) { dropped++; continue; }
  const ctx = fam.find((f) => f.ctx)?.ctx;
  const i0 = containsRun(src.nw, best.nw);
  out.push({
    frag: src.w.slice(i0, i0 + best.nw.length).join(" "),
    instances: inst,
    ...(ctx ? { ctx } : {}),
  });
}

// Different curated families can surface the same fragment — dedupe.
const seen = new Set<string>();
const final = out.filter((f) => {
  const key = f.frag;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
out.length = 0;
out.push(...final.map((f) => ({ ...f, curated: true as const })));

// ── Auto-derived pass: every maximal normalized fragment appearing 2–7× ────
// Curated pairs only cover hafiz-confusing families; the game needs volume.
// Build positions for all 3-word seeds, extend right/left while every
// occurrence shares the same neighbor word → maximal fragment, truthful count.
const SEED = 3, MAX_COUNT = 7;
const seedPos = new Map<string, [number, number][]>(); // gram -> [verseIdx, start]
for (let vi = 0; vi < corpus.length; vi++) {
  const nw = corpus[vi].nw;
  for (let i = 0; i + SEED <= nw.length; i++) {
    const g = nw.slice(i, i + SEED).join(" ");
    (seedPos.get(g) ?? seedPos.set(g, []).get(g)!).push([vi, i]);
  }
}
console.log(`seeds: ${seedPos.size}`);
let derived = 0;
let si = 0;
for (const [seed, pos] of seedPos) {
  if (++si % 20000 === 0) console.log(`  seed ${si}/${seedPos.size}`);
  if (pos.length < 2 || pos.length > MAX_COUNT) continue;
  const nw = seed.split(" ");
  const cur = pos;
  // extend right
  for (;;) {
    const nexts = cur.map(([vi, i]) => corpus[vi].nw[i + nw.length]);
    if (nexts.some((n) => n === undefined) || new Set(nexts).size !== 1) break;
    nw.push(nexts[0]!);
  }
  // extend left — track how far we've walked; `i` still points at the seed
  let left = 0;
  for (;;) {
    const prevs = cur.map(([vi, i]) => (i - left - 1 >= 0 ? corpus[vi].nw[i - left - 1] : undefined));
    if (prevs.some((p) => p === undefined) || new Set(prevs).size !== 1) break;
    nw.unshift(prevs[0]!);
    left++;
  }
  const lastEnd = new Map<number, number>(); // verse -> last i1 (dup occurrence in one ayah)
  const instances = cur.map(([vi]) => {
    const v = corpus[vi];
    const off = lastEnd.get(vi) ?? 0;
    const rel = containsRun(v.nw.slice(off), nw);
    const i0 = off + Math.max(0, rel);
    lastEnd.set(vi, i0 + nw.length);
    return { s: v.s, a: v.a, ar: v.ar, i0, i1: i0 + nw.length, ok: rel >= 0 };
  });
  if (instances.some((x) => !x.ok)) continue; // sanity — positions moved? skip
  const fragText = corpus[cur[0][0]].w.slice(instances[0].i0, instances[0].i1).join(" ");
  if (seen.has(fragText)) continue;
  seen.add(fragText);
  out.push({ frag: fragText, instances: instances.map(({ s, a, ar, i0, i1 }) => ({ s, a, ar, i0, i1 })) });
  derived++;
}
console.log(`derived: ${derived}`);

out.sort((x, y) => y.instances.length - x.instances.length);
writeFileSync("public/data/mutashabihat.json", JSON.stringify(out));
const hist = new Map<number, number>();
for (const f of out) hist.set(f.instances.length, (hist.get(f.instances.length) ?? 0) + 1);
console.log(`families: ${out.length}  dropped: ${dropped}`);
console.log("instance-count histogram:", Object.fromEntries([...hist.entries()].sort()));
console.log("sample:", JSON.stringify(out[0], null, 1).slice(0, 900));
