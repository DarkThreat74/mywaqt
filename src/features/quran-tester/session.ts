/**
 * Recitation session — a module-level singleton owning the worker + mic.
 * It deliberately lives outside React so navigating away from /quran-tester
 * keeps the session alive; a global toast (GlobalReciteToast) mirrors its
 * state and flashes on suspects wherever you are in the app.
 */

export type QtListen = "idle" | "warming" | "listening" | "paused";

export interface QtEvent {
  type: string;
  [k: string]: unknown;
}

const listeners = new Set<(ev: QtEvent) => void>();
export function subscribeQt(fn: (ev: QtEvent) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit(ev: QtEvent) {
  for (const fn of listeners) fn(ev);
}

let worker: Worker | null = null;
let audio: { ctx: AudioContext; stream: MediaStream; src: MediaStreamAudioSourceNode; node: AudioWorkletNode } | null = null;
let listen: QtListen = "idle";

export function qtState(): QtListen {
  return listen;
}

export function qtPost(msg: Record<string, unknown>) {
  worker?.postMessage(msg);
}

export async function startQt(): Promise<void> {
  if (listen !== "idle") return;
  // Claim the state before any await — a second tap during getUserMedia
  // would otherwise open a parallel mic stream + session.
  listen = "warming";
  emit({ type: "ui-listen", state: "warming" });

  if (!worker) {
    const workerUrl = new URL("./recite.worker.ts", import.meta.url);
    workerUrl.searchParams.set("v", "2");
    // A dedicated worker's CSP comes from its script's RESPONSE headers — and
    // _next/static responses are cached immutable, so a stale entry carries an
    // old policy no unregister or reload can clear. A blob: worker instead
    // inherits the creator document's policy — always the live page's CSP.
    const src = await fetch(workerUrl, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`worker script ${r.status}`);
      return r.text();
    });
    worker = new Worker(
      URL.createObjectURL(new Blob([src], { type: "text/javascript" })),
      { type: "module" },
    );
    worker.onmessage = (e) => {
      const ev = e.data as QtEvent;
      if (ev.type === "ready") {
        listen = "listening";
        emit({ type: "ui-status", message: "Listening — recite anywhere in the Quran" });
      } else if (ev.type === "loading_status") {
        emit({ type: "ui-status", message: String(ev.message ?? "Loading…") });
      } else if (ev.type === "error") {
        const msg = String(ev.message ?? "Engine error");
        emit({ type: "ui-error", message: msg });
        void stopQt();
        // If this is a wasm/CSP failure, the running document may just be
        // stale (a PWA keeps its headers from page-load time). Check the
        // fresh headers — if the server already allows wasm, one reload
        // fixes it; guard the loop with a session flag.
        if (/wasm|webassembly|backend/i.test(msg) && !sessionStorage.getItem("qt-csp-reload")) {
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
      emit(ev);
    };
    worker.onerror = (e) => {
      // A worker that failed to load/execute must never be reused — its
      // postMessage black-holes and init would hang "warming" forever.
      worker?.terminate();
      worker = null;
      emit({
        type: "ui-error",
        message: `Engine failed to start.${e.message ? ` ${e.message}` : ""}`,
      });
      void stopQt(); // releases the mic tracks too
      e.preventDefault();
    };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
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
  worker.postMessage({ type: "reset" });

  let ctx: AudioContext | undefined;
  try {
    ctx = new AudioContext();
    // iOS/Android browsers often create the context suspended even inside a
    // tap handler — mic shows "recording" but the worklet never runs and the
    // engine starves silently. Resume before wiring anything.
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    // Same-origin file — the CSP's script-src blocks blob: module scripts.
    await ctx.audioWorklet.addModule("/worklets/qt-capture.js");
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    if (ctx) { try { await ctx.close(); } catch {} }
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
  let buf = new Float32Array(0);
  node.port.onmessage = (e) => {
    const chunk: Float32Array = e.data;
    const merged = new Float32Array(buf.length + chunk.length);
    merged.set(buf);
    merged.set(chunk, buf.length);
    buf = merged;
    if (buf.length >= ctx.sampleRate / 4) {
      // Mic level for the UI meter — proves audio is flowing before the
      // model says anything.
      let sum = 0;
      for (let i = 0; i < buf.length; i += 8) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / (buf.length / 8));
      emit({ type: "ui-level", value: Math.min(1, rms * 6) });
      worker?.postMessage({ type: "audio", samples: buf }, [buf.buffer]);
      buf = new Float32Array(0);
    }
  };
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  audio = { ctx, stream, src, node };

  emit({ type: "ui-status", message: "Warming up the engine…" });
  worker.postMessage({ type: "init", sampleRate: ctx.sampleRate });
}

export async function stopQt(): Promise<void> {
  worker?.postMessage({ type: "stop" });
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
  emit({ type: "ui-listen", state: "paused" });
}

export async function resumeQt(): Promise<void> {
  if (listen !== "paused" || !audio) return;
  try { await audio.ctx.resume(); } catch {}
  listen = "listening";
  emit({ type: "ui-listen", state: "listening" });
}

export async function teardownQt(): Promise<void> {
  await stopQt();
  worker?.terminate();
  worker = null;
}
