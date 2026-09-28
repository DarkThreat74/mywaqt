/**
 * Self-check: every fragment uniqueFragment() emits must appear in exactly
 * one verse under clitic-normalized matching (و/ف/ب/ل prefixes stripped, so
 * اصبر / واصبر / فاصبر are the same word to a hafidh).
 * Run: pnpm exec tsx scripts/check-quran-unique.ts
 */
import { readFileSync } from "node:fs";
import { loadCorpus, buildIndex, uniqueFragment, normalizeArabic } from "../src/lib/content/quran";

const raw = JSON.parse(readFileSync("public/data/quran.json", "utf8"));
const verses = loadCorpus(raw);
const idx = buildIndex(verses);

// gram[len][joinedWords] = set of verse indexes containing that slice
const gram = new Map<number, Map<string, Set<number>>>();
for (let len = 1; len <= 8; len++) gram.set(len, new Map());
verses.forEach((v, vi) => {
  for (let len = 1; len <= 8; len++) {
    const m = gram.get(len)!;
    for (let i = 0; i + len <= v.nw.length; i++) {
      const key = v.nw.slice(i, i + len).join(" ");
      let s = m.get(key);
      if (!s) m.set(key, (s = new Set()));
      s.add(vi);
    }
  }
});

let checked = 0;
let failures = 0;
for (const v of verses) {
  const frag = uniqueFragment(v, idx);
  if (!frag) continue;
  checked++;
  const words = normalizeArabic(frag.text.replace(/…/g, ""));
  const set = gram.get(words.length)?.get(words.join(" "));
  if (!set || set.size !== 1) {
    console.error(`COLLISION ${v.s}:${v.a} "${words.join(" ")}" found in ${set?.size ?? 0} verses`);
    failures++;
  }
}

console.log(`checked ${checked} fragments across ${verses.length} verses — ${failures} collisions`);
process.exit(failures ? 1 : 0);
