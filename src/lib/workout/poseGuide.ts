// Pose guidance math for the progress-photo camera.
// MediaPipe PoseLandmarker emits 33 normalized landmarks; we reduce them to
// 13 body keypoints, normalize by torso length (shoulder→hip), and score the
// user's pose against a target — either their own previous photo's pose or a
// built-in stance. Scale- and position-invariant by construction.

export type Pt = [number, number]; // normalized [x, y] in 0..1 image space

// MediaPipe landmark indices we care about.
const I = {
  nose: 0, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankL: 27, ankR: 28,
} as const;

export interface KeyPose {
  nose: Pt; shL: Pt; shR: Pt; elL: Pt; elR: Pt; wrL: Pt; wrR: Pt;
  hipL: Pt; hipR: Pt; kneeL: Pt; kneeR: Pt; ankL: Pt; ankR: Pt;
}

interface LM { x: number; y: number }

/** Reduce 33 landmarks → 13 keypoints. Returns null if pose isn't detected. */
export function keyPose(lm: LM[]): KeyPose | null {
  if (!lm || lm.length < 33) return null;
  const p = (i: number): Pt => [lm[i].x, lm[i].y];
  return {
    nose: p(I.nose), shL: p(I.shL), shR: p(I.shR), elL: p(I.elL), elR: p(I.elR),
    wrL: p(I.wrL), wrR: p(I.wrR), hipL: p(I.hipL), hipR: p(I.hipR),
    kneeL: p(I.kneeL), kneeR: p(I.kneeR), ankL: p(I.ankL), ankR: p(I.ankR),
  };
}

/**
 * Normalize: origin = mid-hip, unit = mid-shoulder→mid-hip distance.
 * Result is invariant to where the person stands and how far away they are.
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

// Bones scored by angle difference — robust to limb-length differences.
const BONES: [keyof KeyPose, keyof KeyPose][] = [
  ["shL", "elL"], ["elL", "wrL"], ["shR", "elR"], ["elR", "wrR"],
  ["hipL", "kneeL"], ["kneeL", "ankL"], ["hipR", "kneeR"], ["kneeR", "ankR"],
  ["shL", "hipL"], ["shR", "hipR"], // torso sides — catches leaning
];
const POINTS: (keyof KeyPose)[] = ["nose", "shL", "shR", "elL", "elR", "wrL", "wrR", "kneeL", "kneeR", "ankL", "ankR"];

const ang = (a: Pt, b: Pt) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const wrap = (d: number) => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));

/** 0–100 match score between two normalized poses. 100 = identical stance. */
export function scorePose(target: KeyPose, current: KeyPose): number {
  let sum = 0, n = 0;
  for (const [a, b] of BONES) {
    const d = wrap(ang(target[a], target[b]) - ang(current[a], current[b]));
    sum += d; n++;
  }
  const boneScore = Math.max(0, 100 - (sum / n) * (180 / Math.PI) * 1.6);
  // Keypoint distance adds positional fidelity bone angles miss.
  let dSum = 0;
  for (const k of POINTS) {
    const t = target[k], c = current[k];
    dSum += Math.hypot(t[0] - c[0], t[1] - c[1]);
  }
  const distScore = Math.max(0, 100 - (dSum / POINTS.length) * 220);
  return Math.round(boneScore * 0.6 + distScore * 0.4);
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
