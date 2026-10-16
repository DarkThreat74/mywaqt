/**
 * Friend closeness scoring — shared by the API (authoritative) and the
 * client (live preview). Six dimensions, weighted, capped at 100:
 *
 *   frequency   how often you talk              (0–24)
 *   history     how long you've known them      (0–16)
 *   intimacy    "3am — would you call them"     (0–18)
 *   openness    "can you be fully yourself"     (0–14)
 *   longing     "if they moved away…"           (0–10)
 *   priority    "good news — who do you tell"   (0–8)
 *   bond        the context you met in          (0–10)
 *
 * Rings (Dunbar-flavored): ≥72 inner circle · ≥45 close · below → outer.
 * Childhood skips the duration question — it implies 7+ years.
 */

export const FREQ_PTS: Record<string, number> = { daily: 24, weekly: 18, monthly: 11, rarely: 4 };
export const YEARS_PTS: Record<string, number> = { lt1: 4, y1_3: 8, y3_7: 12, y7p: 16 };
export const TRUST_PTS: Record<string, number> = { definitely: 18, probably: 10, unsure: 3 };
export const OPEN_PTS: Record<string, number> = { always: 14, mostly: 8, rarely: 2 };
export const MISS_PTS: Record<string, number> = { gutted: 10, alot: 6, alittle: 2 };
export const TELL_PTS: Record<string, number> = { first: 8, eventually: 4, rarely: 1 };
export const MET_PTS: Record<string, number> = {
  childhood: 10, family: 10, school: 6, masjid: 6, work: 6, online: 2, other: 2,
};

export function friendScore(f: {
  talkFreq?: string | null;
  knownYears?: string | null;
  trust?: string | null;
  openness?: string | null;
  miss?: string | null;
  tell?: string | null;
  metTag?: string | null;
}): number {
  // Childhood met-context implies a long history — no duration question asked.
  const years = f.knownYears ?? (f.metTag === "childhood" ? "y7p" : null);
  return Math.min(
    100,
    (FREQ_PTS[f.talkFreq ?? ""] ?? 0) +
      (YEARS_PTS[years ?? ""] ?? 0) +
      (TRUST_PTS[f.trust ?? ""] ?? 0) +
      (OPEN_PTS[f.openness ?? ""] ?? 0) +
      (MISS_PTS[f.miss ?? ""] ?? 0) +
      (TELL_PTS[f.tell ?? ""] ?? 0) +
      (MET_PTS[f.metTag ?? ""] ?? 0),
  );
}

export function friendTier(score: number): 0 | 1 | 2 {
  return score >= 72 ? 0 : score >= 45 ? 1 : 2;
}
