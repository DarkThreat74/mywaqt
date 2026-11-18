/**
 * Variation → media slug. Grip/stance/attachment variations whose correct
 * visual is a DIFFERENT catalog exercise — ExerciseMedia swaps to that
 * exercise's art/GIF when the variation chip is selected.
 *
 * Only confident, semantically-correct remaps are listed: when a variation
 * has no distinct exercise slug (bench angles, foot heights), it falls back
 * to the parent exercise's media — a slightly-off-angle real pose beats a
 * wrong exercise.
 *
 * Key format: "<exercise slug>:<variation key>".
 */
export const VARIATION_MEDIA: Record<string, string> = {
  // leg curls — toe position has real catalog entries
  "standing-leg-curl:out": "leg-curl-toes-out", "standing-leg-curl:in": "leg-curl-toes-in",
  "lying-leg-curl:out": "leg-curl-toes-out", "lying-leg-curl:in": "leg-curl-toes-in",
  // biceps
  "ez-bar-curl:barbell": "barbell-curl", "ez-bar-curl:cable": "cable-curl",
  "ez-bar-curl:dumbbell": "biceps-curls-with-dumbbell",
  "standing-db-curl:hammer": "hammer-curl", "standing-db-curl:cross": "cross-body-hammer",
  // triceps
  "pressdown:rope": "rope-pressdown", "pressdown:vbar": "vbar-pressdown",
  "pressdown:cuff": "cuff-pressdown",
  "overhead-rope-extension:bar": "overhead-bar-extension",
  "overhead-rope-extension:cuff": "overhead-cable-extension",
  "single-arm-pressdown:underhand": "reverse-grip-pressdown",
  "skullcrusher:barbell": "behind-head-skullcrusher",
  "skullcrusher:dumbbell": "skullcrusher-dumbbells",
  "skullcrusher:cable": "low-cable-triceps-extension",
  "two-arm-db-overhead:single": "db-overhead-extension",
  "two-arm-db-overhead:cable": "low-cable-triceps-extension",
  "cable-kickback:cuff": "cuff-kickback", "cable-kickback:db": "db-kickback",
  "cuff-kickback:handle": "single-arm-cable-kickback",
  // back
  "seated-cable-row:single": "single-arm-cable-row",
  "neutral-grip-pulldown:wide": "wide-grip-pulldown",
  "neutral-grip-pulldown:underhand": "underhand-pulldown",
  "neutral-grip-pulldown:single": "single-arm-pulldown",
  "wide-grip-pulldown:underhand": "underhand-pulldown",
  "wide-grip-pulldown:close": "close-grip-front-lat-pulldown",
  "wide-grip-pulldown:vbar": "vbar-pulldown",
  "pull-up:neutral": "neutral-grip-pullup", "pull-up:chin": "chin-up",
  // chest / delts
  "barbell-bench-press:wide": "wide-grip-bench", "barbell-bench-press:close": "close-grip-bench",
  "cable-lateral-raise:cuff": "cuffed-lateral-raise",
  "cable-lateral-raise:lean": "leanin-lateral-raise",
  "cable-lateral-raise:crossbody": "behind-the-back-cable-lateral-raise",
  "machine-lateral-raise:partial": "lengthened-partial-lateral",
  "db-lateral-raise:partial": "lengthened-partial-lateral",
  "rope-face-pull:forehead": "face-pull-to-forehead", "rope-face-pull:er": "face-pull-er",
  "dumbbell-flye:incline": "incline-dumbbell-fly",
  "cable-flye:low-high": "low-cable-crossover",
  // legs
  "leg-extension:single": "single-leg-extension",
  "leg-press:wide": "leg-press-wide", "leg-press:narrow": "narrow-stance-leg-press",
  "back-squat:low-bar": "low-bar-squat", "back-squat:heels": "cyclist-squat",
  "smith-calf-raise:out": "calf-raise-toes-out", "smith-calf-raise:in": "calf-raise-toes-in",
  "standing-calf-raise:out": "calf-raise-toes-out", "standing-calf-raise:in": "calf-raise-toes-in",
  "seated-calf-raise:out": "calf-raise-toes-out", "seated-calf-raise:in": "calf-raise-toes-in",
  "rdl:dumbbell": "dumbbell-romanian-deadlift", "rdl:single": "single-leg-rdl",
  "hip-thrust:single": "single-leg-hip-thrust",
  // core / grip
  "ab-wheel:standing": "standing-ab-wheel",
  "rkc-plank:side": "side-plank",
  "wrist-curl:palms-down": "seated-palms-down-barbell-wrist-curl",
  "wrist-curl:behind-back": "standing-palms-up-barbell-behind-the-back-wrist-curl",
  "hanging-leg-raise:knees": "hanging-knee-raise",
  "hanging-leg-raise:toes": "toes-to-bar",
};
