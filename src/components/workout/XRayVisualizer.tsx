/**
 * X-Ray muscle recovery visualizer — live camera overlay that pins glowing
 * muscle regions to your tracked body (MediaPipe PoseLandmarker, shared
 * singleton) and colors them by real recovery data. Front and back views are
 * detected from landmark visibility so turning around shows posterior chain.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { getPoseLandmarker } from "@/lib/workout/poseModel";

type LM = { x: number; y: number; z?: number; visibility?: number };

// MediaPipe pose landmark indices.
const NOSE = 0, EAR_L = 7, EAR_R = 8, SH_L = 11, SH_R = 12, EL_L = 13, EL_R = 14,
  WR_L = 15, WR_R = 16, HIP_L = 23, HIP_R = 24, KNEE_L = 25, KNEE_R = 26,
  ANK_L = 27, ANK_R = 28;

// Recovery color ramp — same scale as the muscles page.
const RAMP = [[0.42, 0.75, 0.42], [0.83, 0.66, 0.26], [0.79, 0.42, 0.27], [0.56, 0.20, 0.10]];
function fatigueColor(f: number, alpha: number): string {
  const t = Math.min(1, Math.max(0, f)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const u = t - i;
  const c = RAMP[i].map((v, k) => Math.round((v + (RAMP[i + 1][k] - v) * u) * 255));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// One drawn region: a set of named muscle keys + a shape builder.
// Shapes get smoothed landmark points (canvas coords) plus a unit (shoulder
// width) so proportions scale with the person on screen.
type Pt = { x: number; y: number };
type Shape = (g: CanvasRenderingContext2D, p: (i: number) => Pt, u: number) => void;

interface Region { keys: string[]; label: string; side: "front" | "back" | "both"; draw: Shape; anchor: (p: (i: number) => Pt, u: number) => Pt }

function blob(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
}
function capsule(g: CanvasRenderingContext2D, a: Pt, b: Pt, halfW: number, along = 0.5, off = 0) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const mx = a.x + dx * along - (dy / len) * off, my = a.y + dy * along + (dx / len) * off;
  const rot = Math.atan2(dy, dx);
  blob(g, mx, my, Math.max(halfW, len * 0.22), halfW, rot);
}
function poly(g: CanvasRenderingContext2D, pts: Pt[]) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    g.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  g.closePath();
}

const mid = (a: Pt, b: Pt, k = 0.5): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

const REGIONS: Region[] = [
  // ── shared / both views ──
  { keys: ["neck"], label: "Neck", side: "both",
    draw: (g, p, u) => { const n = mid(p(EAR_L), p(EAR_R)), s = mid(p(SH_L), p(SH_R)); blob(g, mid(n, s, 0.4).x, mid(n, s, 0.4).y, u * 0.24, u * 0.30); },
    anchor: (p) => mid(p(EAR_L), p(EAR_R), 0.5) },
  { keys: ["forearms", "grip"], label: "Forearm", side: "both",
    draw: (g, p, u) => { capsule(g, p(EL_L), p(WR_L), u * 0.20); capsule(g, p(EL_R), p(WR_R), u * 0.20); },
    anchor: (p) => mid(p(EL_R), p(WR_R)) },
  // ── front view ──
  { keys: ["upper_traps"], label: "Traps", side: "front",
    draw: (g, p, u) => {
      const n = mid(p(EAR_L), p(EAR_R)), c = mid(p(SH_L), p(SH_R));
      poly(g, [{ x: n.x - u * 0.22, y: n.y + u * 0.35 }, p(SH_L), { x: c.x, y: c.y + u * 0.55 }, p(SH_R), { x: n.x + u * 0.22, y: n.y + u * 0.35 }]);
    },
    anchor: (p) => mid(p(EAR_R), p(SH_R), 0.5) },
  { keys: ["front_delts"], label: "Front delts", side: "front",
    draw: (g, p, u) => { blob(g, p(SH_L).x, p(SH_L).y + u * 0.12, u * 0.34, u * 0.30); blob(g, p(SH_R).x, p(SH_R).y + u * 0.12, u * 0.34, u * 0.30); },
    anchor: (p) => p(SH_R) },
  { keys: ["side_delts"], label: "Side delts", side: "front",
    draw: (g, p, u) => { blob(g, p(SH_L).x - u * 0.28, p(SH_L).y + u * 0.16, u * 0.22, u * 0.28); blob(g, p(SH_R).x + u * 0.28, p(SH_R).y + u * 0.16, u * 0.22, u * 0.28); },
    anchor: (p, u) => ({ x: p(SH_L).x - u * 0.3, y: p(SH_L).y }) },
  { keys: ["chest"], label: "Chest", side: "front",
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), bot = mid(p(HIP_L), p(HIP_R));
      poly(g, [p(SH_L), { x: c.x - u * 0.08, y: c.y + u * 0.30 }, { x: c.x - u * 0.06, y: c.y + u * 1.9 }, { x: p(SH_L).x + u * 0.15, y: mid(c, bot, 0.35).y }]);
      poly(g, [p(SH_R), { x: c.x + u * 0.08, y: c.y + u * 0.30 }, { x: c.x + u * 0.06, y: c.y + u * 1.9 }, { x: p(SH_R).x - u * 0.15, y: mid(c, bot, 0.35).y }]);
    },
    anchor: (p) => mid(p(SH_R), p(HIP_R), 0.3) },
  { keys: ["biceps"], label: "Biceps", side: "front",
    draw: (g, p, u) => { capsule(g, p(SH_L), p(EL_L), u * 0.21, 0.55, u * 0.10); capsule(g, p(SH_R), p(EL_R), u * 0.21, 0.55, -u * 0.10); },
    anchor: (p) => mid(p(SH_R), p(EL_R)) },
  { keys: ["triceps"], label: "Triceps", side: "back",
    draw: (g, p, u) => { capsule(g, p(SH_L), p(EL_L), u * 0.18, 0.5, -u * 0.16); capsule(g, p(SH_R), p(EL_R), u * 0.18, 0.5, u * 0.16); },
    anchor: (p) => mid(p(SH_L), p(EL_L)) },
  { keys: ["abs"], label: "Abs", side: "front",
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      const top = mid(c, h, 0.45), bot = mid(c, h, 0.92);
      for (let i = 0; i < 3; i++) {
        const y0 = top.y + (bot.y - top.y) * (i / 3), y1 = top.y + (bot.y - top.y) * ((i + 0.82) / 3);
        const w = u * (0.52 - i * 0.05);
        poly(g, [{ x: c.x - w, y: y0 }, { x: c.x + w, y: y0 }, { x: c.x + w * 0.9, y: y1 }, { x: c.x - w * 0.9, y: y1 }]);
      }
    },
    anchor: (p) => mid(mid(p(SH_L), p(SH_R)), mid(p(HIP_L), p(HIP_R)), 0.7) },
  { keys: ["obliques"], label: "Obliques", side: "front",
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R)), w = Math.abs(p(HIP_L).x - p(HIP_R).x) * 0.5;
      capsule(g, { x: c.x - w - u * 0.45, y: mid(c, h, 0.4).y }, { x: h.x - w, y: h.y }, u * 0.20);
      capsule(g, { x: c.x + w + u * 0.45, y: mid(c, h, 0.4).y }, { x: h.x + w, y: h.y }, u * 0.20);
    },
    anchor: (p) => mid(p(HIP_L), mid(p(SH_L), p(HIP_L))) },
  { keys: ["quads", "adductors", "hip_flexors"], label: "Quads", side: "front",
    draw: (g, p, u) => { capsule(g, p(HIP_L), p(KNEE_L), u * 0.34); capsule(g, p(HIP_R), p(KNEE_R), u * 0.34); },
    anchor: (p) => mid(p(HIP_R), p(KNEE_R), 0.4) },
  // ── back view ──
  { keys: ["rear_delts"], label: "Rear delts", side: "back",
    draw: (g, p, u) => { blob(g, p(SH_L).x + u * 0.1, p(SH_L).y + u * 0.1, u * 0.30, u * 0.26); blob(g, p(SH_R).x - u * 0.1, p(SH_R).y + u * 0.1, u * 0.30, u * 0.26); },
    anchor: (p) => p(SH_L) },
  { keys: ["lats"], label: "Lats", side: "back",
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      poly(g, [p(SH_L), { x: c.x - u * 0.15, y: mid(c, h, 0.55).y }, { x: h.x - u * 0.25, y: h.y - u * 0.3 }, { x: p(SH_L).x - u * 0.25, y: p(SH_L).y + u * 1.1 }]);
      poly(g, [p(SH_R), { x: c.x + u * 0.15, y: mid(c, h, 0.55).y }, { x: h.x + u * 0.25, y: h.y - u * 0.3 }, { x: p(SH_R).x + u * 0.25, y: p(SH_R).y + u * 1.1 }]);
    },
    anchor: (p) => mid(p(SH_L), p(HIP_L), 0.45) },
  { keys: ["erectors", "lower_traps", "mid_back"], label: "Erectors", side: "back",
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      capsule(g, { x: c.x, y: c.y + u * 0.9 }, h, u * 0.14, 0.5, -u * 0.16);
      capsule(g, { x: c.x, y: c.y + u * 0.9 }, h, u * 0.14, 0.5, u * 0.16);
    },
    anchor: (p) => mid(mid(p(SH_L), p(SH_R)), mid(p(HIP_L), p(HIP_R)), 0.75) },
  { keys: ["glutes"], label: "Glutes", side: "back",
    draw: (g, p, u) => { blob(g, p(HIP_L).x, p(HIP_L).y + u * 0.28, u * 0.38, u * 0.32); blob(g, p(HIP_R).x, p(HIP_R).y + u * 0.28, u * 0.38, u * 0.32); },
    anchor: (p) => p(HIP_L) },
  { keys: ["hamstrings"], label: "Hamstrings", side: "back",
    draw: (g, p, u) => { capsule(g, p(HIP_L), p(KNEE_L), u * 0.30); capsule(g, p(HIP_R), p(KNEE_R), u * 0.30); },
    anchor: (p) => mid(p(HIP_R), p(KNEE_R), 0.5) },
  { keys: ["gastroc", "soleus"], label: "Calves", side: "back",
    draw: (g, p, u) => { capsule(g, p(KNEE_L), p(ANK_L), u * 0.22, 0.35); capsule(g, p(KNEE_R), p(ANK_R), u * 0.22, 0.35); },
    anchor: (p) => mid(p(KNEE_R), p(ANK_R), 0.3) },
  { keys: ["tibialis"], label: "Shins", side: "front",
    draw: (g, p, u) => { capsule(g, p(KNEE_L), p(ANK_L), u * 0.14, 0.4); capsule(g, p(KNEE_R), p(ANK_R), u * 0.14, 0.4); },
    anchor: (p) => mid(p(KNEE_L), p(ANK_L), 0.4) },
];

type Stage = "idle" | "starting" | "live" | "error";

export default function XRayVisualizer({ keyFatigue, onClose }: {
  keyFatigue: Record<string, number>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const smoothRef = useRef<LM[] | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [labels, setLabels] = useState(true);
  const [dim, setDim] = useState(0.55);
  const dimRef = useRef(dim);
  const labelsRef = useRef(labels);
  const fatigueRef = useRef(keyFatigue);
  useEffect(() => { dimRef.current = dim; }, [dim]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { fatigueRef.current = keyFatigue; }, [keyFatigue]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setStage("starting");
    setErrMsg("");
    try {
      const [landmarker, stream] = await Promise.all([
        getPoseLandmarker(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setStage("live");
      runLoop(landmarker);
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setErrMsg(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "NotFoundError")
        ? "Camera access was denied — allow it in your browser settings and try again."
        : "Couldn't start the body tracker on this device.");
      setStage("error");
    }
  }

  function runLoop(landmarker: Awaited<ReturnType<typeof getPoseLandmarker>>) {
    let lastTime = -1;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current, canvas = canvasRef.current, stageEl = stageRef.current;
      if (!video || !canvas || !stageEl || video.readyState < 2) return;
      const r = stageEl.getBoundingClientRect();
      const W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, W, H);

      let raw: LM[] | null = null;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        try {
          const res = landmarker.detectForVideo(video, performance.now());
          raw = (res.landmarks?.[0] as LM[] | undefined) ?? null;
        } catch { raw = smoothRef.current; }
      } else raw = smoothRef.current;
      if (!raw) {
        drawHint(g, W, H);
        return;
      }

      // Smooth every tracked point so the glow doesn't jitter.
      const sm = smoothRef.current ?? raw.map((p) => ({ ...p }));
      raw.forEach((p, i) => {
        if (!sm[i]) { sm[i] = { ...p }; return; }
        sm[i].x += (p.x - sm[i].x) * 0.45;
        sm[i].y += (p.y - sm[i].y) * 0.45;
        sm[i].visibility = p.visibility;
      });
      smoothRef.current = sm;

      // Cover-fit the landmark coords to the stage the same way the video is covered.
      const vw = video.videoWidth || W, vh = video.videoHeight || H;
      const scale = Math.max(W / vw, H / vh);
      const ox = (W - vw * scale) / 2, oy = (H - vh * scale) / 2;
      // Mirror x here (like the video's scaleX(-1)) so canvas text stays readable.
      const px = (i: number): Pt => ({ x: W - ((sm[i]?.x ?? 0) * vw * scale + ox), y: (sm[i]?.y ?? 0) * vh * scale + oy });
      const vis = (i: number) => (sm[i]?.visibility ?? 0) > 0.3;
      const shoulderW = Math.abs(px(SH_L).x - px(SH_R).x);
      const u = Math.max(14, shoulderW * 0.5);
      const frontView = vis(NOSE) || (vis(EAR_L) && vis(EAR_R));

      // Veil: darken the body hull so the muscles read like an x-ray.
      const d = dimRef.current;
      if (d > 0.02) {
        g.fillStyle = `rgba(10,10,14,${(d * 0.85).toFixed(3)})`;
        const sL = px(SH_L), sR = px(SH_R), hL = px(HIP_L), hR = px(HIP_R);
        const earL = px(EAR_L), earR = px(EAR_R);
        g.save();
        // head
        if (vis(EAR_L) && vis(EAR_R)) { blob(g, mid(earL, earR).x, mid(earL, earR).y + u * 0.15, Math.abs(earL.x - earR.x) * 0.75, u * 0.9); g.fill(); }
        // torso hull
        poly(g, [sL, sR, { x: hR.x + u * 0.2, y: hR.y + u * 0.4 }, { x: hL.x - u * 0.2, y: hL.y + u * 0.4 }]); g.fill();
        // limbs
        for (const [a, b, w] of [[SH_L, EL_L, 0.42], [EL_L, WR_L, 0.3], [SH_R, EL_R, 0.42], [EL_R, WR_R, 0.3],
                                 [HIP_L, KNEE_L, 0.55], [KNEE_L, ANK_L, 0.4], [HIP_R, KNEE_R, 0.55], [KNEE_R, ANK_R, 0.4]] as const)
          if (vis(a) && vis(b)) { capsule(g, px(a), px(b), u * w); g.fill(); }
        g.restore();
      }

      // Muscle glow — additive-ish feel via shadowBlur + two passes.
      const fatigue = fatigueRef.current;
      g.save();
      g.globalCompositeOperation = "lighter";
      for (const r of REGIONS) {
        if (r.side !== "both" && ((r.side === "front") !== frontView)) continue;
        const f = Math.max(0, ...r.keys.map((k) => fatigue[k] ?? 0));
        const alpha = 0.34 + 0.30 * f;
        for (const pass of [0, 1] as const) {
          g.fillStyle = fatigueColor(f, pass === 0 ? alpha * 0.55 : alpha);
          g.shadowColor = fatigueColor(f, 0.8);
          g.shadowBlur = pass === 0 ? u * 0.5 : u * 0.12;
          r.draw(g, px, u);
          g.fill();
        }
        // rim
        g.shadowBlur = 0;
        g.strokeStyle = fatigueColor(f, 0.55);
        g.lineWidth = Math.max(1, u * 0.03);
        r.draw(g, px, u);
        g.stroke();
      }
      g.restore();

      if (labelsRef.current) drawLabels(g, px, u, frontView, fatigue, W);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function drawHint(g: CanvasRenderingContext2D, W: number, H: number) {
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = "600 14px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("Step back until your whole body is in frame", W / 2, H - 28);
  }

  function drawLabels(g: CanvasRenderingContext2D, px: (i: number) => Pt, u: number, frontView: boolean, fatigue: Record<string, number>, W: number) {
    const items: { text: string; color: string; ax: number; ay: number }[] = [];
    for (const r of REGIONS) {
      if (r.side !== "both" && ((r.side === "front") !== frontView)) continue;
      const f = Math.max(0, ...r.keys.map((k) => fatigue[k] ?? 0));
      const a = r.anchor(px, u);
      items.push({ text: `${r.label} ${Math.round(f * 100)}%`, color: fatigueColor(f, 0.95), ax: a.x, ay: a.y });
    }
    const midX = W / 2;
    const left = items.filter((i) => i.ax < midX).sort((a, b) => a.ay - b.ay);
    const right = items.filter((i) => i.ax >= midX).sort((a, b) => a.ay - b.ay);
    g.font = "600 11px system-ui, sans-serif";
    g.textBaseline = "middle";
    for (const [list, side] of [[left, -1], [right, 1]] as const) {
      const tx = side === -1 ? 10 : W - 10;
      let prev = -1e9;
      for (const it of list) {
        const ty = Math.max(it.ay, prev + 16); prev = ty;
        g.strokeStyle = it.color; g.globalAlpha = 0.55; g.lineWidth = 1;
        g.beginPath(); g.moveTo(it.ax, it.ay); g.lineTo(tx + (side === -1 ? 8 : -8), ty); g.stroke();
        g.globalAlpha = 1; g.fillStyle = it.color;
        g.beginPath(); g.arc(it.ax, it.ay, 2.4, 0, 6.3); g.fill();
        g.textAlign = side === -1 ? "left" : "right";
        g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 3;
        g.strokeText(it.text, tx + (side === -1 ? 10 : -10), ty);
        g.fillText(it.text, tx + (side === -1 ? 10 : -10), ty);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--color-paper)" }}>
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">✕</button>
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>Muscle recovery visualizer</h2>
          <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>Live camera · redder = less recovered · processed on-device</p>
        </div>
      </div>

      <div ref={stageRef} className="relative mx-4 flex-1 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", background: "#0a0a0e" }}>
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {stage !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "var(--color-paper)" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ color: "var(--color-accent)" }}>
              <rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5 21 8v8l-5-2.5" />
            </svg>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>See your recovery on your own body</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                Step back so your full body is in frame. Muscles glow in their recovery
                color — turn around for the back. Video never leaves your device.
              </p>
            </div>
            {stage === "error" && <p className="max-w-xs text-xs" style={{ color: "#c96b45" }}>{errMsg}</p>}
            <button type="button" onClick={start} disabled={stage === "starting"}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-paper)", opacity: stage === "starting" ? 0.6 : 1 }}>
              {stage === "starting" ? "Loading body tracker…" : stage === "error" ? "Try again" : "Start camera"}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink)" }}>
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Labels
        </label>
        <label className="flex flex-1 items-center gap-2 text-xs" style={{ color: "var(--color-ink)" }}>
          <span style={{ color: "var(--color-ink-muted)" }}>Dim body</span>
          <input type="range" min={0} max={1} step={0.01} value={dim} onChange={(e) => setDim(parseFloat(e.target.value))} className="flex-1" />
        </label>
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#7fbf6b" }} />fresh
          <i className="ml-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#8e3419" }} />sore
        </span>
      </div>
    </div>
  );
}
