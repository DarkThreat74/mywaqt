"use client";

import { useEffect, useRef, useState } from "react";
import { keyPose, keyPose3D, scorePose, worstJoint, type AnyPose, type KeyPose, type KeyPose3D, type Pt } from "@/lib/workout/poseGuide";
import { getPoseLandmarker } from "@/lib/workout/poseModel";
import { detectShirtless } from "@/lib/workout/shirtDetect";

export interface CaptureResult {
  dataUrl: string;
  photoMime: string;
  pose: number[][]; // 33 image landmarks [x,y]
  worldPose: number[][] | null; // 33 world landmarks [x,y,z] meters — powers 3D pose matching
  analysis: {
    shirtless: boolean | null;
    skinRatio: number | null;
    matchScore: number | null; // pose-match % at shutter time
  };
}

interface Props {
  angle: "front" | "side" | "back";
  /** normalized target pose (user's prior photo or built-in stance) */
  targetPose: KeyPose;
  /** 3D world-space target from the prior photo — enables view-invariant scoring */
  targetWorldPose?: KeyPose3D | null;
  /** true when targetPose came from the user's own photo — stricter match */
  personalTarget?: boolean;
  /** prior photo dataURL drawn faintly under the guide */
  ghostImage?: string | null;
  onCapture: (r: CaptureResult) => void;
  onCancel?: () => void;
}

const BONES: [keyof KeyPose, keyof KeyPose][] = [
  ["shL", "shR"], ["shL", "elL"], ["elL", "wrL"], ["shR", "elR"], ["elR", "wrR"],
  ["shL", "hipL"], ["shR", "hipR"], ["hipL", "hipR"],
  ["hipL", "kneeL"], ["kneeL", "ankL"], ["hipR", "kneeR"], ["kneeR", "ankR"],
  ["shL", "nose"], ["shR", "nose"], ["nose", "hipL"], ["nose", "hipR"], // neck + spine hints
];
// Joints drawn as dots so the guide reads as a body, not a stick figure.
const JOINTS: (keyof KeyPose)[] = ["nose", "shL", "shR", "elL", "elR", "wrL", "wrR", "hipL", "hipR", "kneeL", "kneeR", "ankL", "ankR"];
const HINTS: Record<Props["angle"], string> = {
  front: "Face the camera · arms relaxed at your sides · feet shoulder-width",
  side: "Turn sideways · whole body in frame · arms relaxed",
  back: "Back to the camera · same stance as the front shot",
};

export default function GuidedCamera({ angle, targetPose, targetWorldPose, personalTarget, ghostImage, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelState, setModelState] = useState<"loading" | "ready" | "failed">("loading");
  const modelOk = modelState === "ready";
  const [camError, setCamError] = useState("");
  // Frozen frame preview after a successful shot — Retake/Use before commit.
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  // Escape hatch: pose model works but the score never reaches the bar — let
  // the user take the shot unguided rather than dead-end on the shutter.
  const [escapeGuide, setEscapeGuide] = useState(false);
  const escapeRef = useRef(false);
  useEffect(() => { escapeRef.current = escapeGuide; }, [escapeGuide]);
  const [score, setScore] = useState(0);
  const [worstHint, setWorstHint] = useState<string | null>(null);
  const [shirtOn, setShirtOn] = useState<boolean | null>(null); // true = fabric detected
  const [aligned, setAligned] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const alignSince = useRef(0);
  const capturing = useRef(false);
  const alignedRef = useRef(false);
  // Props that can change after mount (prior photo loads async) — read via refs
  // inside the detection loop so it never goes stale.
  const targetRef = useRef(targetPose);
  useEffect(() => { targetRef.current = targetPose; }, [targetPose]);
  const targetWorldRef = useRef<KeyPose3D | null>(targetWorldPose ?? null);
  useEffect(() => { targetWorldRef.current = targetWorldPose ?? null; }, [targetWorldPose]);
  const onCaptureRef = useRef(onCapture);
  useEffect(() => { onCaptureRef.current = onCapture; }, [onCapture]);
  // The shutter button calls through a ref — no window-global capture hook.
  const captureRef = useRef<() => void>(() => {});
  const personalRef = useRef(!!personalTarget);
  useEffect(() => { personalRef.current = !!personalTarget; }, [personalTarget]);
  const ghostRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!ghostImage) { ghostRef.current = null; return; }
    let dead = false;
    const img = new Image();
    img.src = ghostImage;
    img.onload = () => { if (!dead) ghostRef.current = img; };
    return () => { dead = true; };
  }, [ghostImage]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: import("@mediapipe/tasks-vision").PoseLandmarker | null = null;
    let raf = 0;
    let poseModelOk = false;
    let modelLoading = true; // shutter stays disabled until the model resolves
    let lastPlayTry = 0;
    capturing.current = false; // refs survive angle changes — reset per mount
    const video = videoRef.current!, canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const r = video.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(video);

    // objectFit:cover crops the video — map frame-normalized landmark coords
    // through the same cover transform so the guide lands on the body.
    type MapFn = (p: Pt) => Pt;
    const view = (): { map: MapFn; rect: { x: number; y: number; w: number; h: number } } => {
      const r = canvas.getBoundingClientRect();
      const dprX = canvas.width / Math.max(1, r.width);
      const dprY = canvas.height / Math.max(1, r.height);
      const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
      const s = Math.max(r.width / vw, r.height / vh);
      const dw = vw * s, dh = vh * s;
      const ox = (r.width - dw) / 2, oy = (r.height - dh) / 2;
      // The <video> is CSS-scaled about its center — the skeleton must ride
      // the same zoom while the ghost rect stays unzoomed on purpose.
      const z = zoomRef.current;
      const cx = (r.width / 2) * dprX, cy = (r.height / 2) * dprY;
      return {
        map: (p) => {
          const bx = (ox + p[0] * dw) * dprX, by = (oy + p[1] * dh) * dprY;
          return [cx + (bx - cx) * z, cy + (by - cy) * z];
        },
        rect: { x: ox * dprX, y: oy * dprY, w: dw * dprX, h: dh * dprY },
      };
    };

    const drawSkeleton = (pose: KeyPose, map: MapFn, color: string, width: number, dash: number[]) => {
      ctx.save();
      // Thick round-capped strokes read as a body silhouette, not a stick man.
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const [a, b] of BONES) {
        const pa = map(pose[a] as Pt), pb = map(pose[b] as Pt);
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const j of JOINTS) {
        const p = map(pose[j] as Pt);
        ctx.beginPath();
        ctx.arc(p[0], p[1], width * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawGhost = (rect: { x: number; y: number; w: number; h: number }) => {
      const img = ghostRef.current;
      if (!img) return;
      // Prior photo shares the camera's aspect — cover-fit inside the video rect.
      const s = Math.max(rect.w / img.width, rect.h / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.drawImage(img, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
      ctx.restore();
    };

    // EMA smoothing kills landmark jitter — without it the score flickers
    // and can never settle at ~100%. ~11fps inference is plenty for a
    // hold-still check; the canvas still redraws every RAF.
    const DETECT_MS = 90;
    const SMOOTH = 0.5; // weight of the newest frame
    let lastDetect = 0;
    let smooth: KeyPose | null = null;
    let smoothW: KeyPose3D | null = null;
    let lastK: KeyPose | null = null;
    let lastKw: KeyPose3D | null = null;
    // Raw 33-point landmarks, kept for capture() fallback if the shutter-time
    // detect hiccups — otherwise the photo loses its pose guide data.
    let lastLm: { x: number; y: number }[] = [];
    let lastWlm: { x: number; y: number; z?: number }[] = [];
    let lastShirtCheck = 0;
    let shirtOnLocal: boolean | null = null;
    const JOINT_KEYS = ["nose","shL","shR","elL","elR","wrL","wrR","hipL","hipR","kneeL","kneeR","ankL","ankR"] as const;
    const blend = <T extends KeyPose | KeyPose3D>(prev: T, next: T): T => {
      const out = { ...next } as T;
      for (const k of JOINT_KEYS) {
        const a = prev[k] as number[], b = next[k] as number[];
        ((out as unknown) as Record<string, number[]>)[k] = a.map((v, i) => v + ((b[i] ?? 0) - v) * SMOOTH);
      }
      return out;
    };

    const loop = () => {
      if (cancelled) return;
      if (video.readyState >= 2) {
        // Autoplay can be blocked until a user gesture — keep retrying.
        if (video.paused && performance.now() - lastPlayTry > 1000) {
          lastPlayTry = performance.now();
          video.play().catch(() => {});
        }
        const now = performance.now();
        if (landmarker && now - lastDetect >= DETECT_MS) {
          lastDetect = now;
          try {
            const res = landmarker.detectForVideo(video, now);
            const lm = res.landmarks?.[0];
            const wlm = res.worldLandmarks?.[0];
            const k = lm ? keyPose(lm) : null;
            const kw = wlm ? keyPose3D(wlm) : null;
            if (lm?.length === 33) lastLm = lm;
            if (wlm?.length === 33) lastWlm = wlm;
            // Shirt check ~1.4×/sec — pixel sampling is cheap but not free.
            if (lm?.length === 33 && now - lastShirtCheck > 700) {
              lastShirtCheck = now;
              const sh = detectShirtless(video, video.videoWidth || 1, video.videoHeight || 1, lm);
              if (sh) {
                shirtOnLocal = !sh.shirtless;
                setShirtOn((prev) => (prev === shirtOnLocal ? prev : shirtOnLocal));
              }
            }
            smooth = k ? (smooth ? blend(smooth, k) : k) : null;
            smoothW = kw ? (smoothW ? blend(smoothW, kw) : kw) : null;
            lastK = smooth; lastKw = smoothW;
          } catch { /* detection hiccup — keep last frame */ }
        }
        // Ghost + skeleton redraw every frame from the latest pose.
        const { map, rect } = view();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGhost(rect);
        {
        const k = lastK;
        const kw = lastKw;
        if (!k) {
            alignSince.current = 0;
            setWorstHint(null);
            if (alignedRef.current) { setAligned(false); alignedRef.current = false; }
          }
          if (k) {
            // 3D world-landmark scoring when the target has one — joint angles
            // in real meters are view-invariant. Falls back to 2D image angles.
            const tp = targetRef.current;
            const tp3 = targetWorldRef.current;
            const use3D = !!(tp3 && kw);
            const scoreTarget: AnyPose = use3D ? tp3! : tp;
            const scoreCurrent: AnyPose = use3D ? kw! : k;
            const s = scorePose(scoreTarget, scoreCurrent);
            setScore((prev) => (Math.abs(prev - s) > 4 ? s : prev));
            const thr = personalRef.current ? 68 : 58;
            const w = s < thr ? worstJoint(scoreTarget, scoreCurrent) : null;
            setWorstHint((prev) => (prev === (w?.name ?? null) ? prev : w?.name ?? null));
            if (s >= thr) {
              if (!alignSince.current) alignSince.current = performance.now();
              if (performance.now() - alignSince.current > 450) { setAligned(true); alignedRef.current = true; }
            } else {
              alignSince.current = 0;
              if (alignedRef.current) { setAligned(false); alignedRef.current = false; }
            }
            // Both poses are torso-normalized around mid-hip, so the target
            // overlays the user by re-projecting through THEIR detected frame.
            const midHipF: Pt = [(k.hipL[0] + k.hipR[0]) / 2, (k.hipL[1] + k.hipR[1]) / 2];
            const midShF: Pt = [(k.shL[0] + k.shR[0]) / 2, (k.shL[1] + k.shR[1]) / 2];
            const torsoF = Math.hypot(midShF[0] - midHipF[0], midShF[1] - midHipF[1]) || 1e-4;
            const targetFrame = {} as KeyPose;
            for (const key of JOINT_KEYS) {
              const p = tp[key] as Pt;
              targetFrame[key] = [midHipF[0] + p[0] * torsoF, midHipF[1] + p[1] * torsoF];
            }
            drawSkeleton(targetFrame, map, "rgba(255,255,255,0.6)", canvas.width * 0.02, []);
            drawSkeleton(k, map, "rgba(255,180,90,0.95)", canvas.width * 0.018, []);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const capture = () => {
      if (capturing.current || !video.videoWidth) return;
      if (modelLoading) return; // never allow an unguided shot mid-load
      if (poseModelOk && !alignedRef.current && !escapeRef.current) return;
      capturing.current = true;
      const vw = video.videoWidth, vh = video.videoHeight;
      const z = zoomRef.current;
      // Crop the center region at the current zoom so the saved photo
      // matches what the user framed against the ghost.
      const cw = vw / z, ch = vh / z;
      const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
      const scale = Math.min(1, 1920 / Math.max(cw, ch));
      const out = document.createElement("canvas");
      out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
      out.getContext("2d")!.drawImage(video, sx, sy, cw, ch, 0, 0, out.width, out.height);
      // WebP q0.9 — ~40% smaller than JPEG at this quality; fall back if unsupported.
      const webp = out.toDataURL("image/webp", 0.9);
      const mime = webp.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
      const dataUrl = mime === "image/webp" ? webp : out.toDataURL("image/jpeg", 0.92);
      // grab the freshest landmarks for next time's guide — image coords for
      // the overlay, world coords (meters) for view-invariant 3D scoring
      let pose: number[][] = [];
      let worldPose: number[][] | null = null;
      let freshK: KeyPose | null = null, freshKw: KeyPose3D | null = null;
      let freshLm = lastLm;
      let freshDetect = false;
      // Landmarks are full-frame normalized — remap into the cropped frame
      // so the stored pose lines up with the zoomed photo next check-in.
      const cropX = (x: number) => (x - sx / vw) * z;
      const cropY = (y: number) => (y - sy / vh) * z;
      try {
        const res = landmarker?.detectForVideo(video, performance.now());
        const lm = res?.landmarks?.[0];
        const w = res?.worldLandmarks?.[0];
        if (lm?.length === 33) {
          lastLm = lm; freshLm = lm; freshK = keyPose(lm); freshDetect = true;
          pose = lm.map((l) => [cropX(l.x), cropY(l.y)]);
        }
        if (w?.length === 33) {
          lastWlm = w; freshKw = keyPose3D(w);
          worldPose = w.map((l) => [l.x, l.y, l.z ?? 0]);
        }
      } catch { /* fall through to cached landmarks */ }
      if (!pose.length && lastLm.length === 33) pose = lastLm.map((l) => [cropX(l.x), cropY(l.y)]);
      if (!worldPose && lastWlm.length === 33) worldPose = lastWlm.map((l) => [l.x, l.y, l.z ?? 0]);

      // Picture analysis: clothing state + the live match score at the
      // shutter moment. Only computed on a FRESH detection — cached
      // landmarks describe a different moment and would mislabel the photo.
      let shirtless: boolean | null = null, skinRatio: number | null = null, matchScore: number | null = null;
      if (freshDetect) {
        try {
          const sh = detectShirtless(out, out.width, out.height, freshLm);
          if (sh) { shirtless = sh.shirtless; skinRatio = sh.skinRatio; }
        } catch { /* analysis is best-effort */ }
        const ck = freshK ?? lastK, cw = freshKw ?? lastKw;
        if (ck) {
          const tp = targetRef.current, tp3 = targetWorldRef.current;
          const use3D = !!(tp3 && cw);
          matchScore = scorePose(use3D ? tp3! : tp, use3D ? cw! : ck);
        }
      }
      // Freeze on a preview first — the user confirms or retakes before the
      // photo commits. capturing stays latched until they choose Use photo.
      setPreview({
        dataUrl, photoMime: mime, pose, worldPose,
        analysis: { shirtless, skinRatio, matchScore },
      });
    };
    captureRef.current = capture;

    (async () => {
      // Shared singleton — parsed once per session, reused across angles.
      // Kicked off in parallel with the camera permission prompt.
      const modelP = getPoseLandmarker().catch((err) => {
        console.error("[GuidedCamera] pose model", err);
        return null;
      });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (err) {
        console.error("[GuidedCamera] camera", err);
        // Honest copy — DOMException names mean nothing to users.
        const name = err instanceof DOMException ? err.name : "";
        setCamError(
          name === "NotAllowedError" ? "Camera access was denied — allow it in your browser settings and try again."
          : name === "NotFoundError" || name === "OverconstrainedError" ? "No camera was found on this device."
          : name === "NotReadableError" ? "The camera is busy in another app — close it and try again."
          : name === "SecurityError" ? "The browser blocked camera access on this page."
          : "The camera could not start."
        );
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay policies vary — play() retried below */ }

      // Pose model is best-effort — the camera and shutter work either way
      // so this can never dead-end. Shutter stays locked until this resolves
      // so nobody takes an unguided shot during the load window.
      // 12s cap — on a dead connection the singleton keeps warming in the
      // background, but this mount falls back to manual mode instead of
      // locking the shutter forever.
      landmarker = await Promise.race([
        modelP,
        new Promise<null>((res) => setTimeout(() => res(null), 12000)),
      ]);
      const modelReady = !!landmarker && !cancelled;
      modelLoading = false;
      if (cancelled) return;
      poseModelOk = modelReady;
      setModelState(modelReady ? "ready" : "failed");
      setStatus("ready");
      resize();
      loop(); // runs with or without the pose model — ghost + play retry
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      // landmarker is a session-wide singleton — never close it here.
      captureRef.current = () => {};
    };
  }, [angle]); // targetPose/onCapture/personalTarget read via refs — no restart

  // Pinch-to-zoom on the live feed — the ghost stays put so the user can
  // match their framing to the previous photo.
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onPtrDown = (e: React.PointerEvent) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
  const onPtrMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinch.current) pinch.current = { d, z: zoomRef.current };
      else if (pinch.current.d > 0) setZoom(Math.min(3, Math.max(1, pinch.current.z * (d / pinch.current.d))));
    }
  };
  const onPtrUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // If the pose model is up but the match bar never fills after ~8s, the
  // shutter is effectively dead — surface an explicit escape instead of
  // leaving the user guessing.
  const [escapeOffered, setEscapeOffered] = useState(false);
  useEffect(() => {
    if (!modelOk || aligned || escapeOffered || escapeGuide) return;
    const t = setTimeout(() => setEscapeOffered(true), 8000);
    return () => clearTimeout(t);
  }, [modelOk, aligned, escapeOffered, escapeGuide]);

  const confirmPreview = () => {
    if (!preview) return;
    onCaptureRef.current(preview);
    // Keep capturing latched — the parent unmounts us on save; a second
    // tap before that render must not mint a duplicate photo.
    // (Reset happens at effect start on the next mount.)
  };
  const retakePreview = () => {
    setPreview(null);
    capturing.current = false;
    setEscapeGuide(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ backgroundColor: "#111", touchAction: "none" }}
      onPointerDown={onPtrDown} onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerCancel={onPtrUp}>
      <video ref={videoRef} playsInline muted className="block w-full"
        style={{ aspectRatio: "3/4", objectFit: "cover", transform: `scale(${zoom})` }} />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#e8ddc8" }}>
          Loading camera & pose model (first time only)…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs" style={{ color: "#e8ddc8" }}>
          <span>
            {camError || "The camera could not start."}{" "}
            {onCancel && <button type="button" onClick={onCancel} className="underline">Go back</button>}
          </span>
        </div>
      )}
      {preview && (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ backgroundColor: "#111" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.dataUrl} alt="Captured photo preview" className="min-h-0 w-full flex-1 object-contain" />
          {preview.analysis.matchScore != null && (
            <p className="pt-2 text-center text-[10px] tabular-nums" style={{ color: "#e8ddc8" }}>
              {preview.analysis.matchScore}% pose match
            </p>
          )}
          <div className="flex gap-2 p-4">
            <button type="button" onClick={retakePreview}
              className="flex-1 rounded-xl border py-3 text-sm"
              style={{ borderColor: "rgba(255,255,255,0.35)", color: "#e8ddc8" }}>Retake</button>
            <button type="button" onClick={confirmPreview}
              className="flex-1 rounded-xl py-3 text-sm font-semibold"
              style={{ backgroundColor: "#e8a04c", color: "#111" }}>Use photo</button>
          </div>
        </div>
      )}
      {status === "ready" && (
        <div className="absolute inset-x-0 bottom-0 p-4" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }}>
          <p className="text-center text-[11px]" style={{ color: "#e8ddc8" }}>
            {modelState === "loading" ? "Loading pose guide…"
              : modelOk ? HINTS[angle]
              : "Pose guide unavailable — frame yourself and tap the shutter"}
          </p>
          {modelOk && (
            <>
              <div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${score}%`, backgroundColor: score >= (personalTarget ? 68 : 58) ? "#8fce6e" : "#e8a04c" }} />
              </div>
              <p className="mt-1 text-center text-[10px] tabular-nums" style={{ color: "#e8ddc8" }}>
                {aligned ? "Hold still — capturing…" : worstHint ? `check your ${worstHint}` : `${score}% match`}
              </p>
              {shirtOn === true && angle !== "front" && (
                <p className="mt-0.5 text-center text-[9px]" style={{ color: "#e8a04c" }}>
                  Shirt detected — bare skin gives a cleaner {angle} silhouette
                </p>
              )}
            </>
          )}
          <div className="mx-auto mt-3 flex w-48 items-center gap-2">
            <span className="text-[9px] tabular-nums" style={{ color: "#e8ddc8" }}>{zoom.toFixed(1)}×</span>
            <input type="range" min={1} max={3} step={0.1} value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-[#e8a04c]" aria-label="Camera zoom" />
          </div>
          <button type="button"
            onClick={() => captureRef.current()}
            disabled={modelState === "loading" || (modelOk && !aligned && !escapeGuide)}
            className="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-4 text-lg"
            style={{
              borderColor: (modelOk && aligned) || escapeGuide ? "#e8a04c" : "rgba(255,255,255,0.3)",
              backgroundColor: (modelOk && aligned) || escapeGuide ? "#e8a04c" : "rgba(255,255,255,0.15)",
              color: "#111",
              opacity: modelState === "loading" || (modelOk && !aligned && !escapeGuide) ? 0.5 : 1,
            }}
            aria-label="Capture photo">
            ●
          </button>
          {modelOk && !aligned && escapeOffered && !escapeGuide && (
            <button type="button" onClick={() => setEscapeGuide(true)}
              className="mx-auto mt-2 block text-[10px] underline" style={{ color: "#e8ddc8" }}>
              Guide won&apos;t match? Capture anyway
            </button>
          )}
          {escapeGuide && (
            <p className="mt-1 text-center text-[9px]" style={{ color: "#e8a04c" }}>
              Guide off — frame yourself and tap the shutter
            </p>
          )}
        </div>
      )}
    </div>
  );
}
