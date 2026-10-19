"use client";

// Live pitch stream: getUserMedia → AudioContext(latencyHint:0) → worklet.
// WebRTC processing is off — AEC/NS/AGC add buffering and AGC pumps sustained
// tones, breaking autocorrelation. Post-processing here is contour hygiene
// (median-of-3 kills octave jumps; octave snap; 80ms blip drop), display-side.

export interface PitchFrame {
  hz: number;      // 0 = unvoiced/noise
  clarity: number; // NSDF peak height 0..1
  rms: number;
  voiced: boolean;
  t: number;
  zcr: number;        // zero-crossing rate — breathiness/noise proxy
  centroid: number;   // spectral centroid Hz — brightness
  nasalRatio: number; // 220–380Hz energy share — ghunnah proxy
}

export interface PitchStream {
  stop(): void;
  frames: () => PitchFrame[];  // ring of recent frames, oldest → newest
  history: () => PitchFrame[]; // full session, for analysis
  /** Arm PCM capture — call right when the user starts reciting. */
  startRecording(): void;
  /** Stop capture; resolves with the session PCM plus t0 — the AudioContext
   * time of PCM sample 0, so frame-time events map onto audio positions. */
  stopRecording(): Promise<{ pcm: Float32Array; t0: number }>;
  sampleRate: number;
}

const RING = 360; // ~3.8s at ~95fps effective hop
const MIN_RUN_MS = 80; // voiced runs shorter than this are blips
// PCM capture cap — float32 at 48kHz is ~11.5MB/min; unbounded accumulation
// kills the tab on long sessions and the deep grade can't decode it anyway.
const MAX_PCM_SEC = 10 * 60;

export async function startPitchStream(): Promise<PitchStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      latency: 0,
      channelCount: 1,
    } as MediaTrackConstraints,
  });
  const ctx = new AudioContext({ latencyHint: 0 });
  await ctx.audioWorklet.addModule("/rc/pitch-worklet.js");
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "rc-pitch");
  // connect to a muted sink so the graph keeps pulling
  const sink = ctx.createGain();
  sink.gain.value = 0;
  src.connect(node).connect(sink).connect(ctx.destination);

  const frames: PitchFrame[] = [];
  const history: PitchFrame[] = [];
  let runStart = -1;
  let med: number[] = [];
  const pcmChunks: Float32Array[] = [];
  let pcmDone: (() => void) | null = null;
  let pcmT0 = 0;

  node.port.onmessage = (ev: MessageEvent) => {
    const d = ev.data;
    if (d.kind === "pcm") {
      const cap = MAX_PCM_SEC * ctx.sampleRate;
      const held = pcmChunks.reduce((s, c) => s + c.length, 0);
      if (held < cap) pcmChunks.push(d.samples);
      return;
    }
    if (d.kind === "pcm-start") { pcmT0 = d.t; return; }
    if (d.kind === "pcm-done") { pcmDone?.(); pcmDone = null; return; }
    const { hz, clarity, rms, noiseFloor, t, zcr = 0, centroid = 0, nasalRatio = 0 } = d;
    const voicedRaw = hz > 0 && clarity >= 0.6 && rms > noiseFloor * 5;

    // median-of-3 on voiced hz
    med.push(hz);
    if (med.length > 3) med.shift();
    const sorted = [...med].sort((a, b) => a - b);
    let f0 = sorted[sorted.length >> 1];

    // octave snap: if median sits ~an octave off the previous frame's, pull it in
    const prev = frames.length ? frames[frames.length - 1].hz : 0;
    if (voicedRaw && prev > 0 && f0 > 0) {
      while (f0 > prev * 1.9) f0 /= 2;
      while (f0 < prev * 0.53) f0 *= 2;
    }

    if (voicedRaw && runStart < 0) runStart = t;
    if (!voicedRaw) {
      med = [];
      // if the voiced run just ended and was shorter than MIN_RUN, erase its frames
      if (runStart >= 0 && (t - runStart) * 1000 < MIN_RUN_MS) {
        while (frames.length && frames[frames.length - 1].t >= runStart) frames.pop();
      }
      runStart = -1;
    }

    const frame: PitchFrame = { hz: voicedRaw ? f0 : 0, clarity, rms, voiced: voicedRaw, t, zcr, centroid, nasalRatio };
    frames.push(frame);
    if (frames.length > RING) frames.shift();
    history.push(frame);
  };

  return {
    stop() {
      node.port.onmessage = null;
      src.disconnect();
      node.disconnect();
      void ctx.close();
      for (const tr of stream.getTracks()) tr.stop();
    },
    frames: () => frames,
    history: () => history,
    startRecording() { pcmChunks.length = 0; node.port.postMessage("record-start"); },
    stopRecording() {
      return new Promise<{ pcm: Float32Array; t0: number }>((resolve) => {
        const finish = () => {
          const total = pcmChunks.reduce((s, c) => s + c.length, 0);
          const out = new Float32Array(total);
          let off = 0;
          for (const c of pcmChunks) { out.set(c, off); off += c.length; }
          resolve({ pcm: out, t0: pcmT0 });
        };
        pcmDone = finish;
        node.port.postMessage("record-stop");
        // If the worklet is already gone (mic died, stop() ran first) the
        // pcm-done reply never comes — resolve with what we have rather
        // than hanging the report forever.
        setTimeout(() => { if (pcmDone === finish) { pcmDone = null; finish(); } }, 1500);
      });
    },
    sampleRate: ctx.sampleRate,
  };
}

export function hzToNote(hz: number): string {
  if (hz <= 0) return "—";
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
