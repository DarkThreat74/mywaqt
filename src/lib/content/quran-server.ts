import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCorpus, buildIndex, uniqueFragment, leaksAnswer, mulberry32, type Verse, type CorpusIndex } from "./quran";

// Server-side corpus — the same /data/quran.json the client loads, read once
// per cold start. The server needs it to generate a match's verse sequence so
// both players see identical rounds (no realtime transport required).

let cache: { verses: Verse[]; idx: CorpusIndex } | null = null;

export function getCorpus(): { verses: Verse[]; idx: CorpusIndex } {
  if (cache) return cache;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "quran.json"), "utf8"),
  ) as { s: number; verses: [number, string, string][] }[];
  const verses = loadCorpus(raw);
  cache = { verses, idx: buildIndex(verses) };
  return cache;
}



/**
 * Generate a match's verse sequence — indexes into the corpus, leak-free,
 * unique-fragment verified for medium/elite. Deterministic given the seed,
 * so the sequence could also be recomputed client-side for replay/debugging.
 */
export function pickMatchVerses(seed: number, rounds: number, fragMode: "full" | "unique"): number[] {
  const { verses, idx } = getCorpus();
  const rand = mulberry32(seed);
  const out: number[] = [];
  const used = new Set<number>();
  let guard = rounds * 200;
  while (out.length < rounds && guard-- > 0) {
    const i = Math.floor(rand() * verses.length);
    if (used.has(i)) continue;
    const v = verses[i];
    if (leaksAnswer(v)) continue;
    if (fragMode === "unique" && !uniqueFragment(v, idx)) continue;
    used.add(i);
    out.push(i);
  }
  return out;
}
