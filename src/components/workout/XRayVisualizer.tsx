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

async function loadFaceTracker(withMatrixes = true): Promise<FaceLandmarker> {
  const { vision, files } = await visionBundle();
  let lastErr: unknown = null;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      return await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/face/face_landmarker.task", delegate },
        runningMode: "VIDEO", numFaces: 1,
        outputFacialTransformationMatrixes: withMatrixes, outputFaceBlendshapes: true,
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

/** Degenerate landmark sets (all points nearly coincident, or off-frame)
 *  crash MediaPipe's face-geometry solver — sanity-check before using. */
function faceIsSane(lms: Lm[]): boolean {
  if (lms.length < 10) return false;
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0, nan = false;
  for (const p of lms) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { nan = true; break; }
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  if (nan) return false;
  return (x1 - x0) > 0.02 && (y1 - y0) > 0.02;
}

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

const SETTINGS_KEY = "waqt-xray-v3";
type RevealMode = "full" | "lens" | "left" | "right" | "top" | "bottom";
interface Prefs {
  layers: Record<LayerKey, boolean>; labels: boolean; solid: boolean; reveal: RevealMode;
  real: number; bright: number; feather: number; cut: number; size: number; offX: number; offY: number;
}
const DEFAULT_PREFS: Prefs = {
  layers: { skull: true, brain: false, muscles: false, eyes: true, hands: true, outline: true },
  labels: true, solid: false, reveal: "full", real: 0.3,
  bright: 1, feather: 0.2, cut: 0.5, size: 1, offX: 0, offY: 0,
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
  const trackersRef = useRef<{ face: FaceLandmarker; faceHasMat: boolean; hand: HandLandmarker | null; pose: PoseLandmarker | null } | null>(null);
  const smoothRef = useRef<LM[] | null>(null);
  const silRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<Pt | null>(null);
  const lastStatusRef = useRef("");
  const faceFails = useRef(0);
  const lastFaceRebuild = useRef(0);

  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [frozen, setFrozen] = useState<string | null>(null);
  const frozenRef = useRef<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Prefs> & { lens?: boolean };
      const reveal: RevealMode = raw.reveal ?? (raw.lens ? "lens" : "full");
      return { ...DEFAULT_PREFS, ...raw, reveal, layers: { ...DEFAULT_PREFS.layers, ...raw.layers } };
    }
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

  /** The stage is sized to the video's own aspect ratio, so tracker coords
   *  map 1:1 — no cover-crop remapping at all (same trick as the reference). */
  const [ar, setAr] = useState(4 / 3);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => { if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight); };
    v.addEventListener("loadedmetadata", update);
    v.addEventListener("playing", update);
    return () => { v.removeEventListener("loadedmetadata", update); v.removeEventListener("playing", update); };
  }, [stage]);

  async function start() {
    setStage("starting");
    setErrMsg("");
    try {
      setStatusOnce("asking for the camera…");
      // Phones get a smaller feed — same tracking quality, far less CPU +
      // decode work per frame.
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: small ? 640 : 1280 }, height: { ideal: small ? 480 : 720 } }, audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      setStatusOnce("loading anatomy + face tracker…");
      // Staggered load: get head tracking live with the essentials only, then
      // attach hand + pose models in the background. On phones the parallel
      // ~50MB load + three GPU contexts is what made this screen die or sit
      // on "loading" forever.
      const [THREE, meta, b64, face] = await Promise.all([
        import("three"),
        fetch("/xray/meshmeta.json").then((r) => r.json()) as Promise<XRayMeta>,
        fetch("/xray/meshdata.b64").then((r) => r.text()),
        loadFaceTracker(),
      ]);
      const engine = new XRayEngine(THREE, meta);
      engine.build(glRef.current!, b64);
      engineRef.current = engine;
      trackersRef.current = { face, faceHasMat: true, hand: null, pose: null };
      setStage("live");
      runLoop();
      setStatusOnce("loading hand + body trackers…");
      void Promise.all([loadHandTracker(), loadSegLandmarker().catch(() => null)]).then(([hand, pose]) => {
        if (trackersRef.current) trackersRef.current = { ...trackersRef.current, hand, pose };
      }).catch(() => { /* head tracking still works without them */ });
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setErrMsg(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "NotFoundError")
        ? "Camera access was denied — allow it and try again."
        : `Couldn't start the visualizer on this device (${e instanceof Error ? e.message : String(e)}).`);
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
      engine.S.reveal = P.reveal;
      engine.S.style = P.solid ? "solid" : "xray";
      engine.S.real = P.real;
      engine.S.bright = P.bright;
      engine.S.feather = P.feather; engine.S.cut = P.cut;
      engine.S.size = P.size; engine.S.offX = P.offX; engine.S.offY = P.offY;

      if (frozenRef.current || video.currentTime === lastTime) {
        // frozen preview on top / no new frame — nothing new to see
        return;
      }
      lastTime = video.currentTime;
      const now = performance.now();

      let faceLms: Lm[] | null = null;
      const hands: Lm[][] = [], sides: boolean[] = [];
      const frameReady = video.videoWidth > 0 && video.currentTime > 0;

      // Face geometry can throw on degenerate frames (face clipped at the
      // frame edge, zero-variance landmarks). Contain it per-detector so one
      // bad frame kills nothing else — the next frame just tries again.
      if (frameReady) {
        try {
          const fr = tr.face.detectForVideo(video, now);
          const rawFace = fr.faceLandmarks?.[0];
          const mat = fr.facialTransformationMatrixes?.[0];
          if (rawFace && faceIsSane(rawFace as Lm[])) {
            faceLms = rawFace as Lm[];
            let jaw = 0;
            const bs = fr.faceBlendshapes?.[0];
            if (bs) for (const c of bs.categories) if (c.categoryName === "jawOpen") jaw = c.score;
            if (mat) engine.updateHead(mat.data, faceLms, jaw);
            else engine.updateHeadApprox(faceLms, jaw);
            lostAt = 0;
            faceFails.current = 0;
          } else {
            if (!lostAt) lostAt = now;
            if (now - lostAt > 250) engine.headLost();
          }
        } catch {
          // MediaPipe's face-geometry solver throws away the whole detection
          // on degenerate frames — if it persists, the geometry pipeline is
          // wedged for this device. Rebuild WITHOUT matrixes: landmarks come
          // back unconditionally and the approx pose keeps tracking.
          faceFails.current++;
          if (faceFails.current > 3) engine.headLost(); // don't freeze a stale head on screen
          if (faceFails.current > 10 && tr.faceHasMat && now - lastFaceRebuild.current > 4000) {
            lastFaceRebuild.current = now;
            faceFails.current = 0;
            const old = tr.face;
            void loadFaceTracker(false).then((f) => {
              if (trackersRef.current) trackersRef.current = { ...trackersRef.current, face: f, faceHasMat: false };
              try { old.close(); } catch { /* noop */ }
            }).catch(() => { /* keep the old one */ });
          }
          if (!lostAt) lostAt = now;
          if (now - lostAt > 250) engine.headLost();
        }
        try {
          if (tr.hand) {
            const hr = tr.hand.detectForVideo(video, now);
            const hl = hr.landmarks ?? [];
            const hd = (hr as { handedness?: { categoryName: string }[][] }).handedness ?? [];
            for (let i = 0; i < hl.length; i++) {
              hands.push(hl[i] as Lm[]);
              // tracker names hands for a mirrored picture; flip for rear camera
              const left = hd[i]?.[0]?.categoryName === "Left";
              sides.push(engine.mirror ? left : !left);
            }
          }
        } catch { /* hand hiccup — no bones this frame */ }
      }

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
          if (raw) {
            try { bodyShown = drawBodyOverlay(bodyG, raw, W, H); } catch { bodyShown = false; }
          }
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
      sg.save();
      if (mir) { sg.translate(W, 0); sg.scale(-1, 1); }
      sg.drawImage(sil, 0, 0, W, H); // stage AR == video AR → direct stretch
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
    if (!video || frozen) return;
    // Capture at video resolution — the stage is the same aspect ratio.
    const W = video.videoWidth || 1280, H = video.videoHeight || 720;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const g = out.getContext("2d")!;
    const mir = facingRef.current === "user";
    g.save();
    if (mir) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0, W, H);
    for (const c of [bodyRef.current, shadeRef.current, glRef.current]) if (c) g.drawImage(c, 0, 0, W, H);
    g.restore();
    if (hudRef.current) g.drawImage(hudRef.current, 0, 0, W, H);
    const url = out.toDataURL("image/jpeg", 0.92);
    frozenRef.current = url;
    setFrozen(url);
  }

  async function saveFrozen() {
    if (!frozen) return;
    const blob = await (await fetch(frozen)).blob();
    const file = new File([blob], `waqt-xray-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`, { type: "image/jpeg" });
    // Mobile-first: share sheet (Save to Photos) where available, else download.
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch { /* user cancelled or share unsupported — fall through */ }
    const a = document.createElement("a");
    a.download = file.name;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function unfreeze() {
    frozenRef.current = null;
    setFrozen(null);
  }

  const mir = facing === "user";
  const flip = mir ? "scaleX(-1)" : "none";
  const chip = (on: boolean) => ({
    background: on ? "var(--color-accent)" : "var(--color-paper)",
    color: on ? "var(--color-paper)" : "var(--color-ink-muted)",
  });

  const slider = (label: string, k: "real" | "bright" | "feather" | "cut" | "size" | "offX" | "offY", min: number, max: number) => (
    <label key={k} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
      <span className="w-12 shrink-0 text-right">{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={prefs[k]}
        onChange={(e) => setPrefs((p) => ({ ...p, [k]: parseFloat(e.target.value) }))}
        className="w-full min-w-0 flex-1" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--color-paper)" }}>
      {/* header — one slim line */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="px-1 text-lg leading-none" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">✕</button>
        <p className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          {stage === "live" ? status : "Anatomy mirror — on-device, nothing uploaded"}
        </p>
        {stage === "live" && (
          <button type="button" onClick={switchCamera} aria-label="Switch camera"
            className="rounded-md border p-1.5"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7h-3l-1.5-2h-7L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><circle cx="12" cy="13" r="3" />
            </svg>
          </button>
        )}
      </div>

      {/* stage — sized to the video's own aspect ratio so tracking is 1:1 */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 sm:px-4">
      <div ref={stageRef}
        className="relative touch-none overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--color-paper-3)", background: "#07090f", aspectRatio: String(ar), width: `min(100%, calc((100dvh - 250px) * ${ar}))` }}
        onPointerMove={(e) => { const r = stageRef.current!.getBoundingClientRect(); pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }}
        onPointerLeave={() => { pointerRef.current = null; }}>
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-fill" style={{ transform: flip }} />
        <canvas ref={bodyRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <canvas ref={shadeRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: flip }} />
        <canvas ref={glRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ transform: flip }} />
        <canvas ref={hudRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {stage !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "var(--color-paper)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Anatomy mirror</p>
            <p className="max-w-xs text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Face the camera for skull and hand bones. Step back for muscle recovery colors. Everything stays on this phone.
            </p>
            {stage === "error" && <p className="max-w-xs text-xs" style={{ color: "#c96b45" }}>{errMsg}</p>}
            <button type="button" onClick={start} disabled={stage === "starting"}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-paper)", opacity: stage === "starting" ? 0.6 : 1 }}>
              {stage === "starting" ? "Loading…" : stage === "error" ? "Try again" : "Start camera"}
            </button>
          </div>
        )}

        {/* frozen capture preview */}
        {frozen && (
          <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "#07090f" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frozen} alt="Captured frame" className="min-h-0 flex-1 object-contain" />
            <div className="flex items-center justify-center gap-3 py-3">
              <button type="button" onClick={unfreeze}
                className="rounded-full border px-5 py-2 text-xs font-medium"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", background: "var(--color-paper)" }}>
                Retake
              </button>
              <button type="button" onClick={saveFrozen}
                className="rounded-full px-5 py-2 text-xs font-semibold"
                style={{ background: "var(--color-accent)", color: "var(--color-paper)" }}>
                Save photo
              </button>
            </div>
          </div>
        )}

        {/* capture shutter */}
        {stage === "live" && !frozen && (
          <button type="button" onClick={snapshot} aria-label="Capture a picture"
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 p-1"
            style={{ borderColor: "rgba(239,232,221,0.9)", background: "rgba(7,9,15,0.4)" }}>
            <span className="block h-11 w-11 rounded-full" style={{ background: "var(--color-paper)" }} />
          </button>
        )}
      </div>
      </div>

      {/* controls */}
      <div className="px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
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
          {([["labels", "Labels", prefs.labels], ["solid", "Solid", prefs.solid]] as const).map(([k, t, on]) => (
            <button key={k} type="button"
              onClick={() => setPrefs((p) => ({ ...p, [k]: !p[k] }))}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", ...chip(on) }}>
              {t}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--color-paper-3)" }} />
          {([["full", "Full"], ["lens", "Lens"], ["left", "L"], ["right", "R"], ["top", "T"], ["bottom", "B"]] as [RevealMode, string][]).map(([m, t]) => (
            <button key={m} type="button"
              onClick={() => setPrefs((p) => ({ ...p, reveal: m }))}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium"
              style={{ borderColor: "var(--color-paper-3)", ...chip(prefs.reveal === m) }}>
              {t}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--color-paper-3)" }} />
          <button type="button"
            onClick={() => setPrefs((p) => ({ ...p, bright: 1, feather: 0.2, cut: 0.5, size: 1, offX: 0, offY: 0, real: 0.3, reveal: "full" }))}
            className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", background: "var(--color-paper)" }}>
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
          {slider("Size", "size", 0.4, 2.2)}
          {slider("Bright", "bright", 0.3, 2)}
          {slider("Shift ↔", "offX", -0.6, 0.6)}
          {slider("Shift ↕", "offY", -0.6, 0.6)}
          {slider("Show me", "real", 0, 1)}
          {slider("Feather", "feather", 0, 1)}
          {prefs.reveal !== "full" && <div className="col-span-2">{slider(prefs.reveal === "lens" ? "Lens size" : "Cut pos", "cut", 0, 1)}</div>}
        </div>
        <p className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: "#7fbf6b" }} />recovered
          <i className="ml-1 inline-block h-2 w-2 rounded-full" style={{ background: "#8e3419" }} />sore
          <span className="ml-auto">BodyParts3D · CC BY-SA 2.1</span>
        </p>
      </div>
    </div>
  );
}
