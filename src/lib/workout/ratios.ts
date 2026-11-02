// Lift-to-lift e1RM ratios — population defaults from the strength literature.
// variant.slug → ordered parent slugs to try + the fraction of parent weight
// the variant typically moves. Conf = reliability of the ratio (0–1).
// Sources: Rodríguez-Ridao 2020 (incline ladder), Saeterbakken 2011 (DB bench),
// Maeo 2022 (overhead vs pushdown), Rippetoe PPST (OHP), JSCR front squat,
// StrengthLog RDL, FitnessVolt CGBP, Saeterbakken & Fimland 2013 (seated OHP).
export interface RatioLink { from: string[]; r: number; conf: number; why: string }

export const RATIOS: Record<string, RatioLink> = {
  "incline-bench-15": { from: ["barbell-bench-press", "incline-bench-30"], r: 0.88, conf: 0.9, why: "15° keeps most sternal-pec contribution" },
  "incline-bench-30": { from: ["barbell-bench-press", "incline-bench-15"], r: 0.78, conf: 0.9, why: "30° shifts work to clavicular pec + front delt" },
  "incline-bench-45": { from: ["barbell-bench-press", "incline-bench-30"], r: 0.71, conf: 0.85, why: "45° is mostly anterior delt" },
  "incline-bench-60": { from: ["barbell-bench-press", "incline-bench-45"], r: 0.64, conf: 0.8, why: "60° approaches an overhead press" },
  "incline-db-press": { from: ["dumbbell-press", "incline-bench-30"], r: 0.78, conf: 0.75, why: "same incline discount as barbell" },
  "dumbbell-press": { from: ["barbell-bench-press", "machine-chest-press"], r: 0.41, conf: 0.8, why: "per-hand — independent stabilization" },
  "close-grip-bench": { from: ["barbell-bench-press"], r: 0.93, conf: 0.75, why: "narrow grip shifts load to triceps" },
  "guillotine-press": { from: ["barbell-bench-press"], r: 0.85, conf: 0.6, why: "neck line removes leg drive + pec stretch" },
  "wide-grip-bench": { from: ["barbell-bench-press"], r: 0.95, conf: 0.6, why: "shorter ROM, more pec, less triceps" },
  "paused-bench": { from: ["barbell-bench-press"], r: 0.93, conf: 0.7, why: "no stretch reflex at the chest" },
  "barbell-ohp": { from: ["barbell-bench-press", "incline-bench-60"], r: 0.65, conf: 0.8, why: "no bench support, smaller prime movers" },
  "seated-db-press": { from: ["barbell-ohp", "barbell-bench-press"], r: 1.08, conf: 0.6, why: "seated with back support vs standing barbell" },
  "machine-shoulder-press": { from: ["barbell-ohp"], r: 1.1, conf: 0.5, why: "guided path removes stabilization" },
  "front-squat": { from: ["back-squat", "low-bar-squat"], r: 0.8, conf: 0.8, why: "upright torso; rack position limits before legs" },
  "low-bar-squat": { from: ["back-squat", "hack-squat"], r: 1.05, conf: 0.6, why: "posterior chain takes more load" },
  "hack-squat": { from: ["back-squat"], r: 1.1, conf: 0.5, why: "guided path; back supported" },
  "leg-press": { from: ["back-squat"], r: 2.0, conf: 0.4, why: "sled travel doubles apparent load — varies by machine" },
  "rdl": { from: ["deadlift", "stiff-leg-deadlift"], r: 0.8, conf: 0.7, why: "no leg drive, no floor reset" },
  "stiff-leg-deadlift": { from: ["deadlift"], r: 0.75, conf: 0.6, why: "straight legs remove quad contribution" },
  "sumo-deadlift": { from: ["deadlift"], r: 0.95, conf: 0.5, why: "shorter ROM, more quads — very individual" },
  "db-curl": { from: ["bb-curl", "ez-bar-curl"], r: 0.46, conf: 0.6, why: "per-hand bilateral deficit" },
  "hammer-curl": { from: ["bb-curl", "db-curl"], r: 0.9, conf: 0.5, why: "neutral grip recruits brachioradialis" },
  "preacher-curl": { from: ["bb-curl", "ez-bar-curl"], r: 0.8, conf: 0.55, why: "arms braced, short-range bottom" },
  "overhead-db-extension": { from: ["pressdown", "rope-pressdown"], r: 0.63, conf: 0.75, why: "long head stretched → weak limb of curve" },
  "overhead-rope-extension": { from: ["rope-pressdown", "pressdown"], r: 0.63, conf: 0.75, why: "same stretched-position discount" },
  "skullcrusher": { from: ["pressdown", "close-grip-bench"], r: 0.5, conf: 0.55, why: "elbows overhead + isolation only" },
  "cable-kickback": { from: ["pressdown"], r: 0.45, conf: 0.5, why: "top-loaded, strict isolation" },
  "dips": { from: ["barbell-bench-press", "close-grip-bench"], r: 1.0, conf: 0.4, why: "bodyweight+added — compare added load only" },
};

// Estimate a target lift's e1RM from the user's logged bests on related lifts.
// Parents are tried in order — the first logged one wins (they're ordered by
// confidence). Returns { e1, from } or null when nothing is logged yet.
export function estimateE1(
  slug: string,
  bestBySlug: Map<string, number>,
): { e1: number; from: string; conf: number; why: string } | null {
  const link = RATIOS[slug];
  if (!link) return null;
  for (const parent of link.from) {
    const pe = bestBySlug.get(parent);
    if (pe && pe > 0) return { e1: Math.round(pe * link.r * 10) / 10, from: parent, conf: link.conf, why: link.why };
  }
  return null;
}
