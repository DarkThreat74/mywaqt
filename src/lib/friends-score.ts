/**
 * Friend closeness scoring — shared by the API (authoritative) and the
 * client (live preview). Eleven weighted dimensions, raw max ~99, then a
 * phase multiplier so drifted friendships actually drop rings.
 *
 *   sacrifice   "moving day — what happens"        (0–13) communal strength
 *   gap         "2 months of silence, then you     (0–13) self-maintenance —
 *                see them"                                  the best-friend
 *                                                           discriminator
 *   trust       "3am — do they get the call"       (0–13) reliable alliance
 *   freq        how often you actually link        (0–11) time investment
 *   openness    how much of real life they know    (0–11) disclosure
 *   loyalty     "would they back you behind        (0–9)
 *                your back"
 *   plans       who makes the plans                (0–7)  effort equity
 *   shortlist   "the people who matter — do they   (0–6)  IOS self-overlap
 *                make it"
 *   tell        "big news — do they hear it        (0–6)  reciprocity
 *                from you"
 *   hangout     side-by-side vs face-to-face       (0–4)  bonding style
 *   years       shared history                     (0–4)
 *   met         context bond                       (0–3)
 *
 * Phase multiplier: 'steady' ×1.0 · 'wascloser' ×0.8 · 'distant' ×0.55.
 * Rings: ≥78 inner circle · ≥52 close · below → outer orbit.
 * Childhood skips the duration question — it implies 7+ years.
 */

export const FREQ_PTS: Record<string, number> = { daily: 11, weekly: 8, monthly: 4, rarely: 2 };
export const YEARS_PTS: Record<string, number> = { lt1: 1, y1_3: 2, y3_7: 3, y7p: 4 };
export const TRUST_PTS: Record<string, number> = {
  definitely: 13, first: 13, topfew: 9, probably: 6, depends: 3, unsure: 1, wouldnt: 0,
};
export const OPEN_PTS: Record<string, number> = {
  always: 11, everything: 11, mostly: 7, most: 7, light: 4, rarely: 1, notmuch: 1,
};
export const PHASE_PTS: Record<string, number> = { steady: 1, wascloser: 0.8, distant: 0.55 };
export const MISS_PTS: Record<string, number> = { gutted: 10, alot: 6, alittle: 2 };
export const TELL_PTS: Record<string, number> = { first: 6, eventually: 3, rarely: 0, wouldnt: 0 };
export const VIBE_PTS: Record<string, number> = { person: 8, goodtime: 5, easygoing: 5, new: 2 };
export const SACRIFICE_PTS: Record<string, number> = { noask: 13, asked: 9, cost: 4, excuse: 0 };
export const LOYALTY_PTS: Record<string, number> = { absolutely: 9, probably: 5, unsure: 2, no: 0 };
export const GAP_PTS: Record<string, number> = { notime: 13, backup: 9, awkward: 4, strangers: 0 };
export const PLANS_PTS: Record<string, number> = { both: 7, easy: 7, them: 4, me: 3 };
export const HANGOUT_PTS: Record<string, number> = { doing: 4, mix: 4, talking: 3, texting: 2 };
export const SHORTLIST_PTS: Record<string, number> = { definitely: 6, probably: 3, unsure: 1, no: 0 };
// Propinquity control — "do you see them because you choose to, or because
// you're in the same place?" Contact forced by shared context (same class,
// same job) shouldn't earn full frequency/hangout credit. Scales the
// interaction terms only — every other dimension still counts.
export const VOLITION_FACTOR: Record<string, number> = { choose: 1, mix: 0.8, context: 0.5 };
// Attunement — noticing without being told (McGill "knows when I'm upset").
// The strongest covert-intimacy signal for friendships that run side-by-side.
export const ATTUNE_PTS: Record<string, number> = { notice: 8, eventually: 5, told: 2, wouldnt: 0 };
export const MET_PTS: Record<string, number> = {
  childhood: 3, family: 3, masjid: 2, school: 2, work: 2, neighbor: 2,
  mutual: 2, sports: 2, travel: 1, online: 1, other: 1,
};

export function friendScore(f: {
  talkFreq?: string | null;
  knownYears?: string | null;
  trust?: string | null;
  openness?: string | null;
  miss?: string | null;
  tell?: string | null;
  phase?: string | null;
  vibe?: string | null;
  metTag?: string | null;
  sacrifice?: string | null;
  loyalty?: string | null;
  gap?: string | null;
  plans?: string | null;
  hangout?: string | null;
  shortlist?: string | null;
  volition?: string | null;
  attune?: string | null;
}): number {
  // Childhood met-context implies a long history — no duration question asked.
  const years = f.knownYears ?? (f.metTag === "childhood" ? "y7p" : null);
  const interaction =
    ((FREQ_PTS[f.talkFreq ?? ""] ?? 0) + (HANGOUT_PTS[f.hangout ?? ""] ?? 0)) *
    (VOLITION_FACTOR[f.volition ?? "choose"] ?? 1);
  const raw =
    interaction +
    (YEARS_PTS[years ?? ""] ?? 0) +
    (TRUST_PTS[f.trust ?? ""] ?? 0) +
    (OPEN_PTS[f.openness ?? ""] ?? 0) +
    (TELL_PTS[f.tell ?? ""] ?? 0) +
    (SACRIFICE_PTS[f.sacrifice ?? ""] ?? 0) +
    (LOYALTY_PTS[f.loyalty ?? ""] ?? 0) +
    (GAP_PTS[f.gap ?? ""] ?? 0) +
    (PLANS_PTS[f.plans ?? ""] ?? 0) +
    (SHORTLIST_PTS[f.shortlist ?? ""] ?? 0) +
    (ATTUNE_PTS[f.attune ?? ""] ?? 0) +
    (MET_PTS[f.metTag ?? ""] ?? 0) +
    // Legacy rows answered "miss"/"vibe" instead of the new probes — keep
    // them contributing a little so old entries don't rescore to ~outer.
    Math.round(((MISS_PTS[f.miss ?? ""] ?? 0) + (VIBE_PTS[f.vibe ?? ""] ?? 0)) / 2);
  const mult = PHASE_PTS[f.phase ?? "steady"] ?? 1;
  return Math.min(100, Math.round(raw * mult));
}

export function friendTier(score: number): 0 | 1 | 2 {
  return score >= 78 ? 0 : score >= 52 ? 1 : 2;
}
