// Torso clothing detection for progress photos — MediaPipe pose doesn't
// report clothing, so we infer it: sample skin color from the face and
// hands (pose landmarks 0-10, 15-16 are on bare-ish skin), then measure
// what fraction of the shoulder→hip torso region matches that skin tone.
// Used to nudge users toward bare-back/side check-ins and to tag photos.

export interface Landmark2D { x: number; y: number }
export interface ShirtResult {
  /** true when the torso region looks like bare skin, not fabric */
  shirtless: boolean;
  /** 0..1 fraction of torso pixels matching the sampled skin tone */
  skinRatio: number;
}

const SKIN_FACE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // face oval + nose bridge
const SKIN_WRISTS = [15, 16]; // wrist bases — merged only if they match the face tone
const SH_L = 11, SH_R = 12, HIP_L = 23, HIP_R = 24;

function median(sorted: number[]) { return sorted[Math.floor(sorted.length / 2)]; }
const dist3 = (a: number[], b: number[]) => {
  const d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
};

/** Pull RGB samples out of a small drawn patch; null if out of bounds. */
function patchChannels(
  img: CanvasImageSource, fw: number, fh: number,
  cx: number, cy: number, r: number,
): { rs: number[]; gs: number[]; bs: number[]; med: number[] } | null {
  if (r < 2 || cx - r < 0 || cy - r < 0 || cx + r > fw || cy + r > fh) return null;
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
  if (rs.length < 8) return null;
  const srt = (a: number[]) => [...a].sort((x, y) => x - y);
  const sr = srt(rs), sg = srt(gs), sb = srt(bs);
  return { rs, gs, bs, med: [median(sr), median(sg), median(sb)] };
}

/**
 * Median skin RGB — face patch is the anchor. Wrist patches only merge when
 * their own median is close to the face median, so a long sleeve can't
 * drag the reference toward fabric color.
 */
function sampleSkin(img: CanvasImageSource, lm: Landmark2D[], fw: number, fh: number): number[] | null {
  // Landmarks are normalized 0..1, origin top-left → pixel = norm * size.
  const fx = SKIN_FACE.reduce((s, i) => s + lm[i].x, 0) / SKIN_FACE.length * fw;
  const fy = SKIN_FACE.reduce((s, i) => s + lm[i].y, 0) / SKIN_FACE.length * fh;
  const face = patchChannels(img, fw, fh, fx, fy, fw * 0.05);
  if (!face) return null;
  const skinMed = face.med;
  const rs = [...face.rs], gs = [...face.gs], bs = [...face.bs];
  for (const i of SKIN_WRISTS) {
    const w = patchChannels(img, fw, fh, lm[i].x * fw, lm[i].y * fh, fw * 0.025);
    // Reject sleeve/fabric samples — only bare-skin-colored wrists count.
    if (w && dist3(w.med, skinMed) < 70) { rs.push(...w.rs); gs.push(...w.gs); bs.push(...w.bs); }
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

  // Torso region: shoulder line → hip line, symmetric horizontal inset,
  // bottom edge pulled up to mid-hip so waistband/pants don't count.
  const mx = (i: number) => lm[i].x * fw;
  const my = (i: number) => lm[i].y * fh;
  const shX = (mx(SH_L) + mx(SH_R)) / 2, shY = (my(SH_L) + my(SH_R)) / 2;
  const hipX = (mx(HIP_L) + mx(HIP_R)) / 2, hipY = (my(HIP_L) + my(HIP_R)) / 2;
  const torsoCX = (shX + hipX) / 2;
  const topY = Math.min(shY, hipY), botY = Math.max(shY, hipY);
  const halfW = Math.abs(mx(SH_L) - mx(SH_R)) / 2 * 1.05;
  const torsoH = botY - topY;
  if (torsoH < fh * 0.08 || halfW < fw * 0.02) return null; // too small/edge-on

  const rw = halfW * 2 * 0.85, rh = torsoH * 0.92;
  const rx = torsoCX - rw / 2, ry = topY + torsoH * 0.04;
  const w = 40, h = Math.max(8, Math.round((40 * rh) / rw));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, rx, ry, rw, rh, 0, 0, w, h);
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
