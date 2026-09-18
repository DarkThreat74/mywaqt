"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Global soundscape engine — owns the AudioContext for the study sounds so
 * playback survives page navigation. The Soundscape tab controls it; a
 * floating indicator lets the user pause from anywhere in the app.
 *
 * All sounds are synthesized (noise buffers + filter/LFO chains) — no audio
 * files, works fully offline.
 */

export type SoundId =
  | "white" | "pink" | "brown" | "night" | "waves" | "fan" | "storm"
  | "crickets" | "cafe" | "ember";

export const SOUNDSCAPES: { id: SoundId; label: string; hint: string }[] = [
  { id: "brown", label: "Deep", hint: "Ocean rumble — most calming" },
  { id: "pink", label: "Rain", hint: "Heavy rain — best studied" },
  { id: "white", label: "Static", hint: "Full masking — sharpest focus" },
  { id: "night", label: "Night", hint: "Soft wind — gentlest" },
  { id: "waves", label: "Waves", hint: "Slow rolling surf" },
  { id: "fan", label: "Fan", hint: "Warm air, steady hum" },
  { id: "storm", label: "Storm", hint: "Distant rolling thunder" },
  { id: "crickets", label: "Crickets", hint: "Summer evening chorus" },
  { id: "cafe", label: "Café", hint: "Low murmur of a busy room" },
  { id: "ember", label: "Ember", hint: "Fireside crackle" },
];

function makeNoiseBuffer(ctx: AudioContext, kind: SoundId): AudioBuffer {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const out = buffer.getChannelData(0);

  if (kind === "white" || kind === "cafe" || kind === "crickets") {
    for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1;
  } else if (kind === "fan") {
    for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * 0.7;
  } else if (kind === "pink") {
    // Paul Kellet's pink-noise filter approximation
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < out.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    // Brown-family (brown/night/waves/storm/ember): integrate white noise
    let last = 0;
    for (let i = 0; i < out.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
    if (kind === "ember") {
      // Sparse crackle: occasional short impulses popping through the rumble
      for (let n = 0; n < 40; n++) {
        const at = Math.floor(Math.random() * (out.length - 80));
        const amp = 0.4 + Math.random() * 0.6;
        for (let j = 0; j < 30; j++) {
          out[at + j] += amp * (Math.random() * 2 - 1) * (1 - j / 30);
        }
      }
    }
  }
  return buffer;
}

interface SoundscapeContextValue {
  active: SoundId | null;
  paused: boolean;
  volume: number;
  start: (id: SoundId) => void;
  stop: () => void;
  togglePause: () => void;
  setVolume: (v: number) => void;
}

const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);

export function SoundscapeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<SoundId | null>(null);
  const [paused, setPaused] = useState(false);
  const [volume, setVolumeState] = useState(0.5);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  function stopNodes() {
    for (const n of nodesRef.current) {
      try { (n as AudioBufferSourceNode | OscillatorNode).stop?.(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* not connected */ }
    }
    nodesRef.current = [];
  }

  function start(id: SoundId) {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.gain.value = volume;
      gainRef.current.connect(ctxRef.current.destination);
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    setPaused(false);

    stopNodes();
    const nodes: AudioNode[] = [];
    const source = ctx.createBufferSource();
    source.buffer = makeNoiseBuffer(ctx, id);
    source.loop = true;
    nodes.push(source);

    let head: AudioNode = source;
    const addFilter = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      head.connect(f);
      head = f;
      nodes.push(f);
      return f;
    };
    const addLfo = (rate: number, depth: number, target: AudioParam) => {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = rate;
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain);
      lfoGain.connect(target);
      lfo.start();
      nodes.push(lfo, lfoGain);
    };
    const addGain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      head.connect(g);
      head = g;
      nodes.push(g);
      return g;
    };

    switch (id) {
      case "night":
        addFilter("lowpass", 320);
        break;
      case "fan":
        addFilter("lowpass", 900);
        addFilter("peaking", 120, 2);
        break;
      case "waves": {
        const g = addGain(1);
        addLfo(0.12, 0.55, g.gain);
        addFilter("lowpass", 1400);
        break;
      }
      case "storm": {
        const lp = addFilter("lowpass", 220);
        addLfo(0.07, 90, lp.frequency);
        const g = addGain(0.8);
        addLfo(0.09, 0.35, g.gain);
        break;
      }
      case "crickets": {
        // Band-passed white noise pulsed ~14Hz — a chirping chorus
        addFilter("bandpass", 4400, 6);
        const g = addGain(0.35);
        const lfo = ctx.createOscillator();
        lfo.type = "square";
        lfo.frequency.value = 14;
        const lg = ctx.createGain();
        lg.gain.value = 0.35;
        lfo.connect(lg);
        lg.connect(g.gain);
        lfo.start();
        nodes.push(lfo, lg);
        break;
      }
      case "cafe": {
        // Murmur: band-limited noise with a slowly wandering centre frequency
        const bp = addFilter("bandpass", 480, 1.1);
        addLfo(0.09, 160, bp.frequency);
        addGain(0.55);
        break;
      }
      case "ember": {
        const lp = addFilter("lowpass", 2600);
        addLfo(0.05, 500, lp.frequency);
        break;
      }
      default:
        break;
    }

    head.connect(gainRef.current!);
    source.start();
    nodesRef.current = nodes;
    setActive(id);
  }

  function stop() {
    stopNodes();
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
    setActive(null);
    setPaused(false);
  }

  function togglePause() {
    const ctx = ctxRef.current;
    if (!ctx || !active) return;
    if (paused) {
      void ctx.resume();
      setPaused(false);
    } else {
      void ctx.suspend();
      setPaused(true);
    }
  }

  function setVolume(v: number) {
    setVolumeState(v);
    if (gainRef.current) gainRef.current.gain.value = v;
  }

  useEffect(() => {
    return () => {
      stopNodes();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return (
    <SoundscapeContext.Provider value={{ active, paused, volume, start, stop, togglePause, setVolume }}>
      {children}
    </SoundscapeContext.Provider>
  );
}

export function useSoundscape() {
  const ctx = useContext(SoundscapeContext);
  if (!ctx) {
    return { active: null, paused: false, volume: 0.5, start: () => {}, stop: () => {}, togglePause: () => {}, setVolume: () => {} } as SoundscapeContextValue;
  }
  return ctx;
}
