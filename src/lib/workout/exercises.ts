/**
 * Curated exercise bank — evidence-ranked (Jeff Nippard tier criteria:
 * lengthened-position tension + feels-good + progression; abs tiers from
 * Jeremy Ethier's EMG-tested list). `img` embeds a live technique GIF from
 * MuscleWiki's CDN; cards fall back to the cue text if it 404s.
 * tier: S > A > B > C (omit = solid unranked pick).
 */
export interface Exercise {
  slug: string;
  name: string;
  muscle: string;        // fine-grained muscle key
  head?: string;         // sub-target: long_head|short_head|brachialis|upper|mid|lower|isometric|inner|outer|medial_head|lateral_head…
  pattern: string;       // movement pattern
  equip: string;         // barbell|dumbbell|cable|machine|smith|bodyweight|band
  compound?: boolean;
  tier?: "S" | "A" | "B" | "C" | "D" | "F";
  cue: string;           // 1-line setup/execution cue
  howto?: string;        // detailed setup + execution (2-3 sentences)
  pros?: string;         // what makes it good — mechanism
  cons?: string;         // what makes it worse than alternatives
  source?: string;       // expert/study attribution
  img: string;
}

// muscle → parent group (two-level filter: group → head)
export const MUSCLE_GROUP: Record<string, string> = {
  chest: "chest", upper_chest: "chest", lower_chest: "chest",
  lats: "back", mid_back: "back", rear_delts: "back", erectors: "back", upper_traps: "back", lower_traps: "back",
  front_delts: "shoulders", side_delts: "shoulders",
  biceps: "biceps", triceps: "triceps", forearms: "forearms", grip: "forearms", fingers: "forearms",
  neck: "neck",
  quads: "legs", hamstrings: "legs", glutes: "legs", glute_med: "legs", gastroc: "legs", soleus: "legs",
  upper_abs: "abs", lower_abs: "abs", abs: "abs", obliques: "abs",
};

export const GROUPS: { key: string; label: string; heads: { key: string; label: string }[] }[] = [
  { key: "chest", label: "Chest", heads: [
    { key: "upper", label: "Upper (clavicular)" }, { key: "mid", label: "Mid" },
    { key: "lower", label: "Lower" }, { key: "isometric", label: "Isometric" }] },
  { key: "back", label: "Back", heads: [
    { key: "lats", label: "Lats" }, { key: "mid_back", label: "Mid traps / rhomboids" },
    { key: "rear_delts", label: "Rear delts" }, { key: "erectors", label: "Erectors" },
    { key: "upper_traps", label: "Upper traps" }, { key: "lower_traps", label: "Lower traps" }] },
  { key: "shoulders", label: "Shoulders", heads: [
    { key: "front_delts", label: "Front" }, { key: "side_delts", label: "Side" }] },
  { key: "biceps", label: "Biceps", heads: [
    { key: "long_head", label: "Long head" }, { key: "short_head", label: "Short head" }, { key: "brachialis", label: "Brachialis" }] },
  { key: "triceps", label: "Triceps", heads: [
    { key: "long_head", label: "Long head" }, { key: "lateral_head", label: "Lateral head" }, { key: "medial_head", label: "Medial head" }] },
  { key: "forearms", label: "Forearms", heads: [
    { key: "flexors", label: "Flexors" }, { key: "extensors", label: "Extensors" },
    { key: "grip", label: "Grip" }, { key: "fingers", label: "Fingers" }] },
  { key: "legs", label: "Legs", heads: [
    { key: "quads", label: "Quads" }, { key: "hamstrings", label: "Hamstrings" },
    { key: "glutes", label: "Glutes" }, { key: "glute_med", label: "Glute med" },
    { key: "gastroc", label: "Calves (gastroc)" }, { key: "soleus", label: "Calves (soleus)" }] },
  { key: "abs", label: "Abs", heads: [
    { key: "upper_abs", label: "Upper" }, { key: "lower_abs", label: "Lower" },
    { key: "obliques", label: "Obliques" }, { key: "all_abs", label: "Whole core" }] },
  { key: "neck", label: "Neck", heads: [
    { key: "front", label: "Front" }, { key: "back", label: "Back" }, { key: "side", label: "Sides" }, { key: "rotation", label: "Rotation" }] },
];

// slug → head tag (sub-target). Only heads that diverge from the muscle key.
export const HEAD_OF: Record<string, string> = {
  // chest → upper/mid/lower
  "incline-dumbbell-press": "upper", "smith-incline-press": "upper",
  "dips": "lower", "decline-bench-press": "lower",
  "machine-chest-press": "mid", "barbell-bench-press": "mid", "pec-deck": "mid",
  "cable-flye": "mid", "cable-press-around": "mid", "deficit-pushup": "mid",
  // biceps → long_head (arm behind torso) / short_head (arm in front) / brachialis
  "bayesian-curl": "long_head", "incline-curl": "long_head",
  "preacher-curl": "short_head", "machine-preacher-curl": "short_head",
  "ez-bar-curl": "short_head", "hammer-curl": "brachialis", "preacher-hammer-curl": "brachialis",
  "reverse-curl": "brachialis", "zottman-curl": "brachialis", "fat-grip-curl": "brachialis",
  "concentration-curl": "short_head", "spider-curl": "short_head",
  "drag-curl": "long_head", "waiter-curl": "short_head",
  "cable-curl": "short_head", "machine-curl": "short_head", "twenty-ones": "short_head",
  "cross-body-hammer": "brachialis", "cable-rope-hammer": "brachialis", "chin-up": "short_head",
  // triceps → long_head (overhead) / lateral (pushdown) / medial (press)
  "overhead-cable-extension": "long_head", "overhead-rope-extension": "long_head",
  "katana-extension": "long_head", "db-overhead-extension": "long_head", "skullcrusher": "long_head",
  "pressdown": "lateral_head", "cable-kickback": "lateral_head",
  "close-grip-bench": "medial_head", "jm-press": "medial_head",
  // forearms → flexors/extensors/grip/fingers
  "wrist-curl": "flexors", "cable-wrist-curl": "flexors", "reverse-wrist-curl": "extensors",
  "dead-hang": "grip", "towel-pullup": "grip", "farmers-carry": "grip",
  "plate-pinch": "fingers", "rice-bucket": "fingers",
  // legs
  "hack-squat": "quads", "pendulum-squat": "quads", "back-squat": "quads", "smith-squat": "quads",
  "bulgarian-split-squat": "quads", "leg-extension": "quads", "front-squat": "quads",
  "leg-press": "quads", "reverse-nordic": "quads", "goblet-squat": "quads",
  "seated-leg-curl": "hamstrings", "lying-leg-curl": "hamstrings", "good-morning-ham": "hamstrings",
  "rdl-hamstrings": "hamstrings", "nordic-curl": "hamstrings", "glute-ham-raise": "hamstrings",
  "walking-lunge": "glutes", "hip-thrust": "glutes", "ffe-lunge": "glutes",
  "back-extension-glute": "glutes", "cable-pull-through": "glutes",
  "hip-abduction-machine": "glute_med",
  "standing-calf-raise": "gastroc", "leg-press-calf": "gastroc", "single-leg-calf": "gastroc",
  "seated-calf-raise": "soleus",
  // back heads = muscle keys already
  // abs
  "kneeling-cable-crunch": "upper_abs", "lat-pulldown-crunch": "upper_abs", "ab-mat-crunch": "upper_abs", "machine-crunch": "upper_abs",
  "reverse-crunch-abmat": "lower_abs", "captains-chair-raise": "lower_abs", "garhammer-raise": "lower_abs",
  "stabilized-hanging-raise": "lower_abs", "banded-reverse-crunch": "lower_abs",
  "janda-situp": "all_abs", "dead-bug": "all_abs", "ab-wheel": "all_abs",
  "cable-woodchop": "obliques", "side-crunch": "obliques", "pallof-press": "obliques",
  // shoulders
  "machine-shoulder-press": "front_delts", "seated-db-press": "front_delts", "arnold-press": "front_delts",
  "cable-lateral-raise": "side_delts", "cable-y-raise": "side_delts", "cuffed-lateral-raise": "side_delts",
  "leanin-lateral-raise": "side_delts", "machine-lateral-raise": "side_delts",
  // neck
  "neck-flexion": "front", "neck-extension": "back", "neck-lateral": "side", "neck-rotation": "rotation",
};

const mw = (slug: string) => `https://cdn.musclewiki.org/media/uploads/male/${slug}.gif`;

const e = (
  slug: string, name: string, muscle: string, pattern: string, equip: string,
  tier: "S" | "A" | "B" | "C" | "D" | "F" | undefined, cue: string, compound = false,
  detail?: Pick<Exercise, "howto" | "pros" | "cons" | "source">,
): Exercise => ({ slug, name, muscle, pattern, equip, tier, cue, compound, img: mw(slug), ...detail });

export const EXERCISES: Exercise[] = [
  // ── CHEST ──
  e("machine-chest-press", "Machine Chest Press", "chest", "horizontal_push", "machine", "S", "Handles at mid-chest, full stretch at the bottom, drive through the palm.", true),
  e("cable-flye", "Seated Cable Flye", "chest", "horizontal_flye", "cable", "S", "Bench between towers, elbows soft, sweep hands together at sternum height."),
  e("incline-dumbbell-press", "Incline Dumbbell Press", "upper_chest", "incline_push", "dumbbell", "A", "30° bench, dumbbells at clavicle height, press slightly inward.", true),
  e("barbell-bench-press", "Barbell Bench Press", "chest", "horizontal_push", "barbell", "A", "Retract shoulder blades, touch lower sternum.", true),
  e("dips", "Dips", "lower_chest", "vertical_push", "bodyweight", "A", "Lean ~30° forward, elbows track back, stretch deep.", true),
  e("pec-deck", "Pec Deck Fly", "chest", "horizontal_flye", "machine", "A", "Upper arms at shoulder height, squeeze at the front, slow negative."),
  e("deficit-pushup", "Deficit Push-up", "chest", "horizontal_push", "bodyweight", "A", "Hands on plates, chest below hand level for a deeper stretch.", true),
  e("smith-incline-press", "Smith Incline Press", "upper_chest", "incline_push", "smith", "A", "Bench 30°, bar path vertical through the clavicle.", true),
  e("cable-press-around", "Cable Press-Around", "chest", "horizontal_flye", "cable", "A", "Palm-to-palm press forward then open — inner chest stays loaded."),
  e("decline-bench-press", "Decline Bench Press", "lower_chest", "horizontal_push", "barbell", "B", "Legs hooked, slight decline, bar to lower chest.", true),
  // ── BACK: LATS ──
  e("wide-grip-pulldown", "Wide-Grip Pulldown", "lats", "vertical_pull", "cable", "S", "Drive elbows down and out, slight lean back, full stretch at the top.", true),
  e("neutral-grip-pulldown", "Neutral-Grip Pulldown", "lats", "vertical_pull", "cable", "S", "Shoulders down first, elbows to the ribs, control the release.", true),
  e("half-kneeling-pulldown", "Half-Kneeling Single-Arm Pulldown", "lats", "vertical_pull", "cable", "S", "Pull elbow to the hip pocket, reach fully overhead between reps."),
  e("pull-up", "Pull-up", "lats", "vertical_pull", "bodyweight", "A", "Chest to bar, dead-hang stretch each rep, no kip.", true),
  e("cable-pullover", "Cable Pullover", "lats", "pullover", "cable", "A", "Slight bend, arms nearly straight, sweep to the hips — pure lat stretch."),
  e("db-pullover", "Dumbbell Pullover", "lats", "pullover", "dumbbell", "A", "Across the bench, lower behind the head until the lats stretch fully."),
  e("crossbody-lat-pull", "Crossbody Lat Pull-Around", "lats", "vertical_pull", "cable", "A", "Sweep down and across — isolates the lower lat sweep."),
  // ── BACK: MID-TRAPS/RHOMBOIDS ──
  e("chest-supported-row", "Chest-Supported Row", "mid_back", "horizontal_pull", "dumbbell", "S", "Chest glued to pad, elbows back at 45°, squeeze shoulder blades.", true),
  e("seated-cable-row", "Seated Cable Row (wide)", "mid_back", "horizontal_pull", "cable", "S", "Wide handle, pull to the ribs, sit tall — no rocking.", true),
  e("meadows-row", "Meadows Row", "mid_back", "horizontal_pull", "barbell", "S", "Landmine, staggered stance, elbow driven back — big mid-back stretch.", true),
  e("deficit-pendlay-row", "Deficit Pendlay Row", "mid_back", "horizontal_pull", "barbell", "A", "Stand on plates, bar off the floor each rep, torso near parallel.", true),
  e("bent-dumbbell-row", "Bent-Over Dumbbell Row", "mid_back", "horizontal_pull", "dumbbell", "A", "Flat back ~45°, elbow to the hip, full extension at the bottom.", true),
  e("kroc-row", "Kroc Row", "mid_back", "horizontal_pull", "dumbbell", "A", "Brace on the bench, heavy dumbbell, controlled high reps.", true),
  e("tbar-row", "T-Bar Row", "mid_back", "horizontal_pull", "machine", "A", "Pad supported, pull to the chest — heavy mid-back loading.", true),
  // ── REAR DELTS ──
  e("reverse-pec-deck", "Reverse Pec Deck", "rear_delts", "rear_flye", "machine", "S", "Chest on pad, elbows back not hands back."),
  e("reverse-cable-crossover", "Reverse Cable Crossover", "rear_delts", "rear_flye", "cable", "S", "Cables crossed at shoulder height, open wide with soft elbows."),
  e("rope-face-pull", "Underhand Face Pull", "rear_delts", "rear_flye", "cable", "A", "Underhand grip biases rear delts — pull to the eyes, rotate out."),
  e("seated-face-pull", "Seated Rope Face Pull", "rear_delts", "rear_flye", "cable", "A", "Locked torso, rope to the nose, spread at the end."),
  // ── ERECTORS / LOWER BACK ──
  e("rdl", "Romanian Deadlift", "erectors", "hinge", "barbell", "S", "Hips back, bar skims the legs — hamstring + erector stretch.", true),
  e("back-extension-45", "45° Back Extension", "erectors", "spinal_extension", "bodyweight", "S", "Round down, squeeze glutes to lift; load a plate for strength."),
  e("good-morning", "Good Morning", "erectors", "hinge", "barbell", "S", "Bar on upper traps, knees soft, hinge until hamstrings take over.", true),
  e("deadlift", "Conventional Deadlift", "erectors", "hinge", "barbell", "A", "Bar over mid-foot, push the floor away, hips+shoulders rise together.", true),
  e("farmers-carry", "Farmer's Carry", "erectors", "carry", "dumbbell", undefined, "Tall chest, heavy bells, short steps — erectors, traps, grip.", true),
  // ── SHOULDERS ──
  e("cable-lateral-raise", "Cable Lateral Raise", "side_delts", "lateral_raise", "cable", "S", "Cable behind the body, lead with the elbow to shoulder height."),
  e("cable-y-raise", "Cable Y-Raise", "side_delts", "lateral_raise", "cable", "S", "Cross-body cable, 30° diagonal — keeps tension at the top."),
  e("cuffed-lateral-raise", "Behind-the-Back Cuffed Raise", "side_delts", "lateral_raise", "cable", "S", "Cuff on wrist (no grip), cable behind — constant tension."),
  e("leanin-lateral-raise", "Lean-In Dumbbell Lateral Raise", "side_delts", "lateral_raise", "dumbbell", "A", "Hold a post, lean away — lengthens the top range."),
  e("machine-lateral-raise", "Machine Lateral Raise", "side_delts", "lateral_raise", "machine", "A", "Elbows on pads, raise to shoulder height, slow down."),
  e("machine-shoulder-press", "Machine Shoulder Press", "front_delts", "vertical_push", "machine", "A", "Handles at ear height, press straight up.", true),
  e("seated-db-press", "Seated Dumbbell Overhead Press", "front_delts", "vertical_push", "dumbbell", "A", "Bench ~80°, dumbbells at the ears, slight arc.", true),
  e("arnold-press", "Arnold Press", "front_delts", "vertical_push", "dumbbell", undefined, "Start palms facing you, rotate as you press.", true),
  // ── TRAPS ──
  e("barbell-shrug", "Barbell Shrug", "upper_traps", "shrug", "barbell", undefined, "Roll shoulders toward the ears, hold a beat — no circles."),
  e("cable-shrug", "Cable Shrug", "upper_traps", "shrug", "cable", undefined, "Face the stack, shrug up and slightly back."),
  e("prone-y-raise", "Prone Y-Raise", "lower_traps", "rear_flye", "dumbbell", "A", "Face-down incline, thumbs-up Y overhead — lights up lower traps."),
  // ── BICEPS ──
  e("bayesian-curl", "Face-Away Bayesian Curl", "biceps", "elbow_flexion", "cable", "S", "Face away, arm behind the body — maximum biceps stretch."),
  e("preacher-curl", "Dumbbell Preacher Curl", "biceps", "elbow_flexion", "dumbbell", "S", "Arm flat on the pad, lower fully, no wrist curl at top."),
  e("machine-preacher-curl", "Machine Preacher Curl", "biceps", "elbow_flexion", "machine", "S", "Full range, upper arm pinned to the pad."),
  e("preacher-hammer-curl", "Preacher Hammer Curl", "biceps", "elbow_flexion", "dumbbell", "S", "Neutral grip on the pad — brachialis + long head."),
  e("incline-curl", "Incline Dumbbell Curl", "biceps", "elbow_flexion", "dumbbell", "A", "Bench 45°, arms hang behind the torso — strict lengthened curl."),
  e("ez-bar-curl", "EZ-Bar Curl", "biceps", "elbow_flexion", "barbell", "A", "Elbows pinned at the ribs, no hip swing.", true),
  e("hammer-curl", "Hammer Curl", "biceps", "elbow_flexion", "dumbbell", "A", "Neutral grip, alternate — brachialis + forearm thickness."),
  e("reverse-curl", "Reverse Curl", "forearms", "elbow_flexion", "barbell", undefined, "Palms-down curl — brachioradialis and wrist extensors."),
  e("zottman-curl", "Zottman Curl", "biceps", "elbow_flexion", "dumbbell", undefined, "Up palms-forward, down palms-down."),
  e("concentration-curl", "Concentration Curl", "biceps", "elbow_flexion", "dumbbell", "C", "Highest activation in old EMG studies but short-length bias — braced on inner thigh, no swing."),
  e("spider-curl", "Spider Curl", "biceps", "elbow_flexion", "dumbbell", "B", "Face-down incline — short-head pump, momentum removed."),
  e("drag-curl", "Drag Curl", "biceps", "elbow_flexion", "barbell", "C", "Elbows travel back, bar drags up the torso — front-delt takeover risk."),
  e("cable-curl", "Standing Cable Curl", "biceps", "elbow_flexion", "cable", "A", "Even tension through the whole arc, easy to load."),
  e("machine-curl", "Machine Curl", "biceps", "elbow_flexion", "machine", "A", "Stability + matched resistance curve — take it to failure safely."),
  e("cross-body-hammer", "Cross-Body Hammer Curl", "biceps", "elbow_flexion", "dumbbell", "B", "Curl across to the opposite shoulder — brachialis bias."),
  e("waiter-curl", "Waiter Curl", "biceps", "elbow_flexion", "dumbbell", "C", "Dumbbell held like a tray — constant supination, peak-focus."),
  e("twenty-ones", "21s (lengthened-first)", "biceps", "elbow_flexion", "barbell", "A", "Top-half ×7 → bottom-half ×7 → full ×7 — stretch-position partials first (Nippard order)."),
  e("chin-up", "Chin-up", "biceps", "vertical_pull", "bodyweight", "B", "Underhand pull-up — heavy biceps load, lat sharing.", true),
  e("cable-rope-hammer", "Cable Rope Hammer Curl", "biceps", "elbow_flexion", "cable", "B", "Rope splits at the top — constant-tension brachialis work."),
  // ── TRICEPS ──
  e("overhead-cable-extension", "Overhead Cable Triceps Extension", "triceps", "elbow_extension", "cable", "S", "Lean on the bench, arm reaches behind the head — long-head stretch."),
  e("skullcrusher", "Barbell Skullcrusher", "triceps", "elbow_extension", "barbell", "S", "Bar just behind the forehead, elbows fixed, full lockout."),
  e("pressdown", "Triceps Pressdown", "triceps", "elbow_extension", "cable", "A", "Elbows pinned, push straight down, squeeze at lockout."),
  e("overhead-rope-extension", "Overhead Rope Extension", "triceps", "elbow_extension", "cable", "A", "Rope lets wrists rotate apart at lockout."),
  e("katana-extension", "Katana Extension", "triceps", "elbow_extension", "cable", "A", "Pull across behind the head — brutal long-head isolation."),
  e("db-overhead-extension", "Single-Arm DB Overhead Extension", "triceps", "elbow_extension", "dumbbell", "A", "Seated, elbow beside the ear, dumbbell behind the neck."),
  e("jm-press", "Smith JM Press", "triceps", "elbow_extension", "smith", "A", "Bar toward the chin, elbows forward — hybrid press/extension.", true),
  e("close-grip-bench", "Close-Grip Bench Press", "triceps", "horizontal_push", "barbell", "A", "Hands shoulder-width, elbows tucked — triceps own the lockout.", true),
  e("cable-kickback", "Cable Kickback", "triceps", "elbow_extension", "cable", "B", "Upper arm parallel, extend fully behind — finish work."),
  // ── QUADS ──
  e("hack-squat", "Hack Squat", "quads", "squat", "machine", "S", "Feet low on the platform, knees track over toes, full depth.", true),
  e("pendulum-squat", "Pendulum Squat", "quads", "squat", "machine", "S", "Hips deep, drive through the whole foot.", true),
  e("back-squat", "Barbell Back Squat", "quads", "squat", "barbell", "S", "Bar on traps, brace, knees out, below parallel.", true),
  e("smith-squat", "Smith Machine Squat", "quads", "squat", "smith", "S", "Feet slightly forward, sit into it — more quad, less stabilization.", true),
  e("bulgarian-split-squat", "Bulgarian Split Squat", "quads", "squat", "dumbbell", "S", "Rear foot elevated, tall torso, deep front-leg stretch.", true),
  e("leg-extension", "Leg Extension", "quads", "knee_extension", "machine", "A", "Only move loading rectus femoris — toes up, slow negative."),
  e("front-squat", "Front Squat", "quads", "squat", "barbell", "A", "Bar on delts, elbows high — vertical quad-dominant squat.", true),
  e("leg-press", "45° Leg Press", "quads", "squat", "machine", "A", "Feet low-medium for quad bias, 90°+ depth.", true),
  e("reverse-nordic", "Reverse Nordic Curl", "quads", "knee_extension", "bodyweight", "A", "Kneel, lean back with hips locked — rectus femoris lengthening."),
  e("goblet-squat", "Goblet Squat", "quads", "squat", "dumbbell", "B", "Bell at the chest, elbows between knees at the bottom.", true),
  // ── HAMSTRINGS ──
  e("seated-leg-curl", "Seated Leg Curl", "hamstrings", "knee_flexion", "machine", "S", "Hips ~90° pre-stretched — ~1.6× growth vs lying. Slow negative."),
  e("good-morning-ham", "Good Morning (ham bias)", "hamstrings", "hinge", "barbell", "S", "Hinge until the hamstring stretch pulls you back.", true),
  e("lying-leg-curl", "Lying Leg Curl", "hamstrings", "knee_flexion", "machine", "A", "Pairs with seated curl — sartorius grows better lying."),
  e("rdl-hamstrings", "Romanian Deadlift (ham bias)", "hamstrings", "hinge", "barbell", "A", "Knees soft, hips back, bar skims shins.", true),
  e("nordic-curl", "Nordic Curl", "hamstrings", "knee_flexion", "bodyweight", "B", "Feet anchored, lower as slowly as possible — eccentric torture."),
  e("glute-ham-raise", "Glute-Ham Raise", "hamstrings", "knee_flexion", "bodyweight", "A", "Controlled descent, curl back up — both heads at once.", true),
  // ── GLUTES ──
  e("walking-lunge", "Walking Lunge", "glutes", "lunge", "dumbbell", "S", "#1 glute builder — long stride, drive through the front heel.", true),
  e("hip-abduction-machine", "Machine Hip Abduction", "glute_med", "abduction", "machine", "S", "#1 upper glutes — lean forward, hold the open position."),
  e("back-extension-glute", "45° Back Extension (glute bias)", "glutes", "hinge", "bodyweight", "S", "Toes out, round upper back, squeeze glutes to rise."),
  e("hip-thrust", "Hip Thrust", "glutes", "hinge", "barbell", "A", "#1 mid glutes — shoulders on bench, chin tucked, full lockout.", true),
  e("ffe-lunge", "Front-Foot-Elevated Lunge", "glutes", "lunge", "smith", "S", "Front foot on a plate — glutes fire from a longer position.", true),
  e("cable-pull-through", "Cable Pull-Through", "glutes", "hinge", "cable", undefined, "Rope between legs, hinge deep, snap hips forward.", true),
  // ── CALVES ──
  e("standing-calf-raise", "Standing Calf Raise", "gastroc", "plantar_flexion", "machine", "A", "Straight knee = gastroc. Full drop, pause, press to tiptoe."),
  e("seated-calf-raise", "Seated Calf Raise", "soleus", "plantar_flexion", "machine", "A", "Bent knee = soleus. Both needed for full calves."),
  e("leg-press-calf", "Leg-Press Calf Raise", "gastroc", "plantar_flexion", "machine", undefined, "Toes on the plate edge, drive through the big toe."),
  e("single-leg-calf", "Single-Leg Calf Raise", "gastroc", "plantar_flexion", "bodyweight", undefined, "Off a step, deep stretch each rep."),
  // ── ABS: UPPER RA ──
  e("kneeling-cable-crunch", "Kneeling Cable Crunch", "upper_abs", "spinal_flexion", "cable", "S", "Face away (EMG S-tier), curl RIBS to pelvis — let the lumbar round."),
  e("lat-pulldown-crunch", "Lat-Pulldown Crunch", "upper_abs", "spinal_flexion", "cable", "S", "EMG S-tier — kneel under the stack, elbows toward knees."),
  e("ab-mat-crunch", "Crunch on Ab Mat", "upper_abs", "spinal_flexion", "bodyweight", "A", "Mat fills the lumbar gap — bigger stretch, exhale and curl."),
  e("machine-crunch", "Machine Crunch", "upper_abs", "spinal_flexion", "machine", undefined, "Curl vertebra by vertebra — load it like any muscle."),
  // ── ABS: LOWER RA (hip-flexor-safe) ──
  e("reverse-crunch-abmat", "Reverse Crunch on Ab Mat", "lower_abs", "pelvic_curl", "bodyweight", "S", "EMG S-tier — curl the PELVIS off the floor toward the ribs."),
  e("captains-chair-raise", "Captain's Chair Raise", "lower_abs", "pelvic_curl", "bodyweight", "A", "Pelvis locked to the pad — posterior tilt at top removes hip flexors."),
  e("garhammer-raise", "Garhammer Raise", "lower_abs", "pelvic_curl", "bodyweight", "S", "Start knees bent — only the pelvic curl at the top matters."),
  e("stabilized-hanging-raise", "Stabilized Hanging Leg Raise", "lower_abs", "pelvic_curl", "bodyweight", "A", "Back on a pad, knees bent, POSTERIOR TILT at the top — or it's all hip flexor."),
  e("janda-situp", "Janda Sit-up", "abs", "spinal_flexion", "bodyweight", "S", "Highest RA / lowest rectus-femoris ever measured — pull heels down to inhibit hip flexors."),
  e("banded-reverse-crunch", "Banded Reverse Crunch", "lower_abs", "pelvic_curl", "band", undefined, "Band around the knees loads the pelvic curl — hip-flexor-safe weight."),
  // ── OBLIQUES ──
  e("cable-woodchop", "Cable Woodchop (high→low)", "obliques", "rotation", "cable", "A", "Rotate the trunk, hips quiet — obliques do the turning."),
  e("side-crunch", "Side Bend / Side Crunch", "obliques", "lateral_flexion", "dumbbell", undefined, "One dumbbell, bend against it, control both ways."),
  e("pallof-press", "Pallof Press", "obliques", "anti_rotation", "cable", "A", "Press out, resist the pull — deep oblique anti-rotation."),
  // ── DEEP CORE ──
  e("dead-bug", "Dead Bug", "abs", "anti_extension", "bodyweight", "C", "Low back pressed to floor, opposite limbs extend — stability, not hypertrophy."),
  e("ab-wheel", "Ab Wheel Rollout", "abs", "anti_extension", "bodyweight", "C", "Roll out only as far as the low back stays flat."),
  // ── FOREARMS / GRIP / FINGERS ──
  e("wrist-curl", "Barbell Wrist Curl", "forearms", "wrist_flexion", "barbell", "A", "Forearms on the bench, palms up — the flexor mass."),
  e("reverse-wrist-curl", "Reverse Wrist Curl", "forearms", "wrist_extension", "barbell", undefined, "Palms down, raise the knuckles — neglected extensors."),
  e("cable-wrist-curl", "Cable Wrist Curl", "forearms", "wrist_flexion", "cable", undefined, "Constant-tension version — behind-the-back or on the thigh."),
  e("dead-hang", "Dead Hang", "grip", "static_grip", "bodyweight", "A", "Hang hard for time — grip, forearms, decompression."),
  e("plate-pinch", "Plate Pinch Hold", "fingers", "static_grip", "barbell", undefined, "Pinch two plates smooth-side-out — true finger strength."),
  e("towel-pullup", "Towel Pull-up / Hang", "grip", "vertical_pull", "bodyweight", undefined, "Towels over the bar — massive forearm + finger work.", true),
  e("fat-grip-curl", "Thick-Bar / Fat-Grip Curl", "forearms", "elbow_flexion", "dumbbell", undefined, "Thick grip loads the forearm through the whole curl."),
  e("rice-bucket", "Rice Bucket Digs", "fingers", "static_grip", "bodyweight", undefined, "Hands deep in rice — open, close, twist for finger + wrist health."),
  // ── NECK ──
  e("neck-flexion", "Neck Flexion (plate)", "neck", "neck_flexion", "bodyweight", undefined, "Supine, light plate on forehead, chin to chest, slow."),
  e("neck-extension", "Neck Extension (plate)", "neck", "neck_extension", "bodyweight", undefined, "Face-down, plate behind head, extend slowly — most neglected muscle."),
  e("neck-lateral", "Neck Lateral Flexion", "neck", "neck_lateral", "bodyweight", undefined, "Side-lying, light plate, ear toward shoulder — both sides."),
  e("neck-rotation", "Neck Rotation (band)", "neck", "neck_rotation", "band", undefined, "Band around the head, slow rotations — posture insurance."),
].map((x) => ({ ...x, head: HEAD_OF[x.slug] }));

export const MUSCLES = [
  { key: "chest", label: "Chest" }, { key: "upper_chest", label: "Upper chest" },
  { key: "lower_chest", label: "Lower chest" }, { key: "lats", label: "Lats" },
  { key: "mid_back", label: "Mid back / traps" }, { key: "rear_delts", label: "Rear delts" },
  { key: "erectors", label: "Erectors" }, { key: "front_delts", label: "Front delts" },
  { key: "side_delts", label: "Side delts" }, { key: "upper_traps", label: "Upper traps" },
  { key: "lower_traps", label: "Lower traps" }, { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" }, { key: "forearms", label: "Forearms" },
  { key: "grip", label: "Grip" }, { key: "fingers", label: "Fingers" },
  { key: "neck", label: "Neck" }, { key: "quads", label: "Quads" },
  { key: "hamstrings", label: "Hamstrings" }, { key: "glutes", label: "Glutes" },
  { key: "glute_med", label: "Glute med" }, { key: "gastroc", label: "Calves (gastroc)" },
  { key: "soleus", label: "Calves (soleus)" }, { key: "upper_abs", label: "Upper abs" },
  { key: "lower_abs", label: "Lower abs" }, { key: "abs", label: "Abs" },
  { key: "obliques", label: "Obliques" },
] as const;

// Per-day day types — pick any of these for any weekday inside the editor.
export const DAY_TEMPLATES: Array<{ name: string; muscles: string[] }> = [
  { name: "Upper", muscles: ["chest", "upper_chest", "lats", "mid_back", "side_delts", "biceps", "triceps"] },
  { name: "Lower", muscles: ["quads", "hamstrings", "glutes", "erectors", "gastroc", "soleus"] },
  { name: "Legs", muscles: ["quads", "hamstrings", "glutes", "gastroc", "soleus"] },
  { name: "Push", muscles: ["chest", "upper_chest", "front_delts", "side_delts", "triceps"] },
  { name: "Push + Biceps", muscles: ["chest", "upper_chest", "front_delts", "side_delts", "triceps", "biceps"] },
  { name: "Pull", muscles: ["lats", "mid_back", "rear_delts", "biceps", "forearms"] },
  { name: "Pull + Triceps", muscles: ["lats", "mid_back", "rear_delts", "upper_traps", "biceps", "triceps"] },
  { name: "Arms", muscles: ["biceps", "triceps", "forearms", "grip"] },
  { name: "Abs + Shoulders", muscles: ["upper_abs", "lower_abs", "obliques", "front_delts", "side_delts", "rear_delts"] },
  { name: "Full Body", muscles: ["chest", "lats", "quads", "side_delts"] },
];

export const SPLIT_TEMPLATES: Record<string, { name: string; days: Record<number, { name: string; muscles: string[] }> }> = {
  week: {
    name: "Your 7-day split",
    days: {
      1: DAY_TEMPLATES[0], 2: DAY_TEMPLATES[1], 3: DAY_TEMPLATES[2],
      4: DAY_TEMPLATES[4], 5: DAY_TEMPLATES[6], 6: DAY_TEMPLATES[7], 0: DAY_TEMPLATES[8],
    },
  },
  ppl: {
    name: "Push / Pull / Legs",
    days: { 1: DAY_TEMPLATES[3], 3: DAY_TEMPLATES[5], 5: DAY_TEMPLATES[2] },
  },
  upper_lower: {
    name: "Upper / Lower",
    days: { 1: DAY_TEMPLATES[0], 2: DAY_TEMPLATES[1], 4: DAY_TEMPLATES[0], 5: DAY_TEMPLATES[1] },
  },
  full_body: {
    name: "Full Body ×3",
    days: { 1: DAY_TEMPLATES[9], 3: DAY_TEMPLATES[9], 5: DAY_TEMPLATES[9] },
  },
};
