/**
 * Friend closeness scoring — shared by the API (authoritative) and the
 * client (live preview). Five dimensions, weighted, capped at 100:
 *
 *   frequency   how often you talk          (0–30)
 *   history     how long you've known them  (0–20)
 *   intimacy    "would they show up at 3am" (0–22)
 *   openness    "can you be fully yourself" (0–16)
 *   bond        the context you met in      (0–12)
 *
 * Rings (Dunbar-flavored): ≥72 inner circle · ≥45 close · below → outer.
 */

export const FREQ_PTS: Record<string, number> = { daily: 30, weekly: 22, monthly: 13, rarely: 5 };
export const YEARS_PTS: Record<string, number> = { lt1: 5, y1_3: 10, y3_7: 15, y7p: 20 };
export const TRUST_PTS: Record<string, number> = { definitely: 22, probably: 12, unsure: 4 };
export const OPEN_PTS: Record<string, number> = { always: 16, mostly: 9, rarely: 3 };
export const MET_PTS: Record<string, number> = {
  childhood: 12, family: 12, school: 7, masjid: 7, work: 7, online: 3, other: 3,
};

export function friendScore(f: {
  talkFreq?: string | null;
  knownYears?: string | null;
  trust?: string | null;
  openness?: string | null;
  metTag?: string | null;
}): number {
  return Math.min(
    100,
    (FREQ_PTS[f.talkFreq ?? ""] ?? 0) +
      (YEARS_PTS[f.knownYears ?? ""] ?? 0) +
      (TRUST_PTS[f.trust ?? ""] ?? 0) +
      (OPEN_PTS[f.openness ?? ""] ?? 0) +
      (MET_PTS[f.metTag ?? ""] ?? 0),
  );
}

export function friendTier(score: number): 0 | 1 | 2 {
  return score >= 72 ? 0 : score >= 45 ? 1 : 2;
}
