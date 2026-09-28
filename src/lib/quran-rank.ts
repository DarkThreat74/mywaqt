/**
 * Ranked Quran Challenge — Elite mode only. Shared by the rating API
 * (server-authoritative writes) and the client (display, timer gate).
 *
 * Ladder in tiers of Quranic mastery; reaching Qari (800) turns on the
 * 60-second per-question clock — timed play is the ranked endgame.
 */
export interface Rank {
  id: string;
  en: string;
  ar: string;
  min: number;
  /** Elite questions become timed at this rank and above */
  timed: boolean;
}

export const RANKS: Rank[] = [
  { id: "tilawa", en: "Tilawa", ar: "تلاوة", min: 0, timed: false },
  { id: "talib", en: "Talib", ar: "طالب", min: 300, timed: false },
  { id: "qari", en: "Qari", ar: "قارئ", min: 800, timed: true },
  { id: "hafidh", en: "Hafidh", ar: "حافظ", min: 1600, timed: true },
  { id: "shaykh", en: "Shaykh", ar: "شيخ", min: 2800, timed: true },
];

export const TIMED_LIMIT_MS = 60_000;

export function rankFor(rating: number): Rank {
  let r = RANKS[0];
  for (const k of RANKS) if (rating >= k.min) r = k;
  return r;
}

export function nextRank(rating: number): Rank | null {
  return RANKS.find((k) => k.min > rating) ?? null;
}

/**
 * Per-question rating delta. Correct: 16 base + up to +8 speed bonus
 * (−1 per 3s elapsed). Wrong: lose half the potential — risky by design.
 * Rating never drops below 0.
 */
export function rankDelta(correct: boolean, ms: number): number {
  const potential = 16 + Math.max(0, 8 - Math.floor(Math.min(ms, TIMED_LIMIT_MS) / 3000));
  return correct ? potential : -Math.ceil(potential / 2);
}
