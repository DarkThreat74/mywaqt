// Pose guidance math for the progress-photo camera.
// MediaPipe PoseLandmarker emits 33 landmarks; we reduce them to 13 body
// keypoints and score the user's stance against a target — either their own
// previous photo's pose or a built-in stance.
//
// Scoring is JOINT-ANGLE based, not position based: each limb angle is
// compared independently, so the score is invariant to where the person
// stands, how far away they are, and torso normalization. This is the
// approach used by pose-tutor/physical-therapy apps — position-distance
// scoring punishes natural stance variation and caps out far below 100.
//
// When MediaPipe worldLandmarks (real 3D meters, hip-centered) are available
// for BOTH target and current, scoring runs in 3D — view-angle independent.
// Otherwise it falls back to 2D image-plane angles, which still beat the old
// normalized-coordinate distance score by a wide margin.

export type Pt = [number, number]; // normalized [x, y] in 0..1 image space
export type Pt3 = [number, number, number]; // world coordinates, meters

// MediaPipe landmark indices we care about.
const I = {
  nose: 0, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankL: 27, ankR: 28,
} as const;

export interface KeyPose {
  nose: Pt; shL: Pt; shR: Pt; elL: Pt; elR: Pt; wrL: Pt; wrR: Pt;
  hipL: Pt; hipR: Pt; kneeL: Pt; kneeR: Pt; ankL: Pt; ankR: Pt;
  /** MediaPipe landmark visibility 0..1 per joint — absent on synthetic poses. */
  vis?: Partial<Record<keyof Omit<KeyPose, "vis">, number>>;
}
export interface KeyPose3D {
  nose: Pt3; shL: Pt3; shR: Pt3; elL: Pt3; elR: Pt3; wrL: Pt3; wrR: Pt3;
  hipL: Pt3; hipR: Pt3; kneeL: Pt3; kneeR: Pt3; ankL: Pt3; ankR: Pt3;
  vis?: Partial<Record<keyof Omit<KeyPose3D, "vis">, number>>;
}
export type AnyPose = KeyPose | KeyPose3D;

interface LM { x: number; y: number; z?: number; visibility?: number }

const visOf = (lm: LM[], i: number) => lm[i]?.visibility ?? 1;

/** Reduce 33 image landmarks → 13 keypoints. Returns null if pose isn't detected. */
export function keyPose(lm: LM[]): KeyPose | null {
  if (!lm || lm.length < 33) return null;
  const p = (i: number): Pt => [lm[i].x, lm[i].y];
  const v = (i: number) => visOf(lm, i);
  return {
    nose: p(I.nose), shL: p(I.shL), shR: p(I.shR), elL: p(I.elL), elR: p(I.elR),
    wrL: p(I.wrL), wrR: p(I.wrR), hipL: p(I.hipL), hipR: p(I.hipR),
    kneeL: p(I.kneeL), kneeR: p(I.kneeR), ankL: p(I.ankL), ankR: p(I.ankR),
    vis: {
      nose: v(I.nose), shL: v(I.shL), shR: v(I.shR), elL: v(I.elL), elR: v(I.elR),
      wrL: v(I.wrL), wrR: v(I.wrR), hipL: v(I.hipL), hipR: v(I.hipR),
      kneeL: v(I.kneeL), kneeR: v(I.kneeR), ankL: v(I.ankL), ankR: v(I.ankR),
    },
  };
}

/** Reduce 33 world landmarks → 13 keypoints in meters (hip-centered). */
export function keyPose3D(lm: LM[]): KeyPose3D | null {
  if (!lm || lm.length < 33) return null;
  const p = (i: number): Pt3 => [lm[i].x, lm[i].y, lm[i].z ?? 0];
  const v = (i: number) => visOf(lm, i);
  return {
    nose: p(I.nose), shL: p(I.shL), shR: p(I.shR), elL: p(I.elL), elR: p(I.elR),
    wrL: p(I.wrL), wrR: p(I.wrR), hipL: p(I.hipL), hipR: p(I.hipR),
    kneeL: p(I.kneeL), kneeR: p(I.kneeR), ankL: p(I.ankL), ankR: p(I.ankR),
    vis: {
      nose: v(I.nose), shL: v(I.shL), shR: v(I.shR), elL: v(I.elL), elR: v(I.elR),
      wrL: v(I.wrL), wrR: v(I.wrR), hipL: v(I.hipL), hipR: v(I.hipR),
      kneeL: v(I.kneeL), kneeR: v(I.kneeR), ankL: v(I.ankL), ankR: v(I.ankR),
    },
  };
}

/**
 * Normalize: origin = mid-hip, unit = mid-shoulder→mid-hip distance.
 * Used ONLY for drawing the target skeleton overlay — angle scoring does
 * not need it (angles are scale/position invariant by construction).
 */
export function normalizePose(k: KeyPose): KeyPose {
  const midHip: Pt = [(k.hipL[0] + k.hipR[0]) / 2, (k.hipL[1] + k.hipR[1]) / 2];
  const midSh: Pt = [(k.shL[0] + k.shR[0]) / 2, (k.shL[1] + k.shR[1]) / 2];
  const torso = Math.hypot(midSh[0] - midHip[0], midSh[1] - midHip[1]) || 1;
  const n = (p: Pt): Pt => [(p[0] - midHip[0]) / torso, (p[1] - midHip[1]) / torso];
  return {
    nose: n(k.nose), shL: n(k.shL), shR: n(k.shR), elL: n(k.elL), elR: n(k.elR),
    wrL: n(k.wrL), wrR: n(k.wrR), hipL: n(k.hipL), hipR: n(k.hipR),
    kneeL: n(k.kneeL), kneeR: n(k.kneeR), ankL: n(k.ankL), ankR: n(k.ankR),
  };
}

// ── Joint-angle scoring ──────────────────────────────────────────────────

type NPt = readonly number[];
const sub = (a: NPt, b: NPt): NPt => a.map((v, i) => v - (b[i] ?? 0));
const dot = (a: NPt, b: NPt) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
const mag = (a: NPt) => Math.hypot(...a);
const mid = (a: NPt, b: NPt): NPt => a.map((v, i) => (v + (b[i] ?? 0)) / 2);

/** Interior angle at `b` formed by points a-b-c, in degrees. */
function angleAt(a: NPt, b: NPt, c: NPt): number {
  const u = sub(a, b), v = sub(c, b);
  const d = dot(u, v) / (mag(u) * mag(v) || 1e-9);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

const midSh = (k: AnyPose) => mid(k.shL as NPt, k.shR as NPt);
const midHip = (k: AnyPose) => mid(k.hipL as NPt, k.hipR as NPt);
const midKnee = (k: AnyPose) => mid(k.kneeL as NPt, k.kneeR as NPt);

type Joint = keyof Omit<KeyPose, "vis">;
// Each entry: joint name (for UI hints), weight, angle definition, and the
// body joints it depends on (for visibility gating).
const ANGLES: { name: string; w: number; joints: Joint[]; get: (k: AnyPose) => number }[] = [
  { name: "left elbow", w: 1.0, joints: ["shL", "elL", "wrL"], get: (k) => angleAt(k.shL as NPt, k.elL as NPt, k.wrL as NPt) },
  { name: "right elbow", w: 1.0, joints: ["shR", "elR", "wrR"], get: (k) => angleAt(k.shR as NPt, k.elR as NPt, k.wrR as NPt) },
  { name: "left shoulder", w: 1.0, joints: ["elL", "shL", "hipL"], get: (k) => angleAt(k.elL as NPt, k.shL as NPt, k.hipL as NPt) },
  { name: "right shoulder", w: 1.0, joints: ["elR", "shR", "hipR"], get: (k) => angleAt(k.elR as NPt, k.shR as NPt, k.hipR as NPt) },
  { name: "left hip", w: 1.2, joints: ["shL", "hipL", "kneeL"], get: (k) => angleAt(k.shL as NPt, k.hipL as NPt, k.kneeL as NPt) },
  { name: "right hip", w: 1.2, joints: ["shR", "hipR", "kneeR"], get: (k) => angleAt(k.shR as NPt, k.hipR as NPt, k.kneeR as NPt) },
  { name: "left knee", w: 1.2, joints: ["hipL", "kneeL", "ankL"], get: (k) => angleAt(k.hipL as NPt, k.kneeL as NPt, k.ankL as NPt) },
  { name: "right knee", w: 1.2, joints: ["hipR", "kneeR", "ankR"], get: (k) => angleAt(k.hipR as NPt, k.kneeR as NPt, k.ankR as NPt) },
  { name: "torso", w: 1.0, joints: ["shL", "shR", "hipL", "hipR", "kneeL", "kneeR"], get: (k) => angleAt(midSh(k), midHip(k), midKnee(k)) },
  { name: "neck", w: 0.6, joints: ["nose", "shL", "shR"], get: (k) => angleAt(midHip(k), midSh(k), k.nose as NPt) },
];

// Angles built mostly from low-visibility landmarks are excluded — an
// occluded wrist shouldn't drag the score down.
const MIN_VIS = 0.35;

function angleVis(k: AnyPose, joints: Joint[]): number {
  if (!k.vis) return 1;
  let sum = 0;
  for (const j of joints) sum += k.vis[j] ?? 1;
  return sum / joints.length;
}

// Degrees of joint-angle difference that still earns partial credit.
// ~30° is forgiving enough for natural stance variation, strict enough that
// a genuinely different pose (arms raised, legs apart) scores low.
const ANGLE_TOLERANCE = 30;

function jointAngles(k: AnyPose): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ANGLES) out[a.name] = a.get(k);
  return out;
}

// How squarely the person faces the camera: +1 = anatomical left on image
// right (front view), -1 = back view, ~0 = side-on. Scale-invariant — it's
// the hip-axis direction cosine, so it works in both 2D and 3D space.
function facingness(k: AnyPose): number {
  const dx = (k.hipL as NPt)[0] - (k.hipR as NPt)[0];
  const dy = (k.hipL as NPt)[1] - (k.hipR as NPt)[1];
  const dz = ((k.hipL as NPt)[2] ?? 0) - ((k.hipR as NPt)[2] ?? 0);
  return dx / (Math.hypot(dx, dy, dz) || 1e-9);
}

/** Per-joint breakdown for UI hints — null when everything is within tolerance. */
export function worstJoint(target: AnyPose, current: AnyPose): { name: string; diff: number } | null {
  const ta = jointAngles(target), ca = jointAngles(current);
  let worst: { name: string; diff: number } | null = null;
  for (const a of ANGLES) {
    if (angleVis(current, a.joints) < MIN_VIS) continue;
    const d = Math.abs(ta[a.name] - ca[a.name]);
    if (d > ANGLE_TOLERANCE && (!worst || d > worst.diff)) worst = { name: a.name, diff: d };
  }
  return worst;
}

/**
 * 0–100 stance match. 100 = identical joint angles. Facing gate: if the
 * target is front/back and the user is clearly the opposite (or side-on
 * where the target is square), the score is capped — you can't match a
 * front pose while showing your back.
 */
export function scorePose(target: AnyPose, current: AnyPose): number {
  const ta = jointAngles(target), ca = jointAngles(current);
  let sum = 0, wsum = 0;
  for (const a of ANGLES) {
    // Weight by landmark visibility and skip mostly-occluded angles.
    const v = angleVis(current, a.joints);
    if (v < MIN_VIS) continue;
    const d = Math.abs(ta[a.name] - ca[a.name]);
    sum += a.w * v * Math.max(0, 100 * (1 - d / ANGLE_TOLERANCE));
    wsum += a.w * v;
  }
  let score = wsum > 0 ? sum / wsum : 0;
  const tf = facingness(target), cf = facingness(current);
  // Both clearly square-on but opposite facings → wrong side of the body.
  if (Math.abs(tf) > 0.5 && Math.abs(cf) > 0.5 && Math.sign(tf) !== Math.sign(cf)) score *= 0.45;
  return Math.round(score);
}

// Built-in targets (normalized space: mid-hip origin, torso = 1 unit,
// y grows downward so shoulders are negative). Approximate relaxed stances —
// a prior photo of the user's own pose always beats these.
export const DEFAULT_POSES: Record<"front" | "side" | "back", KeyPose> = {
  front: {
    nose: [0, -1.62], shL: [-0.45, -1.02], shR: [0.45, -1.02],
    elL: [-0.66, -0.5], elR: [0.66, -0.5], wrL: [-0.72, 0.02], wrR: [0.72, 0.02],
    hipL: [-0.16, -0.02], hipR: [0.16, -0.02],
    kneeL: [-0.2, 0.95], kneeR: [0.2, 0.95], ankL: [-0.24, 1.95], ankR: [0.24, 1.95],
  },
  // Side-on: body profile, arms relaxed. Approximate — prior photos refine it.
  side: {
    nose: [0.1, -1.6], shL: [-0.05, -1.0], shR: [0.12, -1.0],
    elL: [-0.18, -0.48], elR: [0.2, -0.48], wrL: [-0.2, 0.04], wrR: [0.24, 0.04],
    hipL: [-0.04, 0], hipR: [0.1, 0],
    kneeL: [-0.05, 0.95], kneeR: [0.12, 0.95], ankL: [-0.06, 1.95], ankR: [0.14, 1.95],
  },
  // Back: same stance as front, head slightly lower signal.
  back: {
    nose: [0, -1.6], shL: [-0.45, -1.02], shR: [0.45, -1.02],
    elL: [-0.66, -0.5], elR: [0.66, -0.5], wrL: [-0.72, 0.02], wrR: [0.72, 0.02],
    hipL: [-0.16, -0.02], hipR: [0.16, -0.02],
    kneeL: [-0.2, 0.95], kneeR: [0.2, 0.95], ankL: [-0.24, 1.95], ankR: [0.24, 1.95],
  },
};
