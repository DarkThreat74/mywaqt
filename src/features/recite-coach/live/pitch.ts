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
}

export interface PitchStream {
  stop(): void;
  frames: () => PitchFrame[]; // ring of recent frames, oldest → newest
  sampleRate: number;
}

const RING = 360; // ~3.8s at ~95fps effective hop
const MIN_RUN_MS = 80; // voiced runs shorter than this are blips

export async function startPitchStream(): Promise<PitchStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      latency: 0 as unknown as number,
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
  let runStart = -1;
  let med: number[] = [];

  node.port.onmessage = (ev: MessageEvent) => {
    const { hz, clarity, rms, noiseFloor, t } = ev.data;
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

    frames.push({ hz: voicedRaw ? f0 : 0, clarity, rms, voiced: voicedRaw, t });
    if (frames.length > RING) frames.shift();
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
    sampleRate: ctx.sampleRate,
  };
}

export function hzToNote(hz: number): string {
  if (hz <= 0) return "—";
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
