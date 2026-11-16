"use client";

import { useEffect, useRef, useState } from "react";
import { keyPose, keyPose3D, scorePose, worstJoint, type AnyPose, type KeyPose, type KeyPose3D, type Pt } from "@/lib/workout/poseGuide";
import { getPoseLandmarker } from "@/lib/workout/poseModel";

export interface CaptureResult {
  dataUrl: string;
  photoMime: string;
  pose: number[][]; // 33 image landmarks [x,y]
  worldPose: number[][] | null; // 33 world landmarks [x,y,z] meters — powers 3D pose matching
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
  const [score, setScore] = useState(0);
  const [worstHint, setWorstHint] = useState<string | null>(null);
  const [aligned, setAligned] = useState(false);
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
      return {
        map: (p) => [(ox + p[0] * dw) * dprX, (oy + p[1] * dh) * dprY],
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
      if (poseModelOk && !alignedRef.current) return;
      capturing.current = true;
      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = Math.min(1, 1280 / Math.max(vw, vh));
      const out = document.createElement("canvas");
      out.width = Math.round(vw * scale); out.height = Math.round(vh * scale);
      out.getContext("2d")!.drawImage(video, 0, 0, out.width, out.height);
      const mime = out.toDataURL("image/webp", 0.82).startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
      const dataUrl = mime === "image/webp" ? out.toDataURL("image/webp", 0.82) : out.toDataURL("image/jpeg", 0.85);
      // grab the freshest landmarks for next time's guide — image coords for
      // the overlay, world coords (meters) for view-invariant 3D scoring
      let pose: number[][] = [];
      let worldPose: number[][] | null = null;
      try {
        const res = landmarker?.detectForVideo(video, performance.now());
        const lm = res?.landmarks?.[0];
        const w = res?.worldLandmarks?.[0];
        if (lm?.length === 33) { lastLm = lm; lastWlm = w?.length === 33 ? w : lastWlm; }
        pose = (lm?.length === 33 ? lm : lastLm).map((l) => [l.x, l.y]);
        const wsrc = w?.length === 33 ? w : lastWlm;
        if (wsrc.length === 33) worldPose = wsrc.map((l) => [l.x, l.y, l.z ?? 0]);
      } catch { /* fall through to cached landmarks */
        pose = lastLm.map((l) => [l.x, l.y]);
        if (lastWlm.length === 33) worldPose = lastWlm.map((l) => [l.x, l.y, l.z ?? 0]);
      }
      onCaptureRef.current({ dataUrl, photoMime: mime, pose, worldPose });
      capturing.current = false; // same mount may serve the next angle's retake
    };
    (window as unknown as { __guidedCapture?: () => void }).__guidedCapture = capture;

    (async () => {
      // Shared singleton — parsed once per session, reused across angles.
      // Kicked off in parallel with the camera permission prompt.
      const modelP = getPoseLandmarker().catch((err) => {
        console.error("[GuidedCamera] pose model", err);
        return null;
      });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        console.error("[GuidedCamera] camera", err);
        setCamError(err instanceof DOMException ? err.name : "unknown");
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
      delete (window as unknown as { __guidedCapture?: () => void }).__guidedCapture;
    };
  }, [angle]); // targetPose/onCapture/personalTarget read via refs — no restart

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ backgroundColor: "#111" }}>
      <video ref={videoRef} playsInline muted className="block w-full" style={{ aspectRatio: "3/4", objectFit: "cover" }} />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#e8ddc8" }}>
          Loading camera & pose model (first time only)…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs" style={{ color: "#e8ddc8" }}>
          Camera failed to start{camError ? ` (${camError})` : ""}.{" "}
          {onCancel && <button type="button" onClick={onCancel} className="underline">Go back</button>}
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
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: score >= (personalTarget ? 68 : 58) ? "#8fce6e" : "#e8a04c" }} />
              </div>
              <p className="mt-1 text-center text-[10px] tabular-nums" style={{ color: "#e8ddc8" }}>
                {aligned ? "Hold still — capturing…" : worstHint ? `check your ${worstHint}` : `${score}% match`}
              </p>
            </>
          )}
          <button type="button"
            onClick={() => (window as unknown as { __guidedCapture?: () => void }).__guidedCapture?.()}
            disabled={modelState === "loading" || (modelOk && !aligned)}
            className="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-4 text-lg"
            style={{
              borderColor: modelOk && aligned ? "#e8a04c" : "rgba(255,255,255,0.3)",
              backgroundColor: modelOk && aligned ? "#e8a04c" : "rgba(255,255,255,0.15)",
              color: "#111",
              opacity: modelState === "loading" || (modelOk && !aligned) ? 0.5 : 1,
            }}
            aria-label="Capture photo">
            ●
          </button>
        </div>
      )}
    </div>
  );
}
