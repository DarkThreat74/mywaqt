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

// Liveness heartbeat — a wedged WASM decode produces no events AND no
// onerror (the thread is stuck, not crashed), so the page can't distinguish
// "quiet recitation" from "dead engine" without a beat. 5s cadence lets the
// page detect a stall in ~25s instead of never.
setInterval(() => {
  try { postMessage({ type: "beat" }); } catch {}
}, 5000);

// Audio goes through a dedicated pump, but pump calls are themselves queued —
// a control message (stop/reset/reanchor/expect) can no longer interleave with
// an in-flight feed and decode stale audio into a reset tracker. The pump
// merges pending chunks and drops the oldest past a 1.5s backlog, so latency
// self-corrects; pendingCtl lets a queued control message interrupt the drain.
let feeding = false;
let audioPending: { samples: Float32Array; rate: number }[] = [];
let pendingCtl = 0;
const MAX_BACKLOG_SEC = 1.5;

// ── Mutashabihat divergence watcher ─────────────────────────────────────
// Filled at init from structuralRules.looks. `muta_approach` fires once per
// differing region when the cursor steps INTO it; `muta_diverge` fires when
// a wrong/unsure verdict lands inside one — the page dings immediately
// instead of waiting for the pause-timed structural pass.
let divLooks: Map<string, { m: [number, number]; regions: number[][] }[]> | null = null;
let divCorpus: { wordSurah: Int32Array; wordAyah: Int32Array; wordInAyah: Int32Array } | null = null;
const mutaSeen = new Set<string>();

function watchMuta(ev: { type?: string; surah?: number; ayah?: number; word?: number; wordIndex?: number; changes?: { state?: string; wordIndex?: number }[] }) {
  if (!divLooks || !divCorpus) return;
  if (ev.type === "cursor" && ev.wordIndex != null) {
    flagDiv(ev.surah!, ev.ayah!, ev.word!, "approach");
  } else if (ev.type === "verdicts" && Array.isArray(ev.changes)) {
    for (const v of ev.changes) {
      if (v.state !== "wrong" && v.state !== "unsure" || v.wordIndex == null) continue;
      flagDiv(
        divCorpus.wordSurah[v.wordIndex],
        divCorpus.wordAyah[v.wordIndex],
        divCorpus.wordInAyah[v.wordIndex],
        "diverge",
      );
    }
  }
}

function flagDiv(s: number, a: number, w: number, mode: "approach" | "diverge") {
  const rows = divLooks!.get(`${s}:${a}`);
  if (!rows) return;
  for (const row of rows) {
    for (const r of row.regions) {
      const i1 = r[1], i2 = r[2]; // [tag, i1, i2, j1, j2]
      if (i2 <= i1 || w < i1 || w >= i2) continue;
      const key = `${s}:${a}:${i1}:${row.m[0]}:${row.m[1]}:${mode}`;
      if (mutaSeen.has(key)) continue;
      mutaSeen.add(key);
      postMessage({
        type: mode === "approach" ? "muta_approach" : "muta_diverge",
        surah: s, ayah: a, word: w + 1, // 1-based in-ayah for the page
        altSurah: row.m[0], altAyah: row.m[1],
      });
    }
  }
}

async function pumpAudio() {
  if (feeding) return;
  feeding = true;
  try {
    while (audioPending.length && session && !pendingCtl) {
      const chunks = audioPending.splice(0);
      // Pending chunks can carry different source rates (ctx swapped
      // mid-warm) — resample each at its own rate, then merge.
      const parts = chunks.map((c) => resample(c.samples, c.rate));
      const outLen = parts.reduce((s, p) => s + p.length, 0);
      const merged = new Float32Array(outLen);
      let off = 0;
      for (const p of parts) { merged.set(p, off); off += p.length; }
      await session.feed(merged);
    }
  } catch (err) {
    void reportErr(err);
  } finally {
    feeding = false;
  }
}

/** Drain every buffered chunk into the engine (used by stop — the tail of
 *  the take must be judged too, never silently dropped). */
async function drainAudio() {
  while (audioPending.length && session) {
    const chunks = audioPending.splice(0);
    const parts = chunks.map((c) => resample(c.samples, c.rate));
    const merged = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    let off = 0;
    for (const p of parts) { merged.set(p, off); off += p.length; }
    await session.feed(merged);
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

  // Threaded WASM needs cross-origin isolation. The page opts in via scoped
  // COOP/COEP on /quran-tester — `crossOriginIsolated` is the canonical
  // signal (SAB presence alone can lag the header check on some browsers);
  // absent headers degrade silently to single-thread, never a hard failure.
  ort.env.wasm.numThreads =
    self.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined"
      ? Math.min(4, navigator.hardwareConcurrency || 4)
      : 1;
  ort.env.wasm.wasmPaths = "/qt/";

  const model = await modelRes.arrayBuffer();
  const corpus = await corpusRes.json();

  session = await createRecognitionSession({
    ort,
    model,
    corpus,
    // Deliver events via the callback — feed()'s return carries the same
    // messages, but callback delivery can't be lost to a stalled promise.
    onEvent: (m: unknown) => {
      try { watchMuta(m as Parameters<typeof watchMuta>[0]); } catch {}
      postMessage(m);
    },
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
      // holdRate/lostRate raised so observation keeps running through a
      // rough stretch, and the relocate search needs ~4 ayahs of unheard
      // text (120 chars) — a one-word slip can no longer drag the tracker
      // onto a look-alike ayah (the mutashabihat false-jump).
      holdWindow: 22,
      holdRate: 0.7,
      lostRate: 0.55,
      relocateEveryFrames: 40,
      relocateQueryChars: 120,
      // A wrong word must be decisively worse than staying: demand the remote
      // hit beat local cost by 0.25 (was 0.12 — a moderate stumble could pass).
      relocateRateMargin: 0.25,
      // Silent-slide guard: DP restart edges used to reach ANY word in the
      // surah for a flat 12 — a mispronounced word could teleport the cursor
      // onto a mutashabih and the mistake scored "ok" against the wrong ayah.
      // Restarts now pay 2/word of distance and cap at 10 words; farther moves
      // must go through lost -> relocate (which emits an event the UI shows).
      jumpPerWord: 2,
      maxJumpWords: 10,
    },
    // Structural rules — the second detection layer. `stop`-timing only
    // flags at end of audio; `pause` raises them live as segments close:
    // skipped ayahs (ayahOrder, guarded mode) and look-alike-verse swaps
    // (similarVerse — the mutashabihat case the word rules can't see).
    structural: { ayahOrder: "guarded", similarVerse: true, timing: "pause" },
    debug: true,
  } as Parameters<typeof createRecognitionSession>[0]);
  // Correction mode: word-level suspects (omission / substitution / vowel /
  // repetition / skipped ayah) stream out as `correction` events. The page
  // turns them into yellow suspects; only user-confirmed mistakes persist.
  session.zipformer?.correction.setMode("correction");
  // Mutashabihat watch — the engine already ships a per-word look-alike
  // index (structural-index.json → structuralRules.looks: "s:a" → rows of
  // {m:[s,a], regions:[[tag,i1,i2,j1,j2]]}, engine word space). The
  // structural pass only flags at pauses; this watcher turns it live:
  // entering a region that DIFFERS from a look-alike raises muta_approach,
  // and a wrong/unsure verdict inside one raises muta_diverge instantly —
  // the exact "wait for the word that differs, then ding" rule.
  const zp = session.zipformer as unknown as {
    engine?: { corpus?: { wordSurah: Int32Array; wordAyah: Int32Array; wordInAyah: Int32Array } };
    structuralRules?: { looks?: Map<string, { m: [number, number]; regions: number[][] }[]> };
  } | null;
  divLooks = zp?.structuralRules?.looks ?? null;
  divCorpus = zp?.engine?.corpus ?? null;
  // Balanced flagging: omissions flag when under half the word was heard,
  // substitutions need a clearly different word, vowel slips need a confident
  // decoder read. Tighter than this (0.15/0.9) made real slips never surface.
  if (session.zipformer) Object.assign(session.zipformer.correction.thresholds, {
    // 0.5 meant a word heard half-way (only the onset clipped) could never flag
    // as an omission — 0.75 restores partial-word omission detection.
    omissionMaxHeard: 0.75,
    // 0.7 only fired on a completely different word — real learner slips
    // (1–2 phonemes off in a 3–6 token word) sit at 0.2–0.5 and could never
    // flag. 0.45 still requires a clearly different word.
    substitutionDistance: 0.45,
    // Neighbour anchors demanded margin >= 0.55 — almost never met on learner
    // audio, so the aligner rules were dead before they ran. 0.4 = the word
    // decoded clearly enough to trust as an anchor.
    clearMargin: 0.4,
    // Same story for the word's own margin: decoder confidence >= 0.35 that it
    // heard a real word (not mush), down from the unreachable default 0.5.
    subMargin: 0.35,
    vowelMargin: 0.08,
    // 0.85 token margin is unreachable on learner audio — vowel slips were
    // a dead channel. 0.6 keeps the confidence requirement meaningful.
    vowelWordMargin: 0.6,
    // Acoustic channel: GOP scores were computed but could never raise a flag
    // (gopFlag -Infinity). -5 per the engine's own tuning note — flags only
    // `wrong` substitutions whose forced alignment badly mismatches the free
    // decode, and only between anchored neighbours.
    gopFlag: -5,
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
  // Control messages interrupt the audio drain — count them while they wait
  // so pumpAudio yields instead of starving stop/reset behind a live stream.
  if (m.type !== "audio" && m.type !== "init") pendingCtl++;
  // Serialize work — feed() and init() must never interleave.
  queue = queue.then(async () => {
    try {
      if (m.type === "init") {
        await init(m.sampleRate);
      } else if (m.type === "audio") {
        // Capture the rate at enqueue — the engine's sourceRate can change
        // on re-init while old chunks still wait.
        audioPending.push({ samples: m.samples as Float32Array, rate: sourceRate });
        // Drop the oldest frames past the backlog cap — better to skip a
        // syllable than to trail the reciter by a growing delay. The drop is
        // surfaced (never silent): the heard stream has a hole and every
        // later word's timing shifts early by the dropped duration.
        let backlog = audioPending.reduce((s, c) => s + c.samples.length, 0);
        let dropped = 0;
        while (backlog > MAX_BACKLOG_SEC * sourceRate && audioPending.length > 1) {
          backlog -= audioPending[0].samples.length;
          dropped += audioPending[0].samples.length;
          audioPending.shift();
        }
        if (dropped) postMessage({ type: "audio-gap", seconds: dropped / sourceRate });
        queue = queue.then(pumpAudio);
      } else if (m.type === "audio-sync" && session) {
        // Offline replay (recite-coach deep grade): every chunk MUST decode —
        // the realtime pump drops backlog, which corrupts the heard stream
        // and breaks frame→ms calibration. Serialized in the queue; slower
        // than realtime is fine, there is no live cursor to keep up with.
        await session.feed(resample(m.samples, sourceRate));
      } else if (m.type === "expect" && session) {
        session.zipformer?.setExpected(m.passage ?? null);
      } else if (m.type === "stop" && session) {
        await drainAudio(); // the tail of the take is judged too — never dropped
        await session.stop(); // events flow through onEvent
        // Deep-grade tap: dump the heard phoneme stream (chars + CTC frame
        // index each) so callers can measure madd/ghunnah durations. The
        // engine keeps every heard char in `buffer` (cap 1000) — reachable at
        // runtime though TS-private. framesDecoded lets callers convert
        // frames→ms against the actual audio length.
        const z = session.zipformer as unknown as {
          engine?: {
            buffer?: { ch: string; frame: number; margin: number }[];
            tracker?: {
              heard?: { ch: string; frame: number; margin: number }[];
              trail?: number[];
              localWordOfPos?: Int32Array;
              firstWord?: number;
            };
            corpus?: {
              wordSurah?: Int32Array;
              wordAyah?: Int32Array;
              wordInAyah?: Int32Array;
            };
          };
          decoder?: { framesDecoded?: number };
        } | null;
        // Per-word spans via the tracker trail — heard char i maps to
        // expected position trail[i], and localWordOfPos turns a position
        // into a word inside the locked passage. This is what powers the
        // report's word-by-word timing (pitch + madds land on real words).
        const tr = z?.engine?.tracker;
        const corpus = z?.engine?.corpus;
        const words: {
          surah: number; ayah: number; word: number; wordIndex: number;
          chars: { ch: string; frame: number }[];
        }[] = [];
        if (tr?.heard && tr.trail && tr.localWordOfPos && corpus?.wordSurah && tr.trail.length === tr.heard.length) {
          const byWord = new Map<number, { ch: string; frame: number }[]>();
          tr.heard.forEach((c, i) => {
            const cell = tr.trail![i];
            if (cell <= 0) return;
            const w = tr.localWordOfPos![Math.min(cell, tr.localWordOfPos!.length) - 1];
            const arr = byWord.get(w) ?? [];
            arr.push({ ch: c.ch, frame: c.frame });
            byWord.set(w, arr);
          });
          const first = tr.firstWord ?? 0;
          for (const [local, chars] of [...byWord.entries()].sort((a, b) => a[0] - b[0])) {
            const gi = first + local;
            words.push({
              surah: corpus.wordSurah[gi], ayah: corpus.wordAyah![gi], word: corpus.wordInAyah![gi] + 1,
              wordIndex: gi, chars,
            });
          }
        }
        postMessage({
          type: "heard",
          chars: z?.engine?.buffer ?? [],
          words,
          framesDecoded: z?.decoder?.framesDecoded ?? 0,
        });
        postMessage({ type: "stopped" });
      } else if (m.type === "reset" && session) {
        audioPending = [];
        mutaSeen.clear(); // fresh take — divergent regions may ding again
        session.reset();
      } else if (m.type === "correction-act" && session) {
        session.zipformer?.correction.act(m.action);
      } else if (m.type === "reanchor" && session) {
        // Hold mode: a rejected relocation snaps the tracker back to the
        // pinned ayah — the move is flagged, the cursor stays put.
        session.zipformer?.track(m.s as number, m.a as number, (m.w as number) ?? 0);
      } else if (m.type === "mode" && session) {
        session.zipformer?.correction.setMode(m.mode);
      }
    } catch (err) {
      void reportErr(err);
    } finally {
      if (m.type !== "audio" && m.type !== "init") pendingCtl--;
      // A control message may have paused the drain — resume feeding.
      if (audioPending.length) queue = queue.then(pumpAudio);
    }
  });
};
