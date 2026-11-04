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
  "front-squat": { from: ["back-squat", "low-bar-squat"], r: 0.83, conf: 0.85, why: "upright torso; rack position limits before legs (btwb data)" },
  "low-bar-squat": { from: ["back-squat", "hack-squat"], r: 1.05, conf: 0.6, why: "posterior chain takes more load" },
  "hack-squat": { from: ["back-squat"], r: 1.1, conf: 0.5, why: "guided path; back supported" },
  "smith-squat": { from: ["back-squat"], r: 1.06, conf: 0.5, why: "guided path — +4-8% (Cotterman 2005)" },
  "smith-bench": { from: ["barbell-bench-press"], r: 0.88, conf: 0.6, why: "Smith bench is LIGHTER not heavier (−11%, Cotterman 2005)" },
  "leg-press": { from: ["back-squat"], r: 2.25, conf: 0.4, why: "sled ~2-2.5× squat — machine-dependent" },
  "leg-press-wide": { from: ["back-squat"], r: 2.25, conf: 0.4, why: "same sled estimate" },
  "single-leg-press": { from: ["leg-press"], r: 0.58, conf: 0.6, why: "bilateral deficit — each leg ~58% of half" },
  "deadlift": { from: ["back-squat"], r: 1.22, conf: 0.7, why: "coaching standard ~120-125% of squat" },
  "trap-bar-deadlift": { from: ["deadlift"], r: 1.07, conf: 0.75, why: "hex bar +6-8%, more quad less hip (Swinton 2011)" },
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

// Equipment/attachment caveats — surfaced as tips, not ratio entries, because
// they change the *reading*, not the lift. Dual-pulley cable stacks mechanically
// halve the pin load; bars aren't all 20kg.
export const EQUIP_NOTES: Record<string, string> = {
  // cable machines
  "pressdown": "on a dual-stack pulley the pin reads ~2× the real load — log what the pin says, compare same-machine only",
  "rope-pressdown": "rope allows an outward pull at the bottom — slightly more long head than a straight bar",
  "vbar-pressdown": "v-bar is fixed-grip — same line as a bar, easier on the wrists",
  "cable-lateral-raise": "cable keeps tension at the bottom — no slack at the start like a dumbbell",
  "overhead-rope-extension": "rope on the dual stack reads ~2× — also lets hands separate at lockout",
  // bars & machines
  "ez-bar-curl": "EZ bar is ~10kg, not 20 — a 30kg 'barbell curl' on EZ is really ~25kg",
  "smith-bench": "Smith bar is often ~7-15kg counterbalanced, not 20 — check the machine's label",
  "smith-squat": "Smith bar is often ~7-15kg counterbalanced, not 20 — check the machine's label",
  "machine-preacher-curl": "plate-loaded machines vary — same number isn't comparable across brands",
};

// Exercise variations — foot/grip/attachment positions that change muscle
// emphasis. Stored per set so history tracks which position was used.
export const VARIATIONS: Record<string, { key: string; label: string; note: string }[]> = {
  "standing-leg-curl": [
    { key: "neutral", label: "toes straight", note: "even hamstring emphasis" },
    { key: "out", label: "toes out", note: "more inner hamstrings (semitendinosus)" },
    { key: "in", label: "toes in", note: "more outer hamstrings (biceps femoris)" },
  ],
  "lying-leg-curl": [
    { key: "neutral", label: "toes straight", note: "even hamstring emphasis" },
    { key: "out", label: "toes out", note: "more inner hamstrings" },
    { key: "in", label: "toes in", note: "more outer hamstrings" },
  ],
  "ez-bar-curl": [
    { key: "barbell", label: "barbell", note: "heaviest load, both arms" },
    { key: "ez", label: "EZ bar", note: "easier wrists, ~10kg bar" },
    { key: "cable", label: "cable", note: "constant tension through the rep" },
    { key: "dumbbell", label: "dumbbell", note: "per-hand, allows supination" },
  ],
  "standing-db-curl": [
    { key: "supinating", label: "supinating", note: "twist up — full biceps" },
    { key: "hammer", label: "hammer", note: "neutral — brachialis + forearm" },
    { key: "cross", label: "cross-body", note: "brachialis emphasis" },
  ],
  "pressdown": [
    { key: "bar", label: "straight bar", note: "stable, heaviest" },
    { key: "rope", label: "rope", note: "hands separate at lockout — more long head" },
    { key: "vbar", label: "V-bar", note: "bar line, wrist-friendly" },
    { key: "cuff", label: "cuff/single", note: "one arm, strict isolation" },
  ],
  "overhead-rope-extension": [
    { key: "rope", label: "rope", note: "hands apart at top — long head" },
    { key: "bar", label: "bar", note: "fixed grip, heavier" },
    { key: "cuff", label: "cuff single-arm", note: "unilateral, crossface option" },
  ],
  "single-arm-pressdown": [
    { key: "overhand", label: "overhand", note: "lateral head emphasis" },
    { key: "underhand", label: "underhand", note: "medial head emphasis" },
    { key: "crossface", label: "crossface", note: "long head — arm across body" },
  ],
  "seated-cable-row": [
    { key: "vbar", label: "V-bar", note: "lats + squeeze" },
    { key: "wide", label: "wide bar", note: "upper back, rear delts" },
    { key: "single", label: "single arm", note: "unilateral, more ROM" },
  ],
  "cable-lateral-raise": [
    { key: "standard", label: "standard", note: "tension at bottom — better SFR than DB" },
    { key: "cuff", label: "cuffed", note: "on the wrist — pure delt, no grip limit" },
    { key: "lean", label: "lean-away", note: "stretched position bias" },
    { key: "crossbody", label: "crossbody", note: "cable across body — deep stretch" },
  ],
  "machine-lateral-raise": [
    { key: "standard", label: "seated", note: "fixed path — pure side delt" },
    { key: "partial", label: "lengthened partials", note: "bottom-half reps — stretch bias" },
  ],
  "db-lateral-raise": [
    { key: "standard", label: "standard", note: "classic — slack at bottom" },
    { key: "lean", label: "lean on bench", note: "arm hangs free — stretch bias" },
    { key: "partial", label: "lengthened partials", note: "bottom half only" },
  ],
  "barbell-bench-press": [
    { key: "medium", label: "medium grip", note: "balanced pec+triceps" },
    { key: "wide", label: "wide grip", note: "more pec, less triceps, shorter ROM" },
    { key: "close", label: "close grip", note: "more triceps" },
  ],
  "pull-up": [
    { key: "overhand", label: "overhand", note: "lats + teres, hardest" },
    { key: "neutral", label: "neutral", note: "easiest on shoulders, brachialis" },
    { key: "chin", label: "underhand", note: "biceps assist — usually strongest" },
  ],
  "leg-extension": [
    { key: "neutral", label: "toes straight", note: "even quad emphasis" },
    { key: "out", label: "toes out", note: "more inner quad (VMO/teardrop)" },
    { key: "in", label: "toes in", note: "more outer quad (vastus lateralis)" },
    { key: "single", label: "single leg", note: "unilateral — exposes imbalances" },
  ],
  "leg-press": [
    { key: "mid", label: "feet mid", note: "balanced quad+glute" },
    { key: "high", label: "feet high", note: "glutes + hamstrings" },
    { key: "low", label: "feet low", note: "more quads, more knee stress" },
    { key: "wide", label: "feet wide", note: "adductors + glutes" },
    { key: "narrow", label: "feet narrow", note: "outer quad sweep" },
  ],
  "back-squat": [
    { key: "high-bar", label: "high bar", note: "upright torso, quad-dominant" },
    { key: "low-bar", label: "low bar", note: "hip hinge, posterior chain — usually heaviest" },
    { key: "heels", label: "heels elevated", note: "quad bias, deeper knees" },
  ],
  "leg-press-wide": [
    { key: "high", label: "feet high", note: "glutes + hamstrings" },
    { key: "mid", label: "feet mid", note: "balanced" },
    { key: "low", label: "feet low", note: "more quads" },
  ],
  "single-leg-press": [
    { key: "mid", label: "foot mid", note: "balanced" },
    { key: "high", label: "foot high", note: "glute bias" },
    { key: "low", label: "foot low", note: "quad bias" },
  ],
  "smith-calf-raise": [
    { key: "neutral", label: "toes straight", note: "even calf" },
    { key: "out", label: "toes out", note: "inner head (medial gastroc)" },
    { key: "in", label: "toes in", note: "outer head (lateral gastroc)" },
  ],
  "standing-calf-raise": [
    { key: "neutral", label: "toes straight", note: "even calf" },
    { key: "out", label: "toes out", note: "inner head" },
    { key: "in", label: "toes in", note: "outer head" },
  ],
  "seated-calf-raise": [
    { key: "neutral", label: "toes straight", note: "even soleus" },
    { key: "out", label: "toes out", note: "inner soleus" },
    { key: "in", label: "toes in", note: "outer soleus" },
  ],
  "skullcrusher": [
    { key: "ez", label: "EZ bar", note: "angled grip — wrist-friendly" },
    { key: "barbell", label: "barbell", note: "straight bar, heaviest" },
    { key: "dumbbell", label: "dumbbells", note: "independent arms" },
    { key: "cable", label: "cable", note: "tension at top, no rest point" },
  ],
  "two-arm-db-overhead": [
    { key: "both", label: "two hands one DB", note: "heaviest load" },
    { key: "single", label: "single arm", note: "unilateral, strict" },
    { key: "cable", label: "cable low pulley", note: "constant tension overhead" },
  ],
  "cable-kickback": [
    { key: "cuff", label: "cuff", note: "ankle strap on wrist — no grip limit" },
    { key: "handle", label: "handle", note: "standard single handle" },
    { key: "db", label: "dumbbell", note: "no cable needed" },
  ],
  "cuff-kickback": [
    { key: "cuff", label: "cuff", note: "ankle strap — pure triceps" },
    { key: "handle", label: "handle", note: "single handle grip" },
  ],
  "neutral-grip-pulldown": [
    { key: "wide", label: "wide overhand", note: "lats + teres major" },
    { key: "neutral", label: "neutral V-bar", note: "stretch-heavy lat path" },
    { key: "underhand", label: "underhand", note: "biceps assist, lower lats" },
    { key: "single", label: "single arm", note: "unilateral, full range" },
  ],
  "wide-grip-pulldown": [
    { key: "wide", label: "wide overhand", note: "lats + teres" },
    { key: "underhand", label: "wide underhand", note: "lower lats + biceps" },
    { key: "close", label: "close grip", note: "more elbow flexion + lower lats" },
    { key: "vbar", label: "V-grip", note: "neutral wrists, strong mid-lat line" },
  ],
  "chest-supported-row": [
    { key: "wide-overhand", label: "wide overhand", note: "upper back + rear delts" },
    { key: "neutral", label: "neutral handles", note: "balanced mid-back and lats" },
    { key: "close-underhand", label: "close underhand", note: "lower lats + biceps" },
    { key: "elbows-out", label: "elbows out", note: "more rear delt + upper back" },
  ],
  "rope-face-pull": [
    { key: "rope", label: "rope", note: "ends pulled apart — rear delt + rotation" },
    { key: "forehead", label: "to forehead", note: "rear delts, less rotation" },
    { key: "er", label: "with rotation", note: "external rotate at end — rotator cuff" },
  ],
  "dumbbell-flye": [
    { key: "flat", label: "flat bench", note: "mid pec stretch" },
    { key: "incline", label: "incline", note: "upper pec" },
    { key: "deep", label: "deep stretch", note: "slight decline — max lengthened" },
  ],
  "cable-flye": [
    { key: "mid", label: "mid height", note: "mid pec" },
    { key: "low-high", label: "low→high", note: "upper pec line" },
    { key: "high-low", label: "high→low", note: "lower pec line" },
  ],
  "ab-wheel": [
    { key: "knees", label: "from knees", note: "standard" },
    { key: "standing", label: "standing", note: "elite — full anti-extension" },
    { key: "ramp", label: "to ramp", note: "reduced ROM while building" },
  ],
  "rkc-plank": [
    { key: "elbows", label: "elbows", note: "standard anti-extension" },
    { key: "side", label: "side", note: "obliques + QL" },
    { key: "rkc", label: "RKC hardstyle", note: "max tension, short holds" },
  ],
  "wrist-curl": [
    { key: "palms-up", label: "palms up", note: "flexors" },
    { key: "palms-down", label: "palms down", note: "extensors" },
    { key: "behind-back", label: "behind back", note: "long-range flexor stretch" },
  ],
  "hanging-leg-raise": [
    { key: "straight", label: "straight legs", note: "harder, hip flexors + abs" },
    { key: "knees", label: "bent knees", note: "easier entry" },
    { key: "toes", label: "toes to bar", note: "full ROM, advanced" },
    { key: "twist", label: "with twist", note: "obliques" },
  ],
  "rdl": [
    { key: "barbell", label: "barbell", note: "heaviest" },
    { key: "dumbbell", label: "dumbbells", note: "independent hands" },
    { key: "single", label: "single leg", note: "unilateral + balance" },
  ],
  "hip-thrust": [
    { key: "barbell", label: "barbell", note: "heaviest glute load" },
    { key: "single", label: "single leg", note: "unilateral" },
    { key: "feet-fwd", label: "feet forward", note: "hamstring bias" },
    { key: "wide", label: "feet wide", note: "glute med bias" },
  ],
  "incline-dumbbell-press": [
    { key: "15", label: "15°", note: "mostly flat-pec feel, some upper" },
    { key: "30", label: "30°", note: "best upper-pec line (Rodríguez-Ridao 2020)" },
    { key: "45", label: "45°", note: "front delts take over" },
  ],
  "incline-db-45": [
    { key: "15", label: "15°", note: "mostly flat-pec feel" },
    { key: "30", label: "30°", note: "best upper-pec line" },
    { key: "45", label: "45°", note: "front delts take over" },
  ],
};

// Unilateral-capable exercises — each set can be tagged left/right/both.
// One-hand load ≈ 55–60% of the two-hand weight (bilateral deficit ~18–20%).
export const HANDED = new Set([
  "bayesian-curl", "preacher-curl", "preacher-hammer-curl", "ez-preacher-curl",
  "machine-preacher-curl", "concentration-curl", "standing-db-curl",
  "incline-curl-30", "incline-curl-60", "hammer-curl", "zottman-curl",
  "behind-back-db-curl", "single-arm-pressdown", "cable-kickback",
  "cuff-kickback", "skullcrusher", "two-arm-db-overhead",
  "db-lateral-raise", "cable-lateral-raise", "db-front-raise",
  "wrist-curl", "db-wrist-curl", "standing-leg-curl", "leg-extension",
  "leg-curl-toes-in", "leg-curl-toes-out", "single-leg-press",
  "single-arm-cable-rear-flye", "chest-supported-row", "bent-dumbbell-row",
  "kroc-row", "seated-cable-row", "renegade-row", "incline-db-overhead-ext",
  "dips", "incline-db-press", "dumbbell-press", "cable-curl", "bb-curl",
]);

// Estimate a target lift's e1RM from the user's logged bests on related lifts.
// Parents are tried in order — the first logged one wins (they're ordered by
// confidence). When the user has logged BOTH lifts of a pair, their personal
// ratio blends 50/50 with the population default (one session is noisy data).
// Returns { e1, from } or null when nothing is logged yet.
export function estimateE1(
  slug: string,
  bestBySlug: Map<string, number>,
  lastAt?: Map<string, number>, // slug → ms timestamp of last logged session
): { e1: number; from: string; conf: number; why: string; personal?: boolean } | null {
  const link = RATIOS[slug];
  if (!link) return null;
  const myE = bestBySlug.get(slug);
  const now = Date.now();
  // Recency decay — strength estimates fade: full weight <4wk, half at ~12wk.
  const decay = (slugKey: string) => {
    const at = lastAt?.get(slugKey);
    if (!at) return 0.6; // unknown age → cautious
    const weeks = (now - at) / 604800000;
    return Math.max(0.4, Math.exp(-weeks / 12));
  };
  for (const parent of link.from) {
    const pe = bestBySlug.get(parent);
    if (pe && pe > 0) {
      // Calibrate only from siblings sharing this parent family. The old
      // implementation used the first pair in the entire table, so a curl
      // ratio could silently alter squat or deadlift estimates.
      const siblingAdjustments = Object.entries(RATIOS)
        .filter(([, sibling]) => sibling.from.includes(parent))
        .map(([siblingSlug, sibling]) => {
          const siblingE = bestBySlug.get(siblingSlug);
          return siblingE && siblingE > 0 && sibling.r > 0
            ? { adjustment: (siblingE / pe) / sibling.r, weight: sibling.conf }
            : null;
        })
        .filter((x): x is { adjustment: number; weight: number } => x !== null)
        .filter((x) => x.adjustment >= 0.7 && x.adjustment <= 1.4);
      const familyAdj = siblingAdjustments.length
        ? Math.max(0.7, Math.min(1.4, siblingAdjustments.reduce((sum, x) => sum + x.adjustment * x.weight, 0) / siblingAdjustments.reduce((sum, x) => sum + x.weight, 0)))
        : 1;
      let r = link.r * familyAdj, personal = familyAdj !== 1;
      if (myE && myE > 0) {
        r = (myE / pe) * 0.5 + r * 0.5;
        personal = true;
      }
      return { e1: Math.round(pe * r * decay(parent) * 10) / 10, from: parent, conf: link.conf, why: link.why, personal };
    }
  }
  return null;
}
