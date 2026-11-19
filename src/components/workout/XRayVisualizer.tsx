/**
 * X-Ray visualizer — a real anatomy mirror for Waqt.
 *
 * Face in frame  → a real skull / brain / facial-muscle / eye model pinned to
 *                  your head (BodyParts3D mesh data + MediaPipe FaceLandmarker,
 *                  auto-fit to the screen).
 * Hands in frame → articulated real hand bones from HandLandmarker.
 * Body only      → muscle regions painted on your silhouette, colored by real
 *                  recovery data (the original muscle-recovery overlay).
 *
 * Everything runs on-device: models and meshes are self-hosted under
 * /models and /xray (service-worker cached), no video leaves the phone.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { XRayEngine, type XRayMeta, type Lm } from "@/lib/workout/xray-anatomy";

const POSE_MODELS = ["/models/pose/pose_landmarker_full.task", "/models/pose/pose_landmarker_lite.task"];

async function visionBundle() {
  const vision = await import("@mediapipe/tasks-vision");
  return vision.FilesetResolver.forVisionTasks("/mediapipe/wasm").then((files) => ({ vision, files }));
}

/** Pose landmarker with the person-segmentation mask (body fallback view). */
async function loadSegLandmarker(): Promise<PoseLandmarker> {
  const { vision, files } = await visionBundle();
  let lastErr: unknown = null;
  for (const delegate of ["GPU", "CPU"] as const)
    for (const modelAssetPath of POSE_MODELS) {
      try {
        return await vision.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
          minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
        });
      } catch (err) { lastErr = err; }
    }
  throw lastErr ?? new Error("pose model unavailable");
}

async function loadFaceTracker(): Promise<FaceLandmarker> {
  const { vision, files } = await visionBundle();
  let lastErr: unknown = null;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      return await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/face/face_landmarker.task", delegate },
        runningMode: "VIDEO", numFaces: 1,
        outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true,
      });
    } catch (err) { lastErr = err; }
  }
  throw lastErr ?? new Error("face model unavailable");
}

async function loadHandTracker(): Promise<HandLandmarker | null> {
  const { vision, files } = await visionBundle();
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      return await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/hand/hand_landmarker.task", delegate },
        runningMode: "VIDEO", numHands: 2,
      });
    } catch { /* hands are optional */ }
  }
  return null;
}

type LM = { x: number; y: number; z?: number; visibility?: number };
type Pt = { x: number; y: number };

// Pose landmark indices (body fallback view).
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

const mid = (a: Pt, b: Pt, k = 0.5): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

function blob(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  g.beginPath(); g.ellipse(cx, cy, Math.max(2, rx), Math.max(2, ry), rot, 0, Math.PI * 2); g.closePath();
}
function capsule(g: CanvasRenderingContext2D, a: Pt, b: Pt, halfW: number, along = 0.5, off = 0) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const s = { x: a.x + dx * along + nx * off, y: a.y + dy * along + ny * off };
  const e = { x: a.x + dx * along - nx * off, y: a.y + dy * along - ny * off };
  g.beginPath();
  g.moveTo(s.x + nx * halfW, s.y + ny * halfW);
  g.lineTo(e.x + nx * halfW, e.y + ny * halfW);
  g.arc(e.x, e.y, halfW, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  g.lineTo(s.x - nx * halfW, s.y - ny * halfW);
  g.arc(s.x, s.y, halfW, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
  g.closePath();
}
function poly(g: CanvasRenderingContext2D, pts: Pt[]) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

interface Region { keys: string[]; label: string; side: "front" | "back" | "both"; need: number[]; draw: (g: CanvasRenderingContext2D, p: (i: number) => Pt, u: number) => void }

const REGIONS: Region[] = [
  { keys: ["neck"], label: "Neck", side: "both", need: [EAR_L, EAR_R, SH_L, SH_R],
    draw: (g, p, u) => { const n = mid(p(EAR_L), p(EAR_R)), s = mid(p(SH_L), p(SH_R)); blob(g, mid(n, s, 0.4).x, mid(n, s, 0.4).y, u * 0.24, u * 0.30); } },
  { keys: ["forearms", "grip"], label: "Forearm", side: "both", need: [EL_L, WR_L, EL_R, WR_R],
    draw: (g, p, u) => { capsule(g, p(EL_L), p(WR_L), u * 0.20); capsule(g, p(EL_R), p(WR_R), u * 0.20); } },
  { keys: ["upper_traps"], label: "Traps", side: "front", need: [EAR_L, EAR_R, SH_L, SH_R],
    draw: (g, p, u) => {
      const n = mid(p(EAR_L), p(EAR_R)), c = mid(p(SH_L), p(SH_R));
      poly(g, [{ x: n.x - u * 0.22, y: n.y + u * 0.35 }, p(SH_L), { x: c.x, y: c.y + u * 0.55 }, p(SH_R), { x: n.x + u * 0.22, y: n.y + u * 0.35 }]);
    } },
  { keys: ["front_delts"], label: "Front delts", side: "front", need: [SH_L, SH_R],
    draw: (g, p, u) => { blob(g, p(SH_L).x, p(SH_L).y + u * 0.12, u * 0.34, u * 0.30); blob(g, p(SH_R).x, p(SH_R).y + u * 0.12, u * 0.34, u * 0.30); } },
  { keys: ["side_delts"], label: "Side delts", side: "front", need: [SH_L, SH_R],
    draw: (g, p, u) => { blob(g, p(SH_L).x - u * 0.28, p(SH_L).y + u * 0.16, u * 0.22, u * 0.28); blob(g, p(SH_R).x + u * 0.28, p(SH_R).y + u * 0.16, u * 0.22, u * 0.28); } },
  { keys: ["chest"], label: "Chest", side: "front", need: [SH_L, SH_R, HIP_L, HIP_R],
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), bot = mid(p(HIP_L), p(HIP_R));
      poly(g, [p(SH_L), { x: c.x - u * 0.08, y: c.y + u * 0.30 }, { x: c.x - u * 0.06, y: c.y + u * 1.9 }, { x: p(SH_L).x + u * 0.15, y: mid(c, bot, 0.35).y }]);
      poly(g, [p(SH_R), { x: c.x + u * 0.08, y: c.y + u * 0.30 }, { x: c.x + u * 0.06, y: c.y + u * 1.9 }, { x: p(SH_R).x - u * 0.15, y: mid(c, bot, 0.35).y }]);
    } },
  { keys: ["biceps"], label: "Biceps", side: "front", need: [SH_L, EL_L, SH_R, EL_R],
    draw: (g, p, u) => { capsule(g, p(SH_L), p(EL_L), u * 0.21, 0.55, u * 0.10); capsule(g, p(SH_R), p(EL_R), u * 0.21, 0.55, -u * 0.10); } },
  { keys: ["triceps"], label: "Triceps", side: "back", need: [SH_L, EL_L, SH_R, EL_R],
    draw: (g, p, u) => { capsule(g, p(SH_L), p(EL_L), u * 0.18, 0.5, -u * 0.16); capsule(g, p(SH_R), p(EL_R), u * 0.18, 0.5, u * 0.16); } },
  { keys: ["abs"], label: "Abs", side: "front", need: [SH_L, SH_R, HIP_L, HIP_R],
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      const top = mid(c, h, 0.45), bot = mid(c, h, 0.92);
      for (let i = 0; i < 3; i++) {
        const y0 = top.y + (bot.y - top.y) * (i / 3), y1 = top.y + (bot.y - top.y) * ((i + 0.82) / 3);
        const w = u * (0.52 - i * 0.05);
        poly(g, [{ x: c.x - w, y: y0 }, { x: c.x + w, y: y0 }, { x: c.x + w * 0.9, y: y1 }, { x: c.x - w * 0.9, y: y1 }]);
      }
    } },
  { keys: ["obliques"], label: "Obliques", side: "front", need: [SH_L, SH_R, HIP_L, HIP_R],
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R)), w = Math.abs(p(HIP_L).x - p(HIP_R).x) * 0.5;
      capsule(g, { x: c.x - w - u * 0.45, y: mid(c, h, 0.4).y }, { x: h.x - w, y: h.y }, u * 0.20);
      capsule(g, { x: c.x + w + u * 0.45, y: mid(c, h, 0.4).y }, { x: h.x + w, y: h.y }, u * 0.20);
    } },
  { keys: ["quads", "adductors", "hip_flexors"], label: "Quads", side: "front", need: [HIP_L, KNEE_L, HIP_R, KNEE_R],
    draw: (g, p, u) => { capsule(g, p(HIP_L), p(KNEE_L), u * 0.34); capsule(g, p(HIP_R), p(KNEE_R), u * 0.34); } },
  { keys: ["rear_delts"], label: "Rear delts", side: "back", need: [SH_L, SH_R],
    draw: (g, p, u) => { blob(g, p(SH_L).x + u * 0.1, p(SH_L).y + u * 0.1, u * 0.30, u * 0.26); blob(g, p(SH_R).x - u * 0.1, p(SH_R).y + u * 0.1, u * 0.30, u * 0.26); } },
  { keys: ["lats"], label: "Lats", side: "back", need: [SH_L, SH_R, HIP_L, HIP_R],
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      poly(g, [p(SH_L), { x: c.x - u * 0.15, y: mid(c, h, 0.55).y }, { x: h.x - u * 0.25, y: h.y - u * 0.3 }, { x: p(SH_L).x - u * 0.25, y: p(SH_L).y + u * 1.1 }]);
      poly(g, [p(SH_R), { x: c.x + u * 0.15, y: mid(c, h, 0.55).y }, { x: h.x + u * 0.25, y: h.y - u * 0.3 }, { x: p(SH_R).x + u * 0.25, y: p(SH_R).y + u * 1.1 }]);
    } },
  { keys: ["erectors", "lower_traps", "mid_back"], label: "Erectors", side: "back", need: [SH_L, SH_R, HIP_L, HIP_R],
    draw: (g, p, u) => {
      const c = mid(p(SH_L), p(SH_R)), h = mid(p(HIP_L), p(HIP_R));
      capsule(g, { x: c.x, y: c.y + u * 0.9 }, h, u * 0.14, 0.5, -u * 0.16);
      capsule(g, { x: c.x, y: c.y + u * 0.9 }, h, u * 0.14, 0.5, u * 0.16);
    } },
  { keys: ["glutes"], label: "Glutes", side: "back", need: [HIP_L, HIP_R],
    draw: (g, p, u) => { blob(g, p(HIP_L).x, p(HIP_L).y + u * 0.28, u * 0.38, u * 0.32); blob(g, p(HIP_R).x, p(HIP_R).y + u * 0.28, u * 0.38, u * 0.32); } },
  { keys: ["hamstrings"], label: "Hamstrings", side: "back", need: [HIP_L, KNEE_L, HIP_R, KNEE_R],
    draw: (g, p, u) => { capsule(g, p(HIP_L), p(KNEE_L), u * 0.30); capsule(g, p(HIP_R), p(KNEE_R), u * 0.30); } },
  { keys: ["gastroc", "soleus"], label: "Calves", side: "back", need: [KNEE_L, ANK_L, KNEE_R, ANK_R],
    draw: (g, p, u) => { capsule(g, p(KNEE_L), p(ANK_L), u * 0.22, 0.35); capsule(g, p(KNEE_R), p(ANK_R), u * 0.22, 0.35); } },
  { keys: ["tibialis"], label: "Shins", side: "front", need: [KNEE_L, ANK_L, KNEE_R, ANK_R],
    draw: (g, p, u) => { capsule(g, p(KNEE_L), p(ANK_L), u * 0.14, 0.4); capsule(g, p(KNEE_R), p(ANK_R), u * 0.14, 0.4); } },
];

type Stage = "idle" | "starting" | "live" | "error";
type LayerKey = "skull" | "brain" | "muscles" | "eyes" | "hands" | "outline";
const LAYERS: [LayerKey, string][] = [["skull", "Skull"], ["brain", "Brain"], ["muscles", "Face muscles"], ["eyes", "Eyes"], ["hands", "Hands"], ["outline", "Outline"]];

const SETTINGS_KEY = "waqt-xray-v2";
interface Prefs { layers: Record<LayerKey, boolean>; labels: boolean; solid: boolean; lens: boolean; real: number }
const DEFAULT_PREFS: Prefs = {
  layers: { skull: true, brain: false, muscles: false, eyes: true, hands: true, outline: true },
  labels: true, solid: false, lens: false, real: 0.3,
};

export default function XRayVisualizer({ keyFatigue, onClose }: {
  keyFatigue: Record<string, number>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bodyRef = useRef<HTMLCanvasElement>(null);   // muscle-recovery overlay
  const shadeRef = useRef<HTMLCanvasElement>(null);  // dark veil under hand bones
  const glRef = useRef<HTMLCanvasElement>(null);     // WebGL anatomy
  const hudRef = useRef<HTMLCanvasElement>(null);    // labels + lens ring (unmirrored)
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const engineRef = useRef<XRayEngine | null>(null);
  const trackersRef = useRef<{ face: FaceLandmarker; hand: HandLandmarker | null; pose: PoseLandmarker } | null>(null);
  const smoothRef = useRef<LM[] | null>(null);
  const silRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<Pt | null>(null);
  const lastStatusRef = useRef("");

  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"), layers: { ...DEFAULT_PREFS.layers, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Prefs>).layers } }; }
    catch { return DEFAULT_PREFS; }
  });

  const prefsRef = useRef(prefs);
  const facingRef = useRef(facing);
  const fatigueRef = useRef(keyFatigue);
  useEffect(() => { prefsRef.current = prefs; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs)); } catch { /* noop */ } }, [prefs]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { fatigueRef.current = keyFatigue; }, [keyFatigue]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    engineRef.current?.dispose();
  }, []);

  const setStatusOnce = (t: string) => { if (lastStatusRef.current !== t) { lastStatusRef.current = t; setStatus(t); } };

  /** video-normalized coords → stage-normalized (cover-fit + the canvas is
   *  drawn unmirrored and CSS-flipped, same as the video). */
  const coverMap = (video: HTMLVideoElement, W: number, H: number) => {
    const vw = video.videoWidth || W, vh = video.videoHeight || H;
    const sc = Math.max(W / vw, H / vh);
    const ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
    return (lms: LM[]): LM[] => lms.map((p) => ({
      x: (p.x * vw * sc + ox) / W, y: (p.y * vh * sc + oy) / H, z: p.z, visibility: p.visibility,
    }));
  };

  async function start() {
    setStage("starting");
    setErrMsg("");
    try {
      setStatusOnce("asking for the camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      setStatusOnce("loading anatomy + trackers…");
      const [THREE, meta, b64, face, hand, pose] = await Promise.all([
        import("three"),
        fetch("/xray/meshmeta.json").then((r) => r.json()) as Promise<XRayMeta>,
        fetch("/xray/meshdata.b64").then((r) => r.text()),
        loadFaceTracker(),
        loadHandTracker(),
        loadSegLandmarker().catch(() => null),
      ]);
      const engine = new XRayEngine(THREE, meta);
      engine.build(glRef.current!, b64);
      engineRef.current = engine;
      if (!pose) { /* body overlay unavailable — head/hands still work */ }
      trackersRef.current = { face, hand, pose: pose as PoseLandmarker };
      setStage("live");
      runLoop();
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setErrMsg(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "NotFoundError")
        ? "Camera access was denied — allow it and try again."
        : "Couldn't start the visualizer on this device.");
      setStage("error");
    }
  }

  async function switchCamera() {
    const next = facingRef.current === "user" ? "environment" : "user";
    setFacing(next);
    facingRef.current = next;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
      smoothRef.current = null;
      if (engineRef.current) { engineRef.current.headLost(); engineRef.current.mirror = next === "user"; }
    } catch { /* keep the old camera if the flip failed */ }
  }

  function runLoop() {
    let lastTime = -1, maskFrame = 0, lostAt = 0;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current, stageEl = stageRef.current, engine = engineRef.current;
      const tr = trackersRef.current;
      if (!video || !stageEl || !engine || !tr || video.readyState < 2) return;
      const r = stageEl.getBoundingClientRect();
      const W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
      engine.resize(W, H);
      for (const c of [bodyRef.current, shadeRef.current, hudRef.current])
        if (c && (c.width !== W || c.height !== H)) { c.width = W; c.height = H; }
      const shadeG = shadeRef.current?.getContext("2d");
      const hudG = hudRef.current?.getContext("2d");
      const bodyG = bodyRef.current?.getContext("2d");
      if (!shadeG || !hudG || !bodyG) return;
      bodyG.clearRect(0, 0, W, H);

      const P = prefsRef.current;
      engine.mirror = facingRef.current === "user";
      engine.S.skull = P.layers.skull; engine.S.brain = P.layers.brain;
      engine.S.muscles = P.layers.muscles; engine.S.eyes = P.layers.eyes;
      engine.S.outline = P.layers.outline; engine.S.hands = P.layers.hands;
      engine.S.labels = P.labels;
      engine.S.reveal = P.lens ? "lens" : "full";
      engine.S.style = P.solid ? "solid" : "xray";
      engine.S.real = P.real;

      if (video.currentTime === lastTime) {
        // reuse last frame's detections — nothing new to see
        return;
      }
      lastTime = video.currentTime;
      const now = performance.now();
      const map = coverMap(video, W, H);

      let faceLms: Lm[] | null = null;
      const hands: Lm[][] = [], sides: boolean[] = [];
      try {
        const fr = tr.face.detectForVideo(video, now);
        const rawFace = fr.faceLandmarks?.[0];
        const mat = fr.facialTransformationMatrixes?.[0];
        if (rawFace && mat) {
          faceLms = map(rawFace as Lm[]);
          let jaw = 0;
          const bs = fr.faceBlendshapes?.[0];
          if (bs) for (const c of bs.categories) if (c.categoryName === "jawOpen") jaw = c.score;
          engine.updateHead(mat.data, faceLms, jaw);
          lostAt = 0;
        } else {
          if (!lostAt) lostAt = now;
          if (now - lostAt > 250) engine.headLost();
        }
        if (tr.hand) {
          const hr = tr.hand.detectForVideo(video, now);
          const hl = hr.landmarks ?? [];
          const hd = (hr as { handedness?: { categoryName: string }[][] }).handedness ?? [];
          for (let i = 0; i < hl.length; i++) {
            hands.push(map(hl[i] as Lm[]));
            // tracker names hands for a mirrored picture; flip for rear camera
            const left = hd[i]?.[0]?.categoryName === "Left";
            sides.push(engine.mirror ? left : !left);
          }
        }
      } catch { /* trackers hiccup — keep last state */ }

      // Body muscle overlay only when no face is in frame.
      let bodyShown = false;
      if (!engine.headVisible && tr.pose) {
        try {
          const res = tr.pose.detectForVideo(video, now);
          const raw = (res.landmarks?.[0] as LM[] | undefined) ?? smoothRef.current;
          const mask = res.segmentationMasks?.[0];
          if (mask) {
            if (maskFrame++ % 2 === 0) {
              const mw = mask.width, mh = mask.height;
              const sil = silRef.current ?? (silRef.current = document.createElement("canvas"));
              if (sil.width !== mw || sil.height !== mh) { sil.width = mw; sil.height = mh; }
              const sctx = sil.getContext("2d");
              if (sctx) {
                const conf = mask.getAsFloat32Array();
                const img = sctx.createImageData(mw, mh);
                const d32 = img.data;
                for (let i = 0; i < conf.length; i++) {
                  d32[i * 4] = d32[i * 4 + 1] = d32[i * 4 + 2] = 255;
                  d32[i * 4 + 3] = Math.min(255, conf[i] * 340);
                }
                sctx.putImageData(img, 0, 0);
              }
            }
            mask.close();
          }
          if (raw) bodyShown = drawBodyOverlay(bodyG, map(raw), W, H);
        } catch { /* pose hiccup */ }
      }

      const maskCss = engine.renderFrame(shadeG, hudG, faceLms, hands, sides, pointerRef.current);
      for (const c of [shadeRef.current, glRef.current]) {
        if (!c) continue;
        c.style.maskImage = maskCss ?? "none";
        (c.style as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage = maskCss ?? "none";
      }

      setStatusOnce(
        engine.headVisible ? (hands.length ? "Head + hands tracked" : "Head tracked")
        : hands.length ? "Hand bones on — face the camera for the head"
        : bodyShown ? "Muscles on — come closer for head anatomy"
        : "No tracking — face the camera or step back",
      );
    };
    tick();
  }

  /** The original muscle-recovery overlay (pose-anchored regions clipped to
   *  the segmentation silhouette). Drawn in display space: mirrored like the
   *  front camera image. Returns true when anything was drawn. */
  function drawBodyOverlay(g: CanvasRenderingContext2D, raw: LM[], W: number, H: number): boolean {
    // Smooth landmarks.
    const sm = smoothRef.current ?? raw.map((p) => ({ ...p }));
    raw.forEach((p, i) => {
      if (!sm[i]) { sm[i] = { ...p }; return; }
      sm[i].x += (p.x - sm[i].x) * 0.45;
      sm[i].y += (p.y - sm[i].y) * 0.45;
      sm[i].visibility = p.visibility;
    });
    smoothRef.current = sm;
    const mir = facingRef.current === "user";
    const px = (i: number): Pt => ({ x: (mir ? 1 - sm[i].x : sm[i].x) * W, y: sm[i].y * H });
    const vis = (i: number) => (sm[i]?.visibility ?? 0) > 0.3;
    if (!vis(SH_L) && !vis(SH_R) && !vis(NOSE)) return false;

    const shoulderW = Math.abs(px(SH_L).x - px(SH_R).x);
    const earW = Math.abs(px(EAR_L).x - px(EAR_R).x);
    const headOnly = !vis(SH_L) && !vis(SH_R) && (vis(NOSE) || earW > 8);
    const u = headOnly ? Math.max(14, earW * 0.45) : Math.max(14, shoulderW * 0.5);
    const frontView = vis(NOSE) || (vis(EAR_L) && vis(EAR_R));
    const fatigue = fatigueRef.current;

    const sc = scratchRef.current ?? (scratchRef.current = document.createElement("canvas"));
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; }
    const sg = sc.getContext("2d");
    if (!sg) return false;
    sg.clearRect(0, 0, W, H);

    const drawSil = () => {
      const sil = silRef.current;
      if (!sil) return;
      const vw = videoRef.current?.videoWidth || W, vh = videoRef.current?.videoHeight || H;
      const scv = Math.max(W / vw, H / vh);
      sg.save();
      if (mir) { sg.translate(W, 0); sg.scale(-1, 1); }
      sg.drawImage(sil, (W - vw * scv) / 2, (H - vh * scv) / 2, vw * scv, vh * scv);
      sg.restore();
    };

    // Veil: dim only the real body.
    sg.save();
    sg.fillStyle = "rgba(6,8,14,0.42)";
    sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = "destination-in";
    drawSil();
    sg.restore();

    sg.save();
    const pulse = 1 + 0.16 * Math.sin(performance.now() / 450);
    if (headOnly) {
      const f = fatigue.neck ?? 0;
      const chinY = mid(px(EAR_L), px(EAR_R)).y + u * 1.1;
      const nx = mid(px(EAR_L), px(EAR_R)).x;
      const alpha = Math.min(1, (0.30 + 0.35 * f) * (f > 0.3 ? pulse : 1));
      sg.fillStyle = fatigueColor(f, alpha * 0.35);
      sg.shadowColor = fatigueColor(f, 0.7);
      sg.shadowBlur = u * 0.35;
      capsule(sg, { x: nx, y: chinY - u * 0.3 }, { x: nx, y: chinY + u * 2.2 }, u * 0.42);
      sg.fill();
      sg.shadowBlur = 0;
      sg.fillStyle = fatigueColor(f, alpha);
      capsule(sg, { x: nx, y: chinY - u * 0.3 }, { x: nx, y: chinY + u * 2.2 }, u * 0.42);
      sg.fill();
    }
    for (const r of REGIONS) {
      if ((r.side !== "both" && (r.side === "front") !== frontView) || !r.need.every((i) => vis(i))) continue;
      const f = Math.max(0, ...r.keys.map((k) => fatigue[k] ?? 0));
      const alpha = Math.min(1, (0.30 + 0.35 * f) * (f > 0.3 ? pulse : 1));
      sg.fillStyle = fatigueColor(f, alpha * 0.35);
      sg.shadowColor = fatigueColor(f, 0.7);
      sg.shadowBlur = u * 0.35;
      r.draw(sg, px, u);
      sg.fill();
      sg.shadowBlur = 0;
      sg.fillStyle = fatigueColor(f, alpha);
      r.draw(sg, px, u);
      sg.fill();
      sg.strokeStyle = fatigueColor(f, 0.6);
      sg.lineWidth = Math.max(1, u * 0.03);
      r.draw(sg, px, u);
      sg.stroke();
    }
    sg.restore();

    sg.save();
    sg.globalCompositeOperation = "destination-in";
    drawSil();
    sg.restore();
    g.drawImage(sc, 0, 0);

    if (headOnly) {
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.font = "600 11px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("step back for body muscles — closer for head anatomy", W / 2, H - 14);
    }
    return true;
  }

  async function snapshot() {
    const video = videoRef.current;
    if (!video) return;
    const W = hudRef.current?.width ?? 0, H = hudRef.current?.height ?? 0;
    if (!W || !H) return;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const g = out.getContext("2d")!;
    const mir = facingRef.current === "user";
    const vw = video.videoWidth || W, vh = video.videoHeight || H;
    const sc = Math.max(W / vw, H / vh);
    g.save();
    if (mir) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(video, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc);
    for (const c of [bodyRef.current, shadeRef.current, glRef.current]) if (c) g.drawImage(c, 0, 0);
    g.restore();
    if (hudRef.current) g.drawImage(hudRef.current, 0, 0);
    const a = document.createElement("a");
    a.download = `waqt-xray-${new Date().toISOString().slice(0, 10)}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  }

  const mir = facing === "user";
  const flip = mir ? "scaleX(-1)" : "none";
  const chip = (on: boolean) => ({
    background: on ? "var(--color-accent)" : "var(--color-paper)",
    color: on ? "var(--color-paper)" : "var(--color-ink-muted)",
  });

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--color-paper)" }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">✕</button>
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>X-ray visualizer</h2>
          <p className="truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            {stage === "live" ? status : "Real anatomy, live · on-device · nothing uploaded"}
          </p>
        </div>
        {stage === "live" && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={snapshot} aria-label="Save a picture"
              className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
              Save
            </button>
            <button type="button" onClick={switchCamera} aria-label="Switch camera"
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7h-3l-1.5-2h-7L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><circle cx="12" cy="13" r="3" />
              </svg>
              Flip
            </button>
          </div>
        )}
      </div>

      {/* stage */}
      <div ref={stageRef}
        className="relative mx-3 flex-1 touch-none overflow-hidden rounded-2xl border sm:mx-4"
        style={{ borderColor: "var(--color-paper-3)", background: "#07090f" }}
        onPointerMove={(e) => { const r = stageRef.current!.getBoundingClientRect(); pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }}
        onPointerLeave={() => { pointerRef.current = null; }}>
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: flip }} />
        <canvas ref={bodyRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <canvas ref={shadeRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: flip }} />
        <canvas ref={glRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: flip }} />
        <canvas ref={hudRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {stage !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center" style={{ background: "var(--color-paper)" }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
              <circle cx="12" cy="8" r="5" /><path d="M12 13v3M9.5 17.5h5M8 21h8" />
            </svg>
            <div className="max-w-sm">
              <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>A real x-ray mirror</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                Hold the camera to your face — a real skull, brain and facial muscles
                track your head. Show a hand for its bones. Step back and muscle
                recovery colors paint your whole body. Everything runs on-device.
              </p>
            </div>
            {stage === "error" && <p className="max-w-xs text-xs" style={{ color: "#c96b45" }}>{errMsg}</p>}
            <button type="button" onClick={start} disabled={stage === "starting"}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-paper)", opacity: stage === "starting" ? 0.6 : 1 }}>
              {stage === "starting" ? "Loading anatomy…" : stage === "error" ? "Try again" : "Start camera"}
            </button>
          </div>
        )}
      </div>

      {/* controls — scrollable chip row, thumb-friendly on mobile */}
      <div className="px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {LAYERS.map(([k, t]) => (
            <button key={k} type="button"
              onClick={() => setPrefs((p) => ({ ...p, layers: { ...p.layers, [k]: !p.layers[k] } }))}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", ...chip(prefs.layers[k]) }}>
              {t}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--color-paper-3)" }} />
          {([["labels", "Labels", prefs.labels], ["solid", "Solid", prefs.solid], ["lens", "Lens", prefs.lens]] as const).map(([k, t, on]) => (
            <button key={k} type="button"
              onClick={() => setPrefs((p) => ({ ...p, [k]: !p[k] }))}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", ...chip(on) }}>
              {t}
            </button>
          ))}
          <label className="ml-1 flex min-w-[7.5rem] shrink-0 items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            show me
            <input type="range" min={0} max={1} step={0.01} value={prefs.real}
              onChange={(e) => setPrefs((p) => ({ ...p, real: parseFloat(e.target.value) }))}
              className="w-16 flex-1" />
          </label>
        </div>
        <p className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: "#7fbf6b" }} />recovered
          <i className="ml-1 inline-block h-2 w-2 rounded-full" style={{ background: "#8e3419" }} />sore
          <span className="ml-auto">BodyParts3D anatomy · CC BY-SA 2.1</span>
        </p>
      </div>
    </div>
  );
}
