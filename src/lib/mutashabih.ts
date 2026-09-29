/**
 * Mutashabih — shared client/server helpers. The dataset is
 * public/data/mutashabihat.json (built by scripts/build-mutashabihat.ts):
 * every family is a fragment that appears 2–7 times corpus-wide.
 */

export interface MutashabihInstance { s: number; a: number; ar: string; i0: number; i1: number }
export interface MutashabihFamily { frag: string; instances: MutashabihInstance[]; ctx?: number; curated?: boolean }

export type MutashabihMode = "count" | "homes" | "ending";

/** 1v1 rounds cycle the three modes deterministically — both players compute
 *  the same mode for the same round number, no extra payload needed. */
export const MATCH_MODES: MutashabihMode[] = ["count", "homes", "ending"];
export const matchMode = (round: number): MutashabihMode => MATCH_MODES[(round - 1) % MATCH_MODES.length];

/** Divergent tail: up to 6 display words after the shared span. */
export function tailOf(inst: MutashabihInstance): string {
  const w = inst.ar.split(/\s+/).filter(Boolean);
  return w.slice(inst.i1, inst.i1 + 6).join(" ") || "—end of the ayah—";
}

export function distinctSurahs(f: MutashabihFamily): number {
  return new Set(f.instances.map((i) => i.s)).size;
}
export function distinctTails(f: MutashabihFamily): number {
  return new Set(f.instances.map(tailOf)).size;
}
