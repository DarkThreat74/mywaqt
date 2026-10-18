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

// Audio goes through a dedicated pump, NOT the message queue. Queuing every
// chunk in order means a device that infers slower than realtime falls
// behind permanently — the queue just grows. The pump merges pending chunks
// and drops the oldest past a 1.5s backlog, so latency self-corrects.
let feeding = false;
let audioPending: Float32Array[] = [];
const MAX_BACKLOG_SEC = 1.5;

async function pumpAudio() {
  if (feeding) return;
  feeding = true;
  try {
    while (audioPending.length && session) {
      const chunks = audioPending.splice(0);
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      await session.feed(resample(merged, sourceRate));
    }
  } catch (err) {
    void reportErr(err);
  } finally {
    feeding = false;
  }
}

// A dedicated worker's CSP comes from its own script's RESPONSE headers — a
// stale cached response can carry an old policy while the page is fine.
// Refetching our own URL shows what the server NOW sends, and whether the
// worker was born under a stale policy.
async function reportErr(err: unknown) {
  let wCsp = "?";
  try {
    const r = await fetch(self.location.href, { cache: "no-store" });
    const csp = r.headers.get("content-security-policy") ?? "";
    wCsp = csp.includes("unsafe-eval") ? "fresh" : `stale: ${csp.slice(0, 120)}`;
  } catch {
    wCsp = "unreachable";
  }
  postMessage({
    type: "error",
    message: `${err instanceof Error ? err.message : String(err)} [worker-csp: ${wCsp}]`,
  });
}

async function cached(url: string): Promise<Response> {
  const cache = await caches.open(ENGINE_CACHE);
  const hit = await cache.match(url);
  if (!hit) throw new Error(`engine asset missing: ${url}`);
  return hit;
}

async function init(sampleRate: number) {
  // Re-init would stack a second 66MB ONNX session on the first — the
  // session persists across recitations; only reset() runs between takes.
  if (session) {
    // Re-init (e.g. after warmQt) must still adopt the live AudioContext's
    // rate — a warm ctx at 48k followed by a recite ctx at 44.1k would
    // otherwise resample wrong and silently wreck detection.
    sourceRate = sampleRate;
    postMessage({ type: "ready" });
    return;
  }
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
    // Deliver events via the callback — feed()'s return carries the same
    // messages, but callback delivery can't be lost to a stalled promise.
    onEvent: (m: unknown) => postMessage(m),
    // CTC frames decode at 25Hz — defaults search for the verse once per
    // second (25) and relocate every ~1.5s (37). Halving both makes the
    // initial "where is he reciting" lock feel instant; settle stays.
    config: { searchEveryFrames: 10, relocateEveryFrames: 15 },
    debug: true,
  } as Parameters<typeof createRecognitionSession>[0]);
  // Correction mode: word-level suspects (omission / substitution / vowel /
  // repetition / skipped ayah) stream out as `correction` events. The page
  // turns them into yellow suspects; only user-confirmed mistakes persist.
  session.zipformer?.correction.setMode("correction");
  // Rare-slipups tuning: defaults flag any partly-heard skipped word as an
  // omission (1) and substitutions at distance 0.6. Only near-total omissions
  // and clearly-different substitutions should ever surface yellow.
  if (session.zipformer) Object.assign(session.zipformer.correction.thresholds, {
    omissionMaxHeard: 0.3,
    substitutionDistance: 0.8,
    vowelMargin: 0.1,
    vowelWordMargin: 0.9,
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
      } else if (m.type === "audio") {
        audioPending.push(m.samples);
        // Drop the oldest frames past the backlog cap — better to skip a
        // syllable than to trail the reciter by a growing delay.
        let backlog = audioPending.reduce((s, c) => s + c.length, 0);
        while (backlog > MAX_BACKLOG_SEC * sourceRate && audioPending.length > 1) {
          backlog -= audioPending[0].length;
          audioPending.shift();
        }
        void pumpAudio();
      } else if (m.type === "expect" && session) {
        session.zipformer?.setExpected(m.passage ?? null);
      } else if (m.type === "stop" && session) {
        await session.stop(); // events flow through onEvent
        postMessage({ type: "stopped" });
      } else if (m.type === "reset" && session) {
        audioPending = [];
        session.reset();
      } else if (m.type === "correction-act" && session) {
        session.zipformer?.correction.act(m.action);
      } else if (m.type === "mode" && session) {
        session.zipformer?.correction.setMode(m.mode);
      }
    } catch (err) {
      void reportErr(err);
    }
  });
};
