import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./quran";
import { matchMode, distinctSurahs, distinctTails, type MutashabihFamily, type MutashabihMode } from "../mutashabih";

// Server-side mutashabihat dataset — the same JSON the client plays from,
// read once per cold start. The server needs it to generate a match's family
// sequence and to pick the ending-mode target deterministically.

let cache: MutashabihFamily[] | null = null;
let pools: Record<MutashabihMode, number[]> | null = null;

export function getMutashabihat(): MutashabihFamily[] {
  if (!cache) {
    cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "mutashabihat.json"), "utf8"),
    ) as MutashabihFamily[];
  }
  return cache;
}

/** Per-mode eligible family indexes — the same rules the client uses:
 *  count: ≤5 occurrences; homes: ≥2 distinct surahs; ending: ≥2 distinct
 *  tails AND ≥2 distinct surahs (else the question is unanswerable). */
function modePools(): Record<MutashabihMode, number[]> {
  if (pools) return pools;
  const fams = getMutashabihat();
  const p: Record<MutashabihMode, number[]> = { count: [], homes: [], ending: [] };
  fams.forEach((f, i) => {
    if (f.instances.length <= 5) p.count.push(i);
    if (distinctSurahs(f) >= 2) {
      p.homes.push(i);
      if (distinctTails(f) >= 2) p.ending.push(i);
    }
  });
  pools = p;
  return p;
}

/**
 * Generate a match's family sequence — indexes into the shared dataset.
 * Round mode = matchMode(round): count → homes → ending, cycling.
 */
export function pickMatchFamilies(seed: number, rounds: number): number[] {
  const rand = mulberry32(seed);
  const p = modePools();
  const out: number[] = [];
  const used = new Set<number>();
  let guard = rounds * 200;
  while (out.length < rounds && guard-- > 0) {
    const pool = p[matchMode(out.length + 1)];
    if (pool.length === 0) return out;
    const i = pool[Math.floor(rand() * pool.length)];
    if (used.has(i)) continue;
    used.add(i);
    out.push(i);
  }
  return out;
}

/** Deterministic ending-mode target — same for both players given seed+round. */
export function matchTarget(seed: number, round: number, familyIdx: number): number {
  const fam = getMutashabihat()[familyIdx];
  return fam ? (seed * 31 + round) % fam.instances.length : 0;
}
