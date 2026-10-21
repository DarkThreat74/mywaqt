/**
 * Recitation session — a module-level singleton owning the worker + mic.
 * It deliberately lives outside React so navigating away from /quran-tester
 * keeps the session alive; a global toast (GlobalReciteToast) mirrors its
 * state and flashes on suspects wherever you are in the app.
 */

import { engineAsset } from "./engine";

export type QtListen = "idle" | "warming" | "listening" | "paused";

export interface QtEvent {
  type: string;
  [k: string]: unknown;
}

const listeners = new Set<(ev: QtEvent) => void>();
// The worker broadcasts the identical-ayah set once at engine init; the
// worker outlives page mounts, so replay it to subscribers that arrive
// later or they'll run the whole session with an empty ident set.
let identAyahs: string[] | null = null;
export function subscribeQt(fn: (ev: QtEvent) => void) {
  listeners.add(fn);
  if (identAyahs) {
    try { fn({ type: "muta_ident", ayahs: identAyahs }); } catch {}
  }
  return () => { listeners.delete(fn); };
}
function emit(ev: QtEvent) {
  if (ev.type === "muta_ident") identAyahs = (ev.ayahs as string[]) ?? null;
  // One throwing listener must never starve the rest (or kill fan-out into
  // worker.onmessage) — a subscriber error is isolated, not propagated.
  for (const fn of listeners) {
    try { fn(ev); } catch {}
  }
}

let worker: Worker | null = null;
let audio: { ctx: AudioContext; stream: MediaStream; src: MediaStreamAudioSourceNode; node: AudioWorkletNode } | null = null;
let listen: QtListen = "idle";
let engineReady = false;   // init handshake completed — model in memory
let workerRate = 0;        // sample rate the loaded engine was inited for
let borrowed = false;      // recite-coach deep grade owns the engine right now
let warmWatchdog: ReturnType<typeof setTimeout> | null = null;
// Batched-but-unsent mic audio as chunk refs (flushed on stop). Concat only
// at send time — a full-copy merge per 128-sample worklet message was ~375x
// O(n) copying per second on the main thread.
let micChunks: Float32Array[] = [];
let micLen = 0;
function drainMicChunks(): Float32Array | null {
  if (!micLen) return null;
  const out = new Float32Array(micLen);
  let off = 0;
  for (const c of micChunks) { out.set(c, off); off += c.length; }
  micChunks = [];
  micLen = 0;
  return out;
}
// Session-level safety net: an un-acted `correction` freezes the engine's
// whole tracker in `retrying`. The page's own 8s defer covers normal use —
// this one exists for when the page is unmounted (navigated away), so
// background listening can't die silently.
let deferTimer: ReturnType<typeof setTimeout> | null = null;

// Worker liveness + heap hygiene.
// - `beat`: the worker posts every 5s. A wedged WASM decode emits no events
//   AND no onerror (the thread is stuck, not crashed) — without the beat a
//   dead engine is indistinguishable from quiet recitation.
// - WASM heaps grow but never shrink (microsoft/onnxruntime#21673); the
//   official workaround is terminating the worker. We retire it a few
//   seconds after each real take and pre-warm a fresh one, so peak heap
//   can't accumulate across a long evening of sessions.
let lastMsgAt = 0;
let stallTimer: ReturnType<typeof setInterval> | null = null;
let lastRecycleAt = 0;
let recycleTimer: ReturnType<typeof setTimeout> | null = null;

function recycleWorker(reason: "stall" | "post-session") {
  const w = worker;
  worker = null;
  engineReady = false;
  lastMsgAt = Date.now();
  lastRecycleAt = Date.now();
  try { w?.terminate(); } catch {}
  if (listen === "idle") {
    warmQt(); // pre-load the replacement during idle
  } else {
    ensureWorker()?.postMessage({ type: "init", sampleRate: workerRate || 16000 });
    if (reason === "stall") {
      emit({ type: "ui-status", message: "Engine stalled — restarting…" });
    }
  }
}

/**
 * Borrow the warm engine for a batch decode (recite-coach deep grade).
 * A fresh worker pays the ~66MB model load every take (~5s) — the warmed
 * singleton already has it in memory, so grading starts immediately.
 * Returns null when the engine isn't up or a live session owns it; callers
 * fall back to a dedicated worker in that case.
 */
export function borrowQtEngine(rate: number): Worker | null {
  if (!worker || !engineReady || listen !== "idle" || borrowed || (rate && workerRate && rate !== workerRate)) return null;
  borrowed = true;
  return worker;
}

/** Return the shared engine after a batch decode. Without this, a second
 *  grade could interleave on the same worker and corrupt both decodes. */
export function releaseQtEngine() {
  borrowed = false;
}

// ── Screen-wake + background "orb" notification ────────────────────────
// Wake Lock keeps the screen on while reciting. For the notification:
// Chrome/Android only shows a persistent media notification for a real
// <audio> element playing >5s, so a looping silent WAV is played for the
// session's life and the mediaSession metadata carries a generated orb —
// green while tracking is clean, red when a suspect/jump flags.
let wakeLock: { release(): Promise<void> } | null = null;
let silentEl: HTMLAudioElement | null = null;
let flashTimer: ReturnType<typeof setInterval> | null = null;
const orbUrls: Partial<Record<"ok" | "alert" | "alert-hi", string>> = {};

/** A small luminous orb on dark paper — drawn, not generated. Three stops
 *  of radial light, a hairline ring, and a faint outer halo so it reads at
 *  24px notification size. `alert-hi` is the brighter flash frame. */
function orbUrl(kind: "ok" | "alert" | "alert-hi"): string {
  const hit = orbUrls[kind];
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const core = kind === "ok" ? "#3fae7c" : kind === "alert" ? "#d84f3d" : "#f06a52";
  const glow = kind === "ok" ? "#57d59c" : kind === "alert" ? "#ff7a60" : "#ff9a86";
  // Ground — deep warm ink, not pure black.
  g.fillStyle = "#17130f";
  g.fillRect(0, 0, 256, 256);
  // Halo — wide, faint, so the orb feels lit rather than pasted.
  const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  halo.addColorStop(0, `${core}66`);
  halo.addColorStop(1, `${core}00`);
  g.fillStyle = halo;
  g.fillRect(0, 0, 256, 256);
  // Orb — lit from top-left, core falling to a darker rim.
  const body = g.createRadialGradient(100, 92, 8, 128, 128, 86);
  body.addColorStop(0, glow);
  body.addColorStop(0.55, core);
  body.addColorStop(1, kind === "ok" ? "#1d6b4a" : "#7d241a");
  g.beginPath();
  g.arc(128, 128, 78, 0, Math.PI * 2);
  g.fillStyle = body;
  g.fill();
  // Hairline ring — the "seal" edge that keeps it from looking flat.
  g.beginPath();
  g.arc(128, 128, 84, 0, Math.PI * 2);
  g.lineWidth = 3;
  g.strokeStyle = `${glow}55`;
  g.stroke();
  // Top glint.
  g.beginPath();
  g.ellipse(104, 96, 26, 14, -0.6, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.28)";
  g.fill();
  const url = c.toDataURL("image/png");
  orbUrls[kind] = url;
  return url;
}

/** 6s of silence as a WAV data URI — long enough to satisfy the >5s
 *  media-notification floor, tiny enough to inline. */
let silentWavUrl = "";
function silentWav(): string {
  if (silentWavUrl) return silentWavUrl;
  const rate = 8000, secs = 6, n = rate * secs;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  silentWavUrl = `data:audio/wav;base64,${btoa(bin)}`;
  return silentWavUrl;
}

/** Swap the notification orb + text. "alert" flashes the orb red (two
 *  artwork frames alternating); `detail` is the ayah shown beside it —
 *  e.g. "Al-Baqarah · 2:255" — so the reciter can see where to resume. */
export function qtOrb(state: "ok" | "alert", detail?: string) {
  if (!("mediaSession" in navigator)) return;
  try {
    if (state === "alert") {
      let hi = false;
      const paint = () => {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Possible mistake",
          artist: detail ? `Continue from ${detail}` : "Check the page",
          artwork: [{ src: orbUrl(hi ? "alert-hi" : "alert"), sizes: "256x256", type: "image/png" }],
        });
        hi = !hi;
      };
      paint();
      if (!flashTimer) flashTimer = setInterval(paint, 800);
    } else {
      if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: detail ? `Reciting — ${detail}` : "Reciting — following along",
        artist: "Quran Tester",
        artwork: [{ src: orbUrl("ok"), sizes: "256x256", type: "image/png" }],
      });
    }
  } catch { /* mediaSession metadata best-effort */ }
}

function armKeepAlive() {
  if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
    navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {});
  }
  try {
    if (!silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      // muted=true elements often don't count as "playing media" — which is
      // what grants the notification AND exempts the tab from freezing.
      // Near-zero volume keeps it inaudible while registering as playback.
      silentEl.muted = false;
      silentEl.volume = 0.01;
    }
    void silentEl.play().catch(() => {});
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
      qtOrb("ok");
      try {
        navigator.mediaSession.setActionHandler("pause", () => { void pauseQt(); });
        navigator.mediaSession.setActionHandler("play", () => { void resumeQt(); });
        navigator.mediaSession.setActionHandler("stop", () => { void stopQt(); });
      } catch {}
    }
  } catch { /* notification is best-effort — recitation never depends on it */ }
}

function disarmKeepAlive() {
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  try { silentEl?.pause(); } catch {}
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = "none"; } catch {}
  }
}
// Cross-tab mutex — only one tab may run the listener (a second tab would
// warm a second 66MB model and fight over the mic).
let releaseLock: (() => void) | null = null;
let lockHeld = false;
let lockOwner: object | null = null;
const QT_LOCK_OWNER = {};

function acquireLock(owner: object = QT_LOCK_OWNER): Promise<boolean> {
  // Already-held resolves true ONLY for the same owner — warmQt's borrow must
  // not let a later startQt think it owns a lock warm is about to release.
  if (lockHeld) return Promise.resolve(lockOwner === owner);
  if (typeof navigator === "undefined" || !("locks" in navigator)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    navigator.locks.request("qt-recite", { ifAvailable: true }, (held) => {
      if (!held) return resolve(false);
      lockHeld = true;
      lockOwner = owner;
      resolve(true);
      // Hold the lock until teardown — resolving this promise frees it.
      return new Promise<void>((release) => { releaseLock = release; });
    });
  });
}

function dropLock(owner: object = QT_LOCK_OWNER) {
  if (lockHeld && lockOwner !== owner) return; // someone else owns it now
  lockHeld = false;
  lockOwner = null;
  releaseLock?.();
  releaseLock = null;
}

export function qtState(): QtListen {
  return listen;
}

export function qtPost(msg: Record<string, unknown>) {
  // The page acted on the issue — the 14s off-screen safety net isn't
  // needed and would double-fire review_later on a resolved correction.
  if (msg.type === "correction-act" && deferTimer) {
    clearTimeout(deferTimer);
    deferTimer = null;
  }
  worker?.postMessage(msg);
}

/**
 * Warm-up — spin up the worker and load the model during page idle time so
 * pressing record skips "Warming up…" entirely. Safe without a gesture:
 * AudioContext creation (for the true sample rate) is allowed; only
 * resume() is gated, and we don't resume here.
 */
export function warmQt() {
  try {
    if (listen !== "idle") return;
    const warmOwner = {};
    void acquireLock(warmOwner).then((ok) => {
      try {
        if (!ok || listen !== "idle") return; // another tab owns the engine
        ensureWorker();
        if (!worker) return;
        const ctx = new AudioContext();
        workerRate = ctx.sampleRate;
        worker.postMessage({ type: "init", sampleRate: ctx.sampleRate });
        void ctx.close();
      } finally {
        // Warm only borrows the lock — an idle warmed tab must never block
        // another tab from actually reciting. Ownership-checked: a startQt
        // that slipped in keeps its lock.
        dropLock(warmOwner);
      }
    });
  } catch {
    // AudioContext can throw pre-gesture on old WebKit or when the context
    // budget is exhausted — warm-up is best-effort, record still inits.
  }
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
    // A dedicated worker's CSP comes from its script response's headers —
    // stale cached/edge entries are re-stamped by the SW (_next/static branch).
    worker = new Worker(new URL("./recite.worker.ts", import.meta.url));
    worker.onmessage = (e) => {
      lastMsgAt = Date.now();
      const ev = e.data as QtEvent;
      if (ev.type === "ready") {
        engineReady = true;
        if (warmWatchdog) { clearTimeout(warmWatchdog); warmWatchdog = null; }
        // A warmQt() preload also posts init → ready — only flip to
        // listening when a mic session is actually warming up.
        if (listen === "warming") {
          listen = "listening";
          armKeepAlive();
          emit({ type: "ui-status", message: "Listening — recite anywhere in the Quran" });
        }
      } else if (ev.type === "loading_status") {
        emit({ type: "ui-status", message: String(ev.message ?? "Loading…") });
      } else if (ev.type === "error") {
        const msg = String(ev.message ?? "Engine error");
        // Probe the RUNNING document's effective policy: new Function throws
        // only when the live CSP lacks 'unsafe-eval'. Paired with the server's
        // fresh header, this pinpoints which layer is stale: document vs
        // worker context vs neither.
        let docBlocked = "?";
        try {
          new Function("return 1")();
          docBlocked = "no";
        } catch {
          docBlocked = "yes";
        }
        if (warmWatchdog) { clearTimeout(warmWatchdog); warmWatchdog = null; }
        emit({ type: "ui-error", message: `${msg} [doc-eval-blocked: ${docBlocked}]` });
        void stopQt();
        // If this is a wasm/CSP failure, the running document may just be
        // stale (a PWA keeps its headers from page-load time). Check the
        // fresh headers — if the server already allows wasm, one reload
        // fixes it; guard the loop with a session flag.
        // Offline: unregistering the SW + reloading would brick the page —
        // the engine already runs fully offline, so skip recovery entirely.
        if (/wasm|webassembly|backend/i.test(msg) && navigator.onLine &&
            !sessionStorage.getItem("qt-csp-reload")) {
          sessionStorage.setItem("qt-csp-reload", "1");
          fetch(location.href, { method: "HEAD", cache: "no-store" })
            .then(async (r) => {
              const csp = r.headers.get("content-security-policy") ?? "";
              if (!csp.includes("wasm-unsafe-eval")) return;
              // Server's policy is fixed but this document is stale — a
              // reload alone can't help if the OLD service worker keeps
              // serving the old page. Unregister it entirely so the next
              // load registers a fresh SW from the network, then reload.
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((reg) => reg.unregister()));
              }
              location.reload();
            })
            .catch(() => {});
        }
        return;
      }
      // Background-listening safety net: a `correction` event leaves the
      // engine frozen in `retrying` until someone acts. The mounted page
      // defers it after ~8s; if nobody does (navigated away), release it
      // here at ~14s so detection can't die silently off-screen.
      if (ev.type === "correction") {
        if (deferTimer) clearTimeout(deferTimer);
        const outcome = (ev.state as { outcome?: string | null } | undefined)?.outcome;
        if (!outcome) {
          deferTimer = setTimeout(() => {
            deferTimer = null;
            qtPost({ type: "correction-act", action: "review_later" });
          }, 14000);
        }
      } else if (ev.type === "stopped" || ev.type === "heard") {
        if (deferTimer) { clearTimeout(deferTimer); deferTimer = null; }
        // Drain finished — safe to retire the worker now (a fixed 3s timer
        // could fire before this message and drop the final heard payload).
        if (listen === "idle" && !borrowed && worker && !recycleTimer) {
          recycleTimer = setTimeout(() => {
            recycleTimer = null;
            if (worker && !borrowed && listen === "idle") recycleWorker("post-session");
          }, 2000);
        }
      }
      emit(ev);
    };
    worker.onerror = (e) => {
      // A worker that failed to load/execute must never be reused — its
      // postMessage black-holes and init would hang "warming" forever.
      worker?.terminate();
      worker = null;
      engineReady = false;
      emit({
        type: "ui-error",
        message: `Engine failed to start.${e.message ? ` ${e.message}` : ""}`,
      });
      void stopQt(); // releases the mic tracks too
      e.preventDefault();
    };
    // Stall watchdog — one interval for the worker's lifetime. Only fires
    // while actively listening (idle/paused states are allowed to be quiet),
    // and at most one recycle per minute so a pathological model can't
    // thrash restart loops.
    stallTimer ??= setInterval(() => {
      if (!worker || listen !== "listening" || borrowed) return;
      if (!lastMsgAt || Date.now() - lastMsgAt < 25000) return;
      if (Date.now() - lastRecycleAt < 60000) return;
      recycleWorker("stall");
    }, 10000);
    return worker;
}

export async function startQt(): Promise<void> {
  if (listen !== "idle") return;
  // Claim the state before any await — a second tap during getUserMedia
  // would otherwise open a parallel mic stream + session.
  listen = "warming";
  emit({ type: "ui-listen", state: "warming" });
  // Start the silent-media + notification NOW, inside the tap gesture —
  // Chrome's transient activation expires during model warm, so playing the
  // keep-alive track on `ready` gets autoplay-blocked and no media
  // notification ever appears. armKeepAlive is idempotent (the `ready`
  // handler calls it again harmlessly).
  armKeepAlive();
  if (!(await acquireLock())) {
    disarmKeepAlive();
    listen = "idle";
    emit({ type: "ui-listen", state: "idle" });
    emit({ type: "ui-error", message: "Quran Listener is already running in another tab." });
    return;
  }
  ensureWorker();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // AGC off: Chrome's default-on gain-riding pumps quiet recitation and
      // amplifies room noise during pauses — the single biggest "can't pick
      // up sound" cause. EC off: there's no monitor path, and its nonlinear
      // stage smears consonants a 251-phoneme CTC needs. Keep browser NS —
      // it helps against steady background noise more than it hurts.
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    // Reset fully — leaving `warming` here bricked the feature until reload
    // (every startQt early-returned) and held the cross-tab lock forever.
    disarmKeepAlive();
    listen = "idle";
    emit({ type: "ui-listen", state: "idle" });
    dropLock();
    emit({
      type: "ui-mic-denied",
      message:
        name === "NotFoundError"
          ? "No microphone found on this device."
          : !navigator.mediaDevices
            ? "Microphone needs a secure (https) context."
            : "Microphone access is blocked.",
    });
    return;
  }

  // Fresh recitation — without this, the previous session's transcript and
  // tracker state leak into the next take.
  worker?.postMessage({ type: "reset" });

  let ctx: AudioContext | undefined;
  try {
    // Ask for 16 kHz directly — the recognizer resamples to 16k anyway, so
    // this kills the linear resampler's aliasing and cuts port traffic ~3x.
    // Where unsupported the worker's resample() still handles the rate.
    ctx = new AudioContext({ sampleRate: 16000 });
    // iOS/Android browsers often create the context suspended even inside a
    // tap handler — mic shows "recording" but the worklet never runs and the
    // engine starves silently. Resume before wiring anything.
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    // Same-origin file preferred. Fallback: the engine bucket keeps a copy
    // under /qt/qt-capture.js — build a blob: module URL from it so the
    // worklet loads even where service workers don't exist (native WebView)
    // or offline before the SW ever saw it. worker-src allows blob:.
    try {
      await ctx.audioWorklet.addModule("/worklets/qt-capture.js");
    } catch (first) {
      const cached = await engineAsset("qt-capture.js");
      if (!cached) throw first;
      const url = URL.createObjectURL(await cached.blob());
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    // iOS 17+: lets the AudioContext survive backgrounding — the OS won't
    // suspend a play-and-record session the way it kills a plain one.
    try {
      const nav = navigator as { audioSession?: { type?: string } };
      if (nav.audioSession) nav.audioSession.type = "play-and-record";
    } catch {}
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    if (ctx) { try { await ctx.close(); } catch {} }
    disarmKeepAlive();
    listen = "idle";
    emit({ type: "ui-listen", state: "idle" });
    emit({ type: "ui-error", message: err instanceof Error ? err.message : "Audio setup failed." });
    return;
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "qt-capture");
  // Muted gain into destination keeps process() pulling frames without any
  // chance of a monitor path feeding back into the mic.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  let lastLevelAt = 0;
  node.port.onmessage = (e) => {
    const chunk: Float32Array = e.data;
    micChunks.push(chunk);
    micLen += chunk.length;
    // 100ms sends (was 250ms): the encoder emits on a 480ms hop, so every
    // ms shaved here comes straight off perceived word-follow latency.
    if (micLen >= ctx.sampleRate / 10) {
      // Mic level for the UI meter — throttled to ~5Hz: every emit repaints
      // the full mushaf tree, which is the main thread's biggest cost.
      const now = Date.now();
      if (now - lastLevelAt >= 200) {
        lastLevelAt = now;
        let sum = 0;
        for (let i = 0; i < chunk.length; i += 8) sum += chunk[i] * chunk[i];
        const rms = Math.sqrt(sum / (chunk.length / 8));
        emit({ type: "ui-level", value: Math.min(1, rms * 6) });
      }
      const out = drainMicChunks();
      if (out) worker?.postMessage({ type: "audio", samples: out }, [out.buffer]);
    }
  };
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  audio = { ctx, stream, src, node };
  // If the OS kills capture (iOS ~30s background kill, Android 9+ background
  // mic restriction) the track ends silently — surface it instead of leaving
  // the orb saying "Reciting" over dead audio.
  for (const t of stream.getTracks()) {
    t.onended = () => {
      if (listen === "listening" || listen === "paused") {
        emit({ type: "ui-error", message: "Microphone was lost — tap record to restart." });
        void stopQt();
      }
    };
  }
  ctx.onstatechange = () => {
    if (ctx.state === "suspended" && listen === "listening" && !document.hidden)
      void ctx.resume().catch(() => {});
  };

  emit({ type: "ui-status", message: "Warming up the engine…" });
  workerRate = ctx.sampleRate;
  worker?.postMessage({ type: "init", sampleRate: ctx.sampleRate });
  // Watchdog: if neither `ready` nor `error` arrives (wasm deadlock, hung
  // init), the UI would spin "Warming up…" forever. 120s matches the
  // dedicated-worker guard in deepGrade.
  if (warmWatchdog) clearTimeout(warmWatchdog);
  warmWatchdog = setTimeout(() => {
    warmWatchdog = null;
    if (listen === "warming") {
      emit({ type: "ui-error", message: "Engine warmup timed out — try again." });
      void stopQt();
    }
  }, 120_000);
}

// Recitation keeps running when the app is backgrounded — that's what the
// media notification is for. Chrome keeps mic capture + the silent audio
// element alive in a "playing media" tab; the orb stays up as the signal.
// (Never auto-pause here: suspending the AudioContext also tears the
// notification down, which is exactly what the user saw vanish.)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    // The browser drops the wake lock while hidden — reclaim on return.
    if (!document.hidden && listen === "listening" && !wakeLock && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {});
    }
    // If a browser did suspend the AudioContext in the background, resume
    // it on return — the mic stream is still live, so a resume revives the
    // worklet without a new session.
    if (!document.hidden && listen === "listening" && audio && audio.ctx.state === "suspended") {
      void audio.ctx.resume().catch(() => {});
    }
  });
}

export async function stopQt(): Promise<void> {
  const wasActive = listen !== "idle";
  disarmKeepAlive();
  if (!borrowed) {
    // Flush the batched-but-unsent tail (up to ~100ms — the end of the last
    // word) BEFORE stop, else the last syllable is never judged. Borrowed
    // workers belong to recite-coach — never inject audio/stop into its
    // session; the coach manages its own stream.
    const tail = drainMicChunks();
    if (tail) worker?.postMessage({ type: "audio", samples: tail }, [tail.buffer]);
    worker?.postMessage({ type: "stop" });
  }
  if (deferTimer) { clearTimeout(deferTimer); deferTimer = null; }
  if (warmWatchdog) { clearTimeout(warmWatchdog); warmWatchdog = null; }
  dropLock();
  const a = audio;
  audio = null;
  if (a) {
    try { a.src.disconnect(); } catch {}
    try { a.node.disconnect(); } catch {}
    a.stream.getTracks().forEach((t) => t.stop());
    try { await a.ctx.close(); } catch {}
  }
  listen = "idle";
  emit({ type: "ui-listen", state: "idle" });
  // Fallback recycle if the worker never confirms 'stopped' (crashed mid-
  // drain). The normal path arms on the 'stopped'/'heard' event instead.
  if (wasActive && worker && !borrowed) {
    if (recycleTimer) clearTimeout(recycleTimer);
    recycleTimer = setTimeout(() => {
      recycleTimer = null;
      if (worker && !borrowed && listen === "idle") recycleWorker("post-session");
    }, 15000);
  }
}

/**
 * Full teardown — stop the mic AND kill the worker so the loaded model is
 * released from memory. Used when the engine is uninstalled; the next
 * startQt() spins up a fresh worker against the (now deleted) assets.
 */
/**
 * Pause — suspend the AudioContext so the worklet stops pushing frames,
 * but the mic stream, worker, and loaded model all stay alive. Resume
 * continues the same take from where it left off.
 */
export async function pauseQt(): Promise<void> {
  if (listen !== "listening" || !audio) return;
  try { await audio.ctx.suspend(); } catch {}
  listen = "paused";
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  // Silent track + notification reflect the pause; the element itself
  // stays loaded so resume is instant.
  try { silentEl?.pause(); } catch {}
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = "paused";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Paused",
        artist: "Quran Tester",
        artwork: [{ src: orbUrl("ok"), sizes: "256x256", type: "image/png" }],
      });
    } catch {}
  }
  emit({ type: "ui-listen", state: "paused" });
}

export async function resumeQt(): Promise<void> {
  if (listen !== "paused" || !audio) return;
  try { await audio.ctx.resume(); } catch {}
  listen = "listening";
  armKeepAlive(); // re-request the wake lock — paused released it
  emit({ type: "ui-listen", state: "listening" });
}

export async function teardownQt(): Promise<void> {
  await stopQt();
  if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
  if (recycleTimer) { clearTimeout(recycleTimer); recycleTimer = null; }
  worker?.terminate();
  worker = null;
  engineReady = false;
  workerRate = 0;
}
