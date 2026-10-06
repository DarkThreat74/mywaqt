"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Global soundscape engine — owns the AudioContext for the study sounds so
 * playback survives page navigation. The Soundscape tab controls it; a
 * floating indicator lets the user pause from anywhere in the app, and the
 * Vox session overlay embeds a compact picker so audio can be chosen
 * mid-session.
 *
 * All sounds are synthesized (noise buffers + filter/LFO/drone chains) — no
 * audio files, works fully offline.
 */

export type SoundId =
  | "white" | "pink" | "brown" | "night" | "waves" | "fan" | "storm"
  | "crickets" | "cafe" | "ember"
  | "river" | "falls" | "wind" | "forest" | "dawn" | "cicadas"
  | "train" | "cabin" | "underwater" | "desert" | "purr"
  | "bowl" | "om" | "library" | "snow" | "meadow" | "tent" | "cave" | "sailboat";

export const SOUNDSCAPES: { id: SoundId; label: string; hint: string }[] = [
  { id: "pink",       label: "Rain",        hint: "Heavy rain — best studied" },
  { id: "brown",      label: "Deep",        hint: "Ocean rumble — most calming" },
  { id: "white",      label: "Static",      hint: "Full masking — sharpest focus" },
  { id: "night",      label: "Night",       hint: "Soft wind under a dark sky" },
  { id: "storm",      label: "Storm",       hint: "Rain + distant rolling thunder" },
  { id: "waves",      label: "Waves",       hint: "Slow rolling surf" },
  { id: "river",      label: "River",       hint: "Water running over stones" },
  { id: "falls",      label: "Waterfall",   hint: "Bright roaring cascade" },
  { id: "wind",       label: "Wind",        hint: "Gusts through open country" },
  { id: "desert",     label: "Desert",      hint: "Dry wind over dunes" },
  { id: "forest",     label: "Forest",      hint: "Leaves breathing in the trees" },
  { id: "meadow",     label: "Meadow",      hint: "Warm grassland breeze" },
  { id: "dawn",       label: "Dawn",        hint: "Early birdsong chorus" },
  { id: "crickets",   label: "Crickets",    hint: "Summer evening chorus" },
  { id: "cicadas",    label: "Cicadas",     hint: "Hot afternoon shimmer" },
  { id: "fan",        label: "Fan",         hint: "Warm air, steady hum" },
  { id: "train",      label: "Train",       hint: "Rails under a night carriage" },
  { id: "cabin",      label: "Cabin",       hint: "Airplane hum at altitude" },
  { id: "sailboat",   label: "Sailboat",    hint: "Hull rocking on slow water" },
  { id: "underwater", label: "Underwater",  hint: "Deep, muffled, weightless" },
  { id: "snow",       label: "Snowfall",    hint: "The quiet of falling snow" },
  { id: "tent",       label: "Tent rain",   hint: "Raindrops on canvas" },
  { id: "cave",       label: "Cave",        hint: "Drips echoing in the dark" },
  { id: "ember",      label: "Ember",       hint: "Fireside crackle" },
  { id: "library",    label: "Library",     hint: "Pages and hushed rustle" },
  { id: "cafe",       label: "Café",        hint: "Low murmur of a busy room" },
  { id: "purr",       label: "Purr",        hint: "A cat asleep nearby" },
  { id: "bowl",       label: "Bowl",        hint: "Singing-bowl drone" },
  { id: "om",         label: "Om",          hint: "Temple drone — low and warm" },
];

type NoiseKind = "white" | "pink" | "brown" | "crackle" | "none";

/** Which noise buffer each sound starts from. Drones start from silence. */
const NOISE: Record<SoundId, NoiseKind> = {
  white: "white", pink: "pink", brown: "brown",
  night: "pink", storm: "pink", waves: "brown", fan: "brown",
  river: "pink", falls: "white", wind: "pink", desert: "white",
  forest: "pink", meadow: "pink", dawn: "white", crickets: "white",
  cicadas: "white", train: "brown", cabin: "brown", sailboat: "brown",
  underwater: "brown", snow: "pink", tent: "crackle", cave: "crackle",
  ember: "crackle", library: "crackle", cafe: "white", purr: "brown",
  bowl: "none", om: "none",
};

function makeNoiseBuffer(ctx: AudioContext, kind: NoiseKind): AudioBuffer {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const out = buffer.getChannelData(0);

  if (kind === "none") return buffer; // silent — drones do the talking

  if (kind === "white") {
    for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1;
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
    // Brown-family: integrate white noise
    let last = 0;
    for (let i = 0; i < out.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
    if (kind === "crackle") {
      // Sparse impulses — crackle for a fire, thumps for tent rain,
      // pings for cave drips, rustle for the library. The chain shapes it.
      for (let n = 0; n < 90; n++) {
        const at = Math.floor(Math.random() * (out.length - 80));
        const amp = 0.5 + Math.random() * 0.5;
        for (let j = 0; j < 26; j++) {
          out[at + j] += amp * (Math.random() * 2 - 1) * (1 - j / 26);
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
    source.buffer = makeNoiseBuffer(ctx, NOISE[id]);
    source.loop = true;
    nodes.push(source);

    let head: AudioNode = source;
    // Small builder kit — each sound is just a chain of these.
    const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      head.connect(f);
      head = f;
      nodes.push(f);
      return f;
    };
    const lfo = (rate: number, depth: number, target: AudioParam, square = false) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = rate;
      if (square) o.type = "square";
      g.gain.value = depth;
      o.connect(g);
      g.connect(target);
      o.start();
      nodes.push(o, g);
      return o;
    };
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      head.connect(g);
      head = g;
      nodes.push(g);
      return g;
    };
    // Pure tone mixed straight into the master — for drones & hums.
    const drone = (freq: number, vol: number, type: OscillatorType = "sine") => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = type;
      g.gain.value = vol;
      o.connect(g);
      g.connect(gainRef.current!);
      o.start();
      nodes.push(o, g);
      return o;
    };

    switch (id) {
      case "night":
        // Audible soft wind — the old 220Hz brown filter was near-silent.
        filter("lowpass", 520);
        { const g = gain(0.85); lfo(0.06, 0.3, g.gain); }
        break;
      case "storm":
        // Rain wash + slow-moving low rumble so it reads as weather.
        filter("lowpass", 460);
        { const g = gain(0.9); lfo(0.08, 0.35, g.gain); }
        drone(48, 0.16);
        drone(97, 0.07);
        break;
      case "fan":
        filter("lowpass", 900);
        filter("peaking", 120, 2);
        drone(118, 0.06, "triangle");
        break;
      case "waves": {
        const g = gain(1);
        lfo(0.12, 0.55, g.gain);
        filter("lowpass", 1400);
        break;
      }
      case "river": {
        const bp = filter("bandpass", 850, 0.8);
        lfo(0.21, 240, bp.frequency);
        filter("lowpass", 2400);
        break;
      }
      case "falls":
        filter("lowpass", 1900);
        filter("peaking", 300, 0.8);
        gain(0.8);
        break;
      case "wind": {
        const bp = filter("bandpass", 420, 0.6);
        lfo(0.07, 260, bp.frequency);
        const g = gain(0.9);
        lfo(0.11, 0.3, g.gain);
        break;
      }
      case "desert": {
        filter("highpass", 1400);
        const bp = filter("bandpass", 2800, 0.7);
        lfo(0.05, 900, bp.frequency);
        gain(0.35);
        break;
      }
      case "forest": {
        filter("lowpass", 1100);
        const g = gain(0.7);
        lfo(0.16, 0.28, g.gain);
        break;
      }
      case "meadow": {
        const bp = filter("bandpass", 2300, 0.9);
        lfo(0.09, 500, bp.frequency);
        gain(0.4);
        break;
      }
      case "dawn":
        // High band-limited noise pulsed slowly — distant bird chorus
        filter("bandpass", 3600, 5);
        { const g = gain(0.3); lfo(3.4, 0.22, g.gain, true); }
        break;
      case "crickets":
        filter("bandpass", 4400, 6);
        { const g = gain(0.35); lfo(14, 0.35, g.gain, true); }
        break;
      case "cicadas":
        filter("bandpass", 5200, 4);
        { const g = gain(0.28); lfo(9, 0.26, g.gain, true); }
        break;
      case "train":
        filter("lowpass", 280);
        { const g = gain(0.9); lfo(1.9, 0.4, g.gain, true); }
        drone(62, 0.05, "triangle");
        break;
      case "cabin":
        filter("lowpass", 260);
        drone(95, 0.09, "triangle");
        drone(190, 0.03);
        break;
      case "sailboat": {
        filter("lowpass", 480);
        const g = gain(0.85);
        lfo(0.09, 0.4, g.gain);
        break;
      }
      case "underwater":
        filter("lowpass", 150);
        { const g = gain(0.95); lfo(0.15, 0.3, g.gain); }
        break;
      case "snow":
        filter("lowpass", 720);
        gain(0.55);
        break;
      case "tent":
        filter("lowpass", 950);
        gain(0.8);
        break;
      case "cave":
        filter("bandpass", 1300, 3);
        gain(0.5);
        break;
      case "ember": {
        const lp = filter("lowpass", 2600);
        lfo(0.05, 500, lp.frequency);
        break;
      }
      case "library":
        filter("lowpass", 640);
        gain(0.55);
        break;
      case "cafe": {
        const bp = filter("bandpass", 480, 1.1);
        lfo(0.09, 160, bp.frequency);
        gain(0.55);
        break;
      }
      case "purr": {
        filter("lowpass", 300);
        const g = gain(0.9);
        lfo(24, 0.85, g.gain, true);
        break;
      }
      case "bowl":
        drone(174, 0.3);
        drone(348, 0.1);
        drone(522, 0.04);
        break;
      case "om":
        drone(136.1, 0.3);
        drone(272.2, 0.1);
        drone(408.3, 0.04);
        break;
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
