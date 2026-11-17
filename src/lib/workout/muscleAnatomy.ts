// Educational anatomy data per fine-grained muscle key — shown in the
// recovery detail sheet so users learn the muscles they train.
export interface MuscleInfo {
  latin: string;      // scientific name
  family: string;     // muscle group / region
  fibers: string;     // dominant fiber profile → what it responds to
  action: string;     // primary function
  note?: string;      // short training-relevant fact
}

export const MUSCLE_INFO: Record<string, MuscleInfo> = {
  chest:        { latin: "Pectoralis major (sternal head)", family: "Chest — horizontal pushers", fibers: "Mixed, ~60% fast-twitch", action: "Adducts and horizontally flexes the arm — every press and fly.", note: "Responds well to heavy pressing and stretch-position flys." },
  upper_chest:  { latin: "Pectoralis major (clavicular head)", family: "Chest — horizontal pushers", fibers: "Mixed, slightly more slow-twitch", action: "Flexes the arm upward — targeted by incline angles (~30–45°).", note: "Lagging on most lifters; incline work fixes the flat look." },
  lower_chest:  { latin: "Pectoralis major (costal fibers)", family: "Chest — horizontal pushers", fibers: "Mixed, ~60% fast-twitch", action: "Pulls the arm down and across — dips and decline presses.", note: "Weighted dips hammer it through a long range." },
  lats:         { latin: "Latissimus dorsi", family: "Back — vertical pullers", fibers: "Mixed, ~50/50", action: "Pulls the arm down and back — pull-ups, pulldowns, rows.", note: "Largest muscle of the upper body; drives the V-taper." },
  mid_back:     { latin: "Rhomboids + middle trapezius", family: "Back — horizontal pullers", fibers: "Mostly slow-twitch", action: "Retracts the shoulder blades — every rowing movement.", note: "High-rep rows grow it; posture muscle." },
  upper_traps:  { latin: "Trapezius (descending part)", family: "Back — scapular elevators", fibers: "Mixed", action: "Elevates and upwardly rotates the scapula — shrugs, carries.", note: "Very fatigue-resistant; recovers fast." },
  lower_traps:  { latin: "Trapezius (ascending/transverse parts)", family: "Back — scapular depressors", fibers: "Mostly slow-twitch", action: "Depresses the scapula — keeps shoulders healthy under load.", note: "Weak lower traps = shrugging on every overhead rep." },
  erectors:     { latin: "Erector spinae", family: "Trunk — spinal extensors", fibers: "Mostly slow-twitch (postural)", action: "Extends the spine and resists flexion — every hinge and brace.", note: "Isometric work (deads, carries) builds it more than crunches." },
  front_delts:  { latin: "Deltoideus (anterior head)", family: "Shoulders — pushers", fibers: "Mixed", action: "Flexes and internally rotates the shoulder — presses, raises.", note: "Gets plenty of work from pressing already." },
  side_delts:   { latin: "Deltoideus (lateral head)", family: "Shoulders — abductors", fibers: "Mixed, ~55% slow-twitch", action: "Abducts the arm to the side — lateral raises.", note: "The width muscle; tolerates high reps and volume." },
  rear_delts:   { latin: "Deltoideus (posterior head)", family: "Shoulders — horizontal abductors", fibers: "Mostly slow-twitch", action: "Pulls the arm back horizontally — reverse flys, face pulls.", note: "Almost always undertrained; key for shoulder health." },
  biceps:       { latin: "Biceps brachii", family: "Arm — elbow flexors", fibers: "~60% fast-twitch", action: "Flexes the elbow and supinates the forearm — curls.", note: "The long head shows in the stretch; the short in the peak." },
  triceps:      { latin: "Triceps brachii", family: "Arm — elbow extensors", fibers: "~65% fast-twitch", action: "Extends the elbow — ~2/3 of upper-arm mass.", note: "The long head needs overhead work to fully stretch." },
  forearms:     { latin: "Brachioradialis + wrist flexors/extensors", family: "Forearm — wrist/grip", fibers: "Mostly slow-twitch", action: "Flexes and extends the wrist; assists elbow flexion.", note: "Grows with carries, hammer curls, and dead hangs." },
  grip:         { latin: "Flexor digitorum group", family: "Forearm — finger flexors", fibers: "Mostly slow-twitch", action: "Closes the hand — every hold, pull, and carry.", note: "Grip is usually the first thing to fail, not the muscle." },
  fingers:      { latin: "Flexor digitorum superficialis/profundus", family: "Forearm — finger flexors", fibers: "Mostly slow-twitch", action: "Finger flexion — hangs, holds, pinch work." },
  neck:         { latin: "Sternocleidomastoid + deep neck flexors/extensors", family: "Neck", fibers: "Mostly slow-twitch", action: "Flexes, extends, and rotates the head.", note: "Train it directly and gently — posture and contact sports." },
  quads:        { latin: "Quadriceps femoris (vasti + rectus femoris)", family: "Thigh — knee extensors", fibers: "Mixed, ~50/50", action: "Extends the knee; rectus femoris also flexes the hip.", note: "Rectus femoris only loads in single-joint extension — squat alone isn't enough." },
  hamstrings:   { latin: "Biceps femoris, semitendinosus, semimembranosus", family: "Thigh — knee flexors / hip extensors", fibers: "~55–70% fast-twitch", action: "Flexes the knee and extends the hip — hinges and curls.", note: "Two jobs: lying curls hit knee flexion, RDLs hit hip extension." },
  glutes:       { latin: "Gluteus maximus", family: "Hip — extensors", fibers: "Mixed, ~50/50", action: "Extends and externally rotates the hip — squats, hinges, thrusts.", note: "Largest muscle in the body; strongest at the stretch." },
  glute_med:    { latin: "Gluteus medius + minimus", family: "Hip — abductors", fibers: "Mostly slow-twitch", action: "Abducts the thigh and stabilizes the pelvis single-leg.", note: "Weakness shows up as knees caving on squats." },
  adductors:    { latin: "Adductor longus/magnus/brevis", family: "Thigh — adductors", fibers: "Mixed", action: "Pulls the thigh toward midline — also assists hip extension.", note: "Deep squats and wide stances load them hard." },
  gastroc:      { latin: "Gastrocnemius", family: "Lower leg — plantarflexors", fibers: "~50–60% fast-twitch", action: "Points the foot with a straight knee — standing calf work.", note: "The visible diamond; grows with full-stretch reps." },
  soleus:       { latin: "Soleus", family: "Lower leg — plantarflexors", fibers: "~80–90% slow-twitch", action: "Points the foot with a bent knee — seated calf work.", note: "Built for endurance — high reps, often." },
  tibialis:     { latin: "Tibialis anterior", family: "Lower leg — dorsiflexors", fibers: "Mostly slow-twitch", action: "Lifts the foot toward the shin — shin balance and sprint health.", note: "Training it fights shin splints." },
  hip_flexors:  { latin: "Iliopsoas (psoas major + iliacus)", family: "Hip — flexors", fibers: "Mixed", action: "Raises the thigh toward the torso — knee raises, marching.", note: "Often tight from sitting, not weak from training." },
  upper_abs:    { latin: "Rectus abdominis (supra-umbilical)", family: "Core — spinal flexors", fibers: "Mostly fast-twitch", action: "Flexes the spine ribs-to-pelvis — crunches, cable crunches.", note: "Same muscle top to bottom — 'upper' bias comes from rib-driven reps." },
  lower_abs:    { latin: "Rectus abdominis (infra-umbilical)", family: "Core — spinal flexors", fibers: "Mostly fast-twitch", action: "Curls the pelvis toward the ribs — reverse crunches, raises.", note: "Load the posterior pelvic tilt, not the hip swing." },
  abs:          { latin: "Rectus abdominis", family: "Core — spinal flexors", fibers: "Mostly fast-twitch", action: "Flexes the spine and resists extension — the six-pack.", note: "It flexes the spine, not the hips — think curling, not folding." },
  all_abs:      { latin: "Rectus abdominis + transversus abdominis", family: "Core — flexors + deep stabilizers", fibers: "Mixed", action: "Spinal flexion plus deep bracing — rollouts, dead bugs, planks.", note: "Anti-extension work (rollouts) is the hardest core stimulus." },
  obliques:     { latin: "External + internal obliques", family: "Core — rotators/lateral flexors", fibers: "Mixed", action: "Rotates and side-flexes the trunk; braces under load.", note: "Every heavy brace uses them — direct work adds waist density." },
};

// Fallback for keys not in the table — never block the UI on missing copy.
export const muscleInfo = (key: string): MuscleInfo | null => MUSCLE_INFO[key] ?? null;
