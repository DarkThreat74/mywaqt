// Shared PoseLandmarker singleton — the ~15MB wasm runtime + model parse
// happens ONCE per session instead of once per camera mount (front/side/back
// each remount GuidedCamera). GPU delegate first, CPU fallback, full model
// with lite as last resort.
import { meteredConnection } from "@/lib/net";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const MODELS = ["/models/pose/pose_landmarker_full.task", "/models/pose/pose_landmarker_lite.task"];

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  landmarkerPromise ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    let lastErr: unknown = null;
    for (const delegate of ["GPU", "CPU"] as const) {
      for (const modelAssetPath of MODELS) {
        try {
          return await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.4,
            minPosePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
        } catch (err) {
          lastErr = err;
        }
      }
    }
    throw lastErr ?? new Error("pose model unavailable");
  })();
  // If creation failed, allow a retry on next mount instead of caching the rejection.
  landmarkerPromise.catch(() => { landmarkerPromise = null; });
  return landmarkerPromise;
}

/** Warm the model+wasm caches on idle so the camera opens instantly. */
export function preloadPoseModel(): void {
  if (meteredConnection()) return; // don't idle-download ~15MB on cellular
  const warm = () => { getPoseLandmarker().catch(() => {}); };
  if (typeof requestIdleCallback === "function") requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 1500);
}
