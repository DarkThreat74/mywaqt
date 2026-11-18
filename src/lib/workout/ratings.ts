/**
 * Evidence-based exercise ratings — fills `tier`/`tierWhy` for the ~1,900
 * catalog entries without a curated tier.
 *
 * Criteria follow the published hypertrophy-selection framework the curated
 * bank already uses (Nippard tier criteria + RP's stimulus-to-fatigue ratio):
 *   1. Tension at long muscle length (the dominant growth signal —
 *      Pedrosa 2023, Maeo 2021/2022)
 *   2. Stability / low limiting factors (braced or guided paths let the
 *      target muscle reach failure first)
 *   3. Progression potential (micro-loadable week to week)
 *   4. Fatigue cost (axial load, momentum requirement, balance demand)
 *
 * Tiers: S > A > B > C > D — no F; everything here trains something.
 * Two extra categories for exercises that aren't strength lifts at all:
 *   M = mobility / prehab / skill work (stretches, SMR, drills, CARs)
 *   V = conditioning / cardio (running, swimming, machines, carries for time)
 */
import type { Exercise } from "./exercises-meta";

export type Tier = "S" | "A" | "B" | "C" | "D" | "M" | "V";

const MOBILITY_RE =
  /\bstretch|\bsmr\b|foam.?roll|blackroll|mobility|warm-?up|drill|\bcars\b|dislocat|meditat|breath|yoga|pose\b|opening|rehab|activation|correctiv|release/i;
const CONDITIONING_RE =
  /sprint|running|jog|walk|swim|bike|bicycl|rowing|skierg|ski erg|elliptical|climbmill|stair|jump|jack|rope jump|skipping|battle rope|burpee|shuttle|agility|ladder|cone|plyo|boxing|punches|sled|prowler|tabata|assault|cardio|endurance/i;
// Non-lifting patterns — only these can route to M/V. A lunge is a lunge
// even when the name contains "walking".
const NONSTRENGTH = new Set(["isometric", "static_grip", "neck_multi", "carry", "other", "rotation", "anti_rotation", "lateral_flexion", "crush_grip"]);

// Base pattern value — multi-joint patterns earn points before equipment and
// position bonuses. Patterns that put the target under load at long length
// (the dominant growth signal per the lengthened-training literature) rate
// highest.
const LENGTHENED: Record<string, number> = {
  hinge: 14, horizontal_flye: 12, incline_flye: 12, decline_flye: 10, pullover: 10,
  horizontal_pull: 10, vertical_pull: 10, squat: 10, hip_extension: 10,
  knee_flexion: 8, plantar_flexion: 8, lunge: 8, horizontal_push: 8, incline_push: 8,
  vertical_push: 6, elbow_extension: 6, knee_extension: 6,
  elbow_flexion: 4, lateral_raise: 4, rear_flye: 4, leg_raise: 4, front_raise: 4,
  abduction: 4, adduction: 4, dorsiflexion: 4, wrist_flexion: 4, wrist_extension: 4,
  spinal_flexion: 4, neck_flexion: 4, neck_multi: 2, hip_thrust: 2, pelvic_curl: 2,
  anti_extension: 2, rotation: 2, lateral_flexion: 2, shrug: 2, carry: 2,
  spinal_extension: 4, crush_grip: 2, static_grip: 0, isometric: 0,
};
// Stability / stimulus-to-fatigue by implement. Cables + machines keep
// tension where free weights go slack and remove balance as the limiter.
const EQUIP: Record<string, number> = {
  cable: 10, machine: 10, smith: 6, barbell: 6, dumbbell: 4, kettlebell: 0,
  bodyweight: 0, band: -6, trx: -2, medicine_ball: -4, sled: -4, other: -2,
};
// Momentum/balance penalties — the target can't reach failure if coordination
// or balance fails first.
const PENALTY_RE =
  /swing|slam|throw|snatch|clean(?!er)|jerk|jump|hop|bounce|ballistic|bosu|balance|wobble|single-leg-balance|juggling/i;
const LENGTHENED_NAME_RE =
  /incline|overhead|deficit|deep|stretch|long|preacher|bayesian|seated-leg|lying.*curl|heel-?elevated|atg|paused|flye|fly|pullover|sissy|spanish/i;
const SHORT_ROM_RE = /partial|half|lockout|rack-pull|board-press|pin-press|mini|iso(?!metric)|hold$/i;

export function autoTier(e: Pick<Exercise, "name" | "muscle" | "pattern" | "equip" | "compound">): { tier: Tier; why: string } {
  const name = e.name;

  if (NONSTRENGTH.has(e.pattern) && (MOBILITY_RE.test(name) || e.muscle === "flexibility" || e.pattern === "mobility"))
    return { tier: "M", why: "Mobility/prehab work — rates on its own axis. Do it for range of motion and joint health, not hypertrophy." };
  if (NONSTRENGTH.has(e.pattern) && CONDITIONING_RE.test(name))
    return { tier: "V", why: "Conditioning work — improves work capacity and cardio fitness rather than driving muscle growth. Program it separately from hypertrophy sets." };

  const reasons: string[] = [];
  let score = 40;

  // Many catalog entries lack a compound flag — infer it from the movement
  // pattern when the name doesn't read as an isolation.
  const isoName = /curl|fly|raise|extension|kickback|pullover|shrug|crunch|wrist|calf|abduction|adduction|rotation|bend/i.test(name);
  const COMPOUND_PATTERNS = new Set(["horizontal_push", "incline_push", "vertical_push", "squat", "lunge", "hinge", "vertical_pull", "horizontal_pull", "hip_extension"]);
  const compound = e.compound || (COMPOUND_PATTERNS.has(e.pattern) && !isoName && e.equip !== "band");
  if (compound) { score += 12; reasons.push("multi-joint — heavy progressive overload is easy and it trains several muscles at once"); }
  else reasons.push("isolation — great for targeting one muscle, lower total-system stimulus");

  const len = LENGTHENED[e.pattern] ?? 0;
  if (len >= 8) { score += len; reasons.push("loads the muscle at long length — the strongest growth signal in the current literature (Pedrosa 2023, Maeo 2021)"); }
  else if (len > 0) score += len;

  const eq = EQUIP[e.equip] ?? EQUIP.other;
  if (eq >= 10) { score += eq; reasons.push(e.equip === "cable" ? "cable keeps constant tension through the whole range — no slack point" : "machine path is stable — the target muscle fails before balance or grip does"); }
  else if (eq >= 6) score += eq;
  else if (eq < 0) { score += eq; reasons.push(e.equip === "band" ? "band tension peaks at lockout — lightest where the muscle is stretched, the opposite of ideal" : "unstable or awkward implement limits how hard the target can be pushed"); }
  else if (e.equip === "bodyweight") reasons.push("bodyweight — free and joint-friendly, but harder to micro-progress once strong");

  if (LENGTHENED_NAME_RE.test(name)) { score += 6; reasons.push("setup biases the stretched position — where tension matters most"); }
  if (PENALTY_RE.test(name)) { score -= 18; reasons.push("momentum or balance is the limiter — the target muscle rarely reaches failure"); }
  if (SHORT_ROM_RE.test(name)) { score -= 10; reasons.push("reduced range of motion — useful as a top-up, weaker as a main builder"); }
  if (/single|one-?arm|one-?leg|unilateral/.test(name)) { score += 2; reasons.push("unilateral — exposes and fixes side-to-side imbalance"); }

  const tier: Tier = score >= 78 ? "S" : score >= 64 ? "A" : score >= 50 ? "B" : score >= 40 ? "C" : "D";
  const tails: Record<Tier, string> = {
    S: "Top-tier pick — hard to beat for this muscle.",
    A: "Excellent choice — earns a regular slot.",
    B: "Solid — small compromises vs the best options.",
    C: "Works, but there's usually a better option for the same muscle.",
    D: "Usable — keep it for variety, not as the main driver.",
    M: "", V: "",
  };
  const head = reasons.slice(0, 2).join("; ");
  return { tier, why: `${head[0].toUpperCase()}${head.slice(1)}. ${tails[tier]}` };
}
