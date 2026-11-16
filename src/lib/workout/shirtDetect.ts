// Torso clothing detection for progress photos — MediaPipe pose doesn't
// report clothing, so we infer it: sample skin color from the face and
// hands (pose landmarks 0-10, 15-22 are on bare skin), then measure what
// fraction of the shoulder→hip torso region matches that skin tone.
// Used to nudge users toward bare-back/side check-ins and to tag photos.

export interface Landmark2D { x: number; y: number }
export interface ShirtResult {
  /** true when the torso region looks like bare skin, not fabric */
  shirtless: boolean;
  /** 0..1 fraction of torso pixels matching the sampled skin tone */
  skinRatio: number;
}

const SKIN_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // face oval + nose bridge
const SKIN_WRISTS = [15, 16]; // wrist bases — reliable skin even with sleeves?
// (sleeves cover wrists, so wrists are only a fallback sample, not primary)
const SH_L = 11, SH_R = 12, HIP_L = 23, HIP_R = 24;

function median(sorted: number[]) { return sorted[Math.floor(sorted.length / 2)]; }

/** Pull RGB samples out of a small drawn patch; returns sorted channel arrays. */
function patchChannels(
  img: CanvasImageSource, cx: number, cy: number, r: number,
): { rs: number[]; gs: number[]; bs: number[] } | null {
  if (r < 2 || cx - r < 0 || cy - r < 0) return null;
  const c = document.createElement("canvas");
  c.width = 8; c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2, 0, 0, 8, 8);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, 8, 8).data; } catch { return null; }
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  }
  return rs.length >= 8 ? { rs, gs, bs } : null;
}

/** Median skin RGB — face patch is primary; wrists refine it when bare. */
function sampleSkin(img: CanvasImageSource, lm: Landmark2D[], fw: number, fh: number): [number, number, number] | null {
  // Landmarks are normalized 0..1, origin top-left → pixel = norm * size.
  const fx = SKIN_FACE.reduce((s, i) => s + lm[i].x, 0) / SKIN_FACE.length * fw;
  const fy = SKIN_FACE.reduce((s, i) => s + lm[i].y, 0) / SKIN_FACE.length * fh;
  const face = patchChannels(img, fx, fy, fw * 0.05);
  if (!face) return null;
  const rs = [...face.rs], gs = [...face.gs], bs = [...face.bs];
  for (const i of SKIN_WRISTS) {
    const px = lm[i].x * fw, py = lm[i].y * fh;
    const w = patchChannels(img, px, py, fw * 0.025);
    if (w) { rs.push(...w.rs); gs.push(...w.gs); bs.push(...w.bs); }
  }
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  return [median(rs), median(gs), median(bs)];
}

/**
 * Returns null when the torso can't be measured (pose missing, box too
 * small, or canvas read blocked). Cheap enough to run ~1.4×/sec live.
 */
export function detectShirtless(
  img: CanvasImageSource, fw: number, fh: number, lm: Landmark2D[],
): ShirtResult | null {
  if (!lm || lm.length < 33) return null;
  const skin = sampleSkin(img, lm, fw, fh);
  if (!skin) return null;

  // Torso box: mid-shoulder → mid-hip, widened slightly past the shoulder
  // line, inset so deltoid/hip-joint pixels don't dominate.
  const mx = (i: number) => lm[i].x * fw;
  const my = (i: number) => lm[i].y * fh;
  const shX = (mx(SH_L) + mx(SH_R)) / 2, shY = (my(SH_L) + my(SH_R)) / 2;
  const hipY = (my(HIP_L) + my(HIP_R)) / 2;
  const shHalf = Math.abs(mx(SH_L) - mx(SH_R)) / 2;
  const torsoH = hipY - shY;
  if (torsoH < fh * 0.08 || shHalf < fw * 0.02) return null; // too small/edge-on

  const bw = shHalf * 2 * 1.1, bh = torsoH * 1.05;
  const bx = shX - bw / 2 + bw * 0.12, by = shY - bh * 0.08;
  const w = 40, h = Math.max(8, Math.round((40 * bh) / bw));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return null; }

  const [sr, sg, sb] = skin;
  let skinPx = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    total++;
    const dr = data[i] - sr, dg = data[i + 1] - sg, db = data[i + 2] - sb;
    // Generous radius — lighting/shadow shifts skin a lot; fabric rarely
    // lands this close to a sampled skin tone across the whole torso.
    if (dr * dr + dg * dg + db * db < 95 * 95) skinPx++;
  }
  if (total < 50) return null;
  const skinRatio = skinPx / total;
  return { shirtless: skinRatio > 0.55, skinRatio };
}
