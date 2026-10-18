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
    // Slip head: a logistic probe over the model's encoder frames that
    // scores each tracker's word span acoustically — catches wrong-sounding
    // words (kaf-vs-ha level substitutions) without waiting for word-level
    // alignment to settle. Needs the model's optional encoder output;
    // the manifest declares it, and the head silently stays off if a model
    // without it is ever loaded.
    slipHead: "high",
    // Aggressive search cadence (shorter queries, more frequent full-Quran
    // searches) starves single-threaded WASM decode — the audio backlog
    // overflows, transcript corrupts, locate never lands. Only the verdict
    // observation window is tightened: 25→15 frames (1.0s→0.6s), which
    // with the patched 4-frame persistence puts flags ~0.7s behind voice.
    config: {
      settleFrames: 15,
      // A real mistake spikes alignment cost — if relocation triggers too
      // eagerly, a wrong WORD reads as "you moved", the tracker abandons
      // the passage on ~1 word of evidence, and the correction observer
      // (gated off while struggling) never flags the slip. Rebalance:
      // holdRate raised so observation keeps running through a rough
      // stretch, lostRate raised so it takes a genuinely sustained failure
      // to go lost, and the relocate search needs ~2 ayahs of unheard text
      // (80 chars) — enough that a false hit can't land on a fluke.
      holdWindow: 22,
      holdRate: 0.6,
      lostRate: 0.45,
      relocateEveryFrames: 30,
      relocateQueryChars: 80,
    },
    debug: true,
  } as Parameters<typeof createRecognitionSession>[0]);
  // Correction mode: word-level suspects (omission / substitution / vowel /
  // repetition / skipped ayah) stream out as `correction` events. The page
  // turns them into yellow suspects; only user-confirmed mistakes persist.
  session.zipformer?.correction.setMode("correction");
  // Balanced flagging: omissions flag when under half the word was heard,
  // substitutions need a clearly different word, vowel slips need a confident
  // decoder read. Tighter than this (0.15/0.9) made real slips never surface.
  if (session.zipformer) Object.assign(session.zipformer.correction.thresholds, {
    omissionMaxHeard: 0.5,
    substitutionDistance: 0.7,
    vowelMargin: 0.08,
    vowelWordMargin: 0.85,
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
