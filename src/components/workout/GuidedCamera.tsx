"use client";

import { useEffect, useRef, useState } from "react";
import { keyPose, normalizePose, scorePose, type KeyPose, type Pt } from "@/lib/workout/poseGuide";

export interface CaptureResult {
  dataUrl: string;
  photoMime: string;
  pose: number[][]; // 33 landmarks [x,y]
}

interface Props {
  angle: "front" | "side" | "back";
  /** normalized target pose (user's prior photo or built-in stance) */
  targetPose: KeyPose;
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
  ["shL", "nose"], ["shR", "nose"],
];
const HINTS: Record<Props["angle"], string> = {
  front: "Face the camera · arms relaxed at your sides · feet shoulder-width",
  side: "Turn sideways · whole body in frame · arms relaxed",
  back: "Back to the camera · same stance as the front shot",
};

export default function GuidedCamera({ angle, targetPose, personalTarget, ghostImage, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelOk, setModelOk] = useState(true);
  const [camError, setCamError] = useState("");
  const [score, setScore] = useState(0);
  const [aligned, setAligned] = useState(false);
  const alignSince = useRef(0);
  const capturing = useRef(false);
  const alignedRef = useRef(false);
  // Props that can change after mount (prior photo loads async) — read via refs
  // inside the detection loop so it never goes stale.
  const targetRef = useRef(targetPose);
  useEffect(() => { targetRef.current = targetPose; }, [targetPose]);
  const onCaptureRef = useRef(onCapture);
  useEffect(() => { onCaptureRef.current = onCapture; }, [onCapture]);
  const personalRef = useRef(!!personalTarget);
  useEffect(() => { personalRef.current = !!personalTarget; }, [personalTarget]);
  const ghostRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!ghostImage) { ghostRef.current = null; return; }
    const img = new Image();
    img.src = ghostImage;
    img.onload = () => { ghostRef.current = img; };
  }, [ghostImage]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: import("@mediapipe/tasks-vision").PoseLandmarker | null = null;
    let raf = 0;
    let poseModelOk = false;
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
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.lineCap = "round";
      for (const [a, b] of BONES) {
        const pa = map(pose[a] as Pt), pb = map(pose[b] as Pt);
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
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
      ctx.globalAlpha = 0.32;
      ctx.drawImage(img, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
      ctx.restore();
    };

    const loop = () => {
      if (cancelled) return;
      if (video.readyState >= 2 && landmarker) {
        try {
          // Ghost stays up even when no pose is detected.
          const { map, rect } = view();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawGhost(rect);
          const res = landmarker.detectForVideo(video, performance.now());
          const lm = res.landmarks?.[0];
          const k = lm ? keyPose(lm) : null;
          if (!k) {
            alignSince.current = 0;
            if (alignedRef.current) { setAligned(false); alignedRef.current = false; }
          }
          if (k) {
            const cur = normalizePose(k);
            const tp = targetRef.current;
            const s = scorePose(tp, cur);
            setScore((prev) => (Math.abs(prev - s) > 4 ? s : prev));
            const thr = personalRef.current ? 72 : 62;
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
            (Object.keys(tp) as (keyof KeyPose)[]).forEach((key) => {
              const p = tp[key] as Pt;
              targetFrame[key] = [midHipF[0] + p[0] * torsoF, midHipF[1] + p[1] * torsoF];
            });
            drawSkeleton(targetFrame, map, "rgba(255,255,255,0.6)", canvas.width * 0.006, [6, 5]);
            drawSkeleton(k, map, "rgba(255,180,90,0.95)", canvas.width * 0.007, []);
          }
        } catch { /* detection hiccup — keep last frame */ }
      }
      raf = requestAnimationFrame(loop);
    };

    const capture = () => {
      if (capturing.current || !video.videoWidth) return;
      if (poseModelOk && !alignedRef.current) return;
      capturing.current = true;
      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = Math.min(1, 1280 / Math.max(vw, vh));
      const out = document.createElement("canvas");
      out.width = Math.round(vw * scale); out.height = Math.round(vh * scale);
      out.getContext("2d")!.drawImage(video, 0, 0, out.width, out.height);
      const mime = out.toDataURL("image/webp", 0.82).startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
      const dataUrl = mime === "image/webp" ? out.toDataURL("image/webp", 0.82) : out.toDataURL("image/jpeg", 0.85);
      // grab the freshest landmarks for next time's guide
      let pose: number[][] = [];
      try {
        const res = landmarker?.detectForVideo(video, performance.now());
        pose = (res?.landmarks?.[0] || []).map((l) => [l.x, l.y]);
      } catch { /* pose optional */ }
      onCaptureRef.current({ dataUrl, photoMime: mime, pose });
    };
    (window as unknown as { __guidedCapture?: () => void }).__guidedCapture = capture;

    const makeLandmarker = async (delegate: "GPU" | "CPU") => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/pose/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
    };

    (async () => {
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

      // Pose model is best-effort: GPU → CPU → manual mode. The camera and
      // shutter work either way so this can never dead-end.
      let modelReady = false;
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          landmarker = await makeLandmarker(delegate);
          modelReady = true;
          break;
        } catch (err) {
          console.error(`[GuidedCamera] pose model (${delegate})`, err);
          landmarker?.close();
          landmarker = null;
        }
      }
      if (cancelled) return;
      poseModelOk = modelReady;
      setModelOk(modelReady);
      setStatus("ready");
      resize();
      if (modelReady) loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
      delete (window as unknown as { __guidedCapture?: () => void }).__guidedCapture;
    };
  }, [angle]); // targetPose/onCapture/personalTarget read via refs — no restart

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ backgroundColor: "#111" }}>
      <video ref={videoRef} playsInline muted className="block w-full" style={{ aspectRatio: "3/4", objectFit: "cover" }} />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#e8ddc8" }}>
          Loading camera & pose model (~20MB, first time only)…
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
            {modelOk ? HINTS[angle] : "Pose guide unavailable — frame yourself and tap the shutter"}
          </p>
          {modelOk && (
            <>
              <div className="mx-auto mt-2 h-1.5 w-40 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: score >= (personalTarget ? 72 : 62) ? "#8fce6e" : "#e8a04c" }} />
              </div>
              <p className="mt-1 text-center text-[10px] tabular-nums" style={{ color: "#e8ddc8" }}>
                {aligned ? "Hold still — capturing…" : `${score}% match`}
              </p>
            </>
          )}
          <button type="button"
            onClick={() => (window as unknown as { __guidedCapture?: () => void }).__guidedCapture?.()}
            disabled={modelOk && !aligned}
            className="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-4 text-lg"
            style={{
              borderColor: modelOk && aligned ? "#e8a04c" : "rgba(255,255,255,0.3)",
              backgroundColor: modelOk && aligned ? "#e8a04c" : "rgba(255,255,255,0.15)",
              color: "#111",
              opacity: modelOk && !aligned ? 0.5 : 1,
            }}
            aria-label="Capture photo">
            ●
          </button>
        </div>
      )}
    </div>
  );
}
