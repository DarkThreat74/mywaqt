/**
 * Recitation session — a module-level singleton owning the worker + mic.
 * It deliberately lives outside React so navigating away from /quran-tester
 * keeps the session alive; a global toast (GlobalReciteToast) mirrors its
 * state and flashes on suspects wherever you are in the app.
 */

export type QtListen = "idle" | "warming" | "listening";

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

const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) { const c = ch.slice(0); this.port.postMessage(c, [c.buffer]); }
    return true;
  }
}
registerProcessor("qt-capture", Capture);
`;

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

  if (!worker) {
    worker = new Worker(new URL("./recite.worker.ts", import.meta.url));
    worker.onmessage = (e) => {
      const ev = e.data as QtEvent;
      if (ev.type === "ready") {
        listen = "listening";
        emit({ type: "ui-status", message: "Listening — recite anywhere in the Quran" });
      } else if (ev.type === "loading_status") {
        emit({ type: "ui-status", message: String(ev.message ?? "Loading…") });
      } else if (ev.type === "error") {
        emit({ type: "ui-error", message: String(ev.message ?? "Engine error") });
        void stopQt();
        return;
      }
      emit(ev);
    };
    worker.onerror = (e) => {
      emit({ type: "ui-error", message: "Engine failed to start." });
      listen = "idle";
      emit({ type: "ui-listen", state: "idle" });
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

  const ctx = new AudioContext();
  // iOS/Android browsers often create the context suspended even inside a
  // tap handler — mic shows "recording" but the worklet never runs and the
  // engine starves silently. Resume before wiring anything.
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
  const workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "qt-capture");
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
  node.connect(ctx.destination);
  audio = { ctx, stream, src, node };

  listen = "warming";
  emit({ type: "ui-listen", state: "warming" });
  emit({ type: "ui-status", message: "Warming up the engine…" });
  worker.postMessage({ type: "init", sampleRate: ctx.sampleRate });
  emit({ type: "ui-listen", state: listen });
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
