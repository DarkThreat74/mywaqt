/// <reference lib="webworker" />
/**
 * Quran Tester inference worker.
 *
 * Loads the zipformer phoneme engine (tilawa) on onnxruntime-web WASM, all
 * assets served from the /qt/ engine cache (installed on demand). Receives
 * mic PCM at the AudioContext's native rate, resamples to 16 kHz mono, and
 * streams tilawa events (verse_match, word_progress, correction, …) back to
 * the page. Everything stays on-device.
 */
import * as ort from "onnxruntime-web/wasm";
import { createRecognitionSession, type RecognitionSession } from "@tilawa/core";

declare const self: DedicatedWorkerGlobalScope;

const ENGINE_CACHE = "quran-tester-engine-v1";
const OUT_RATE = 16000;

let session: RecognitionSession | null = null;
let sourceRate = 48000;
let queue: Promise<void> = Promise.resolve();

async function cached(url: string): Promise<Response> {
  const cache = await caches.open(ENGINE_CACHE);
  const hit = await cache.match(url);
  if (!hit) throw new Error(`engine asset missing: ${url}`);
  return hit;
}

async function init(sampleRate: number) {
  sourceRate = sampleRate;
  postMessage({ type: "loading_status", message: "Warming up the engine…" });

  const [modelRes, corpusRes] = await Promise.all([
    cached("/qt/model.onnx"),
    cached("/qt/corpus.json"),
  ]);

  // Single-threaded WASM is the reliable path in workers — threaded WASM
  // needs cross-origin isolation, which an auth'd app can't always offer.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = "/qt/";

  const model = await modelRes.arrayBuffer();
  const corpus = await corpusRes.json();

  session = await createRecognitionSession({
    ort,
    model,
    corpus,
  });
  postMessage({ type: "ready" });
}

/** Cheap linear resampler — fine for 16kHz speech ASR. */
function resample(input: Float32Array, from: number): Float32Array {
  if (from === OUT_RATE) return input;
  const ratio = from / OUT_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, input.length - 1);
    out[i] = input[lo] + (input[hi] - input[lo]) * (src - lo);
  }
  return out;
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  // Serialize work — feed() and init() must never interleave.
  queue = queue.then(async () => {
    try {
      if (m.type === "init") {
        await init(m.sampleRate);
      } else if (m.type === "audio" && session) {
        const events = await session.feed(resample(m.samples, sourceRate));
        for (const ev of events) postMessage(ev);
      } else if (m.type === "stop" && session) {
        const events = await session.stop();
        for (const ev of events) postMessage(ev);
        postMessage({ type: "stopped" });
      } else if (m.type === "reset" && session) {
        session.reset();
      }
    } catch (err) {
      postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
};
