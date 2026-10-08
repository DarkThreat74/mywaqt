"use client";

import type { ReactNode } from "react";

/**
 * The refocus technique library.
 *
 * Every technique maps to a published mechanism for pulling attention back —
 * gaze control, eye-movement research, micro-break restoration, or paced
 * breathing. These are visual resets, not therapy: nothing here is EMDR and
 * nothing claims to permanently change attention.
 *
 *   1  Fixate        overt gaze narrowing → acetylcholine "spotlight" (Huberman;
 *                    mental focus follows visual focus)
 *   2  Sweep         horizontal smooth pursuit — pursuit recruits the
 *                    visual-attention network (Stubbs et al.)
 *   3  Rise          vertical smooth pursuit (orthogonal axis = fresh drive)
 *   4  Orbit         circular pursuit — the canonical lab pursuit stimulus
 *   5  Figure-8      lemniscate pursuit — H+V tracking in one path
 *   6  Edges         square-edge pursuit — four quarter-turns keep tracking
 *                    honest instead of coasting
 *   7  Snap          bilateral saccades L↔R ~1Hz — 30s of these boosts the
 *                    executive-attention network (Edlin & Lyle 2013)
 *   8  Corners       four-corner saccade grid — saccade + orienting to all
 *                    quadrants
 *   9  Count         numbered saccade targets — adding a counting task raises
 *                    attentional load and pursuit consistency (n-back finding)
 *  10  Near-Far      accommodation drill — dot zooms toward/away, the lens
 *                    works; accommodation effort is tied to alertness
 *  11  Converge     two dots close in and merge — convergence engagement
 *  12  Diverge      one dot splits to the screen edges — gaze widens, the
 *                    "soda-straw" tube opens
 *  13  Panoramic    open monitoring — hold center, widen awareness (arousal ↓)
 *  14  Drift        slow optokinetic drift — stare OKN rides a moving field;
 *                    keep eyes soft and let it carry them
 *  15  Sparks       covert attention — gaze locked center, notice peripheral
 *                    sparks WITHOUT moving your eyes (covert orienting)
 *  16  Sigh         paced breathing disc — ~4s in / ~6s out, the cyclic-sigh
 *                    pattern that beat meditation for arousal (Balban 2023)
 *  17  Beacons      5 peripheral points light in sequence — orienting scan,
 *                    a visual 5-4-3-2-1 grounding
 *  18  Aperture     a ring contracts to a point, again and again — the visual
 *                    field literally narrows to the target
 *  19  Horizon      a soft band sits low and wide — distance-gaze sim, the
 *                    relaxed-lens end of near-far work
 *  20  Meadow       drifting green field — the 40-second green-roof effect:
 *                    even a picture of vegetation restores directed attention
 *                    (Lee et al. 2015)
 */

export type AudioKind = "swell" | "ticks" | "drone" | "breath" | "bells";

export interface Technique {
  id: string;
  name: string;
  /** Roughly what it does to your attention — one honest clause. */
  mechanism: string;
  duration: number; // ms
  audio: AudioKind;
  steps: { at: number; label: string }[];
  Scene: (p: { t: number; rm: boolean }) => ReactNode;
}

const ACCENT = "var(--color-accent)";
const WARMTH = "var(--color-warmth)";
const SUCCESS = "var(--color-success)";
const cm = (tok: string, pct: number) =>
  `color-mix(in oklab, ${tok} ${pct}%, transparent)`;

function Dot({ x = 0, y = 0, size = 28, color = ACCENT, glow = 1, opacity = 1, blur = 0 }: {
  x?: number; y?: number; size?: number; color?: string; glow?: number; opacity?: number; blur?: number;
}) {
  return (
    <div
      className="absolute top-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        left: `calc(50% + ${x}vw)`,
        backgroundColor: color,
        boxShadow: `0 0 ${18 * glow}px ${4 * glow}px ${cm(color, 55)}, 0 0 ${48 * glow}px ${16 * glow}px ${cm(color, 25)}`,
        transform: `translate(-50%, -50%) translateY(${y}vh)`,
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    />
  );
}

function Ring({ r, p, color = ACCENT, opacity = 1 }: { r: number; p: number; color?: string; opacity?: number }) {
  return (
    <div
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: `${r}vw`,
        height: `${r}vw`,
        border: `1.5px solid ${cm(color, 35)}`,
        transform: `translate(-50%, -50%) scale(${p})`,
        opacity,
      }}
    />
  );
}

const TWO_PI = Math.PI * 2;

// phase helpers — each Scene gets t∈[0,1] over the technique's duration
const ease = (x: number) => x * x * (3 - 2 * x); // smoothstep

export const TECHNIQUES: Technique[] = [
  {
    id: "fixate",
    name: "The Spot",
    mechanism: "Narrow your gaze on one point and the brain's attention spotlight follows it.",
    duration: 15000,
    audio: "swell",
    steps: [
      { at: 0, label: "Fix your eyes on the dot" },
      { at: 6000, label: "Hold — let everything else blur" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => (
      <>
        <Ring r={50} p={1 - ease(Math.min(t / 0.4, 1)) * 0.55} opacity={0.7} />
        {/* a live breathing pulse keeps the eye anchored instead of glazing */}
        <CenterPulse t={t} rm={rm} />
      </>
    ),
  },
  {
    id: "sweep",
    name: "The Sweep",
    mechanism: "Following a moving target recruits the same network that holds attention.",
    duration: 15000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Follow the dot — eyes only, head still" },
      { at: 10000, label: "Slower… stay with it" },
      { at: 13500, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const amp = rm ? 9 : 32;
      const x = Math.sin(t * TWO_PI * 3) * amp;
      return <Dot x={x} size={30} />;
    },
  },
  {
    id: "rise",
    name: "The Rise",
    mechanism: "Vertical pursuit — a tracking path your eyes almost never get to train on.",
    duration: 14000,
    audio: "swell",
    steps: [
      { at: 0, label: "Follow it up and down — eyes only" },
      { at: 11000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const amp = rm ? 4 : 14;
      return <Dot y={Math.sin(t * TWO_PI * 3) * -amp} size={30} />;
    },
  },
  {
    id: "orbit",
    name: "The Orbit",
    mechanism: "Circular pursuit is the classic lab stimulus for training attentional tracking.",
    duration: 15000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Ride the circle — smooth, don't jump" },
      { at: 7500, label: "Keep it smooth" },
      { at: 13000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const r = rm ? 8 : 20;
      const a = t * TWO_PI * 2.5 - Math.PI / 2;
      return (
        <>
          <Ring r={r * 2 + 6} p={1} opacity={0.35} />
          <Dot x={Math.cos(a) * r} y={Math.sin(a) * r * 0.55} size={28} />
        </>
      );
    },
  },
  {
    id: "fig8",
    name: "The Eight",
    mechanism: "A figure-8 makes the eyes track horizontally and vertically at once.",
    duration: 15000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Trace the eight — eyes only" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const amp = rm ? 9 : 34;
      const th = t * TWO_PI * 2;
      return <Dot x={Math.sin(th) * amp} y={Math.sin(th) * Math.cos(th) * amp * 0.45} size={28} />;
    },
  },
  {
    id: "edges",
    name: "The Edges",
    mechanism: "A square path forces four corner-turns — tracking that can't coast.",
    duration: 15000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Ride the square — around the corners" },
      { at: 12500, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const w = rm ? 10 : 30, h = rm ? 5 : 12;
      // parametric walk around a rounded rectangle, two laps
      const laps = 2, u = (t * laps) % 1;
      const seg = u * 4;
      let x = 0, y = 0;
      if (seg < 1) { x = -w + seg * 2 * w; y = -h; }
      else if (seg < 2) { x = w; y = -h + (seg - 1) * 2 * h; }
      else if (seg < 3) { x = w - (seg - 2) * 2 * w; y = h; }
      else { x = -w; y = h - (seg - 3) * 2 * h; }
      return <Dot x={x} y={y} size={28} />;
    },
  },
  {
    id: "snap",
    name: "The Snap",
    mechanism: "Thirty seconds of left-right eye jumps measurably boosts executive attention.",
    duration: 14000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Snap to the dot each time it jumps" },
      { at: 11500, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const amp = rm ? 10 : 30;
      const side = Math.floor(t * 16) % 2 === 0 ? -1 : 1;
      return <Dot x={side * amp} size={30} />;
    },
  },
  {
    id: "corners",
    name: "The Corners",
    mechanism: "Jumping between all four quadrants wakes up the orienting network.",
    duration: 14000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Snap to each corner as it lights" },
      { at: 11500, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const w = rm ? 10 : 30, h = rm ? 6 : 14;
      const pts = [[-w, -h], [w, -h], [w, h], [-w, h]];
      const [x, y] = pts[Math.floor(t * 12) % 4];
      return <Dot x={x} y={y} size={30} />;
    },
  },
  {
    id: "count",
    name: "The Count",
    mechanism: "Tracking plus a counting task tightens pursuit — attention loves a job.",
    duration: 16000,
    audio: "ticks",
    steps: [
      { at: 0, label: "Follow it and count each stop" },
      { at: 13000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const amp = rm ? 10 : 28;
      const stops = 8;
      const k = Math.floor(t * stops);
      const x = (k % 2 === 0 ? -1 : 1) * amp * (0.4 + 0.6 * ((k * 37) % 10) / 10);
      const y = (((k * 53) % 10) / 10 - 0.5) * (rm ? 6 : 16);
      return (
        <div className="absolute top-1/2 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold tabular-nums"
          style={{
            left: `calc(50% + ${x}vw)`,
            transform: `translate(-50%, -50%) translateY(${y}vh)`,
            backgroundColor: ACCENT, color: "var(--color-paper)",
            boxShadow: `0 0 22px 6px ${cm(ACCENT, 45)}`,
          }}>
          {k + 1}
        </div>
      );
    },
  },
  {
    id: "nearfar",
    name: "Near and Far",
    mechanism: "Following the dot closer and farther works the lens — accommodation feeds alertness.",
    duration: 16000,
    audio: "swell",
    steps: [
      { at: 0, label: "Stay on it as it comes closer" },
      { at: 6000, label: "Now let it drift away" },
      { at: 13000, label: "Back to it" },
    ],
    Scene: ({ t }) => {
      const cycle = Math.sin(t * TWO_PI * 1.5);
      const size = 26 + (cycle * 0.5 + 0.5) * 60;
      return <Dot size={size} glow={1 + (size / 90)} blur={cycle > 0.6 ? 1.5 : 0} />;
    },
  },
  {
    id: "converge",
    name: "Converge",
    mechanism: "Two points close to one — the eyes converge the way they do reading up close.",
    duration: 14000,
    audio: "drone",
    steps: [
      { at: 0, label: "Watch them come together" },
      { at: 11000, label: "Back to it" },
    ],
    Scene: ({ t }) => {
      const p = ease((t * 3) % 1); // three merges across the duration
      const x = (26 - p * 26);
      return (
        <>
          <Dot x={-x} size={24} opacity={1 - p * 0.4} />
          <Dot x={x} size={24} opacity={1 - p * 0.4} />
          <Dot x={0} size={30} opacity={p > 0.92 ? 1 : 0} color={WARMTH} glow={1.4} />
        </>
      );
    },
  },
  {
    id: "diverge",
    name: "Diverge",
    mechanism: "One point becomes the edges — the narrow tube of attention opens wide.",
    duration: 14000,
    audio: "drone",
    steps: [
      { at: 0, label: "Keep your eyes on it as it splits" },
      { at: 8000, label: "Let your gaze go wide" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const p = ease(Math.min(t / 0.6, 1));
      const amp = rm ? 10 : 38;
      return (
        <>
          <Dot size={30} opacity={1 - p} />
          <Dot x={-amp * p} y={-12 * p} size={22} opacity={p} color={ACCENT} />
          <Dot x={amp * p} y={-12 * p} size={22} opacity={p} color={ACCENT} />
          <Dot x={-amp * p} y={12 * p} size={22} opacity={p} color={WARMTH} />
          <Dot x={amp * p} y={12 * p} size={22} opacity={p} color={WARMTH} />
        </>
      );
    },
  },
  {
    id: "pano",
    name: "The Wide Field",
    mechanism: "Softening your gaze to take in the whole screen dials arousal down.",
    duration: 15000,
    audio: "drone",
    steps: [
      { at: 0, label: "Soften your gaze — don't chase anything" },
      { at: 6000, label: "Take in the edges of the screen" },
      { at: 12500, label: "Back to it" },
    ],
    Scene: ({ t }) => (
      <>
        <Dot size={14} opacity={0.5} glow={0.4} />
        {[0.5, 0.8, 1.1].map((s, i) => (
          <Ring key={i} r={130} p={Math.min(Math.max((t - i * 0.06) / 0.5, 0), 1) * s}
            color={i % 2 ? WARMTH : ACCENT} opacity={Math.min(t / 0.5, 1) * 0.7} />
        ))}
      </>
    ),
  },
  {
    id: "drift",
    name: "The Drift",
    mechanism: "A slowly drifting field carries the eyes for you — let them ride it.",
    duration: 15000,
    audio: "drone",
    steps: [
      { at: 0, label: "Eyes soft — let the stripes carry your gaze" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const off = rm ? t * 4 : t * 18;
      return (
        <>
          <div className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(115deg, transparent 0 60px, ${cm(ACCENT, 12)} 60px 100px, transparent 100px 160px, ${cm(WARMTH, 10)} 160px 210px)`,
              backgroundPosition: `${off}vw 0`,
            }} />
          <Dot size={12} opacity={0.45} glow={0.3} />
        </>
      );
    },
  },
  {
    id: "sparks",
    name: "Sparks",
    mechanism: "Eyes stay center while you notice flashes at the edges — covert attention training.",
    duration: 15000,
    audio: "bells",
    steps: [
      { at: 0, label: "Eyes locked on the center — notice the sparks" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t }) => {
      // deterministic pseudo-random spark positions per window
      const k = Math.floor(t * 9);
      const spots = [[-34, -14], [36, 8], [-30, 14], [30, -12], [0, -16], [-38, 0], [38, 0], [-12, 16], [18, -16]];
      const [x, y] = spots[k % spots.length];
      const fade = 1 - ((t * 9) % 1);
      return (
        <>
          <Dot size={18} glow={0.8} />
          <Dot x={x} y={y} size={20} color={WARMTH} opacity={fade} glow={1.2} />
        </>
      );
    },
  },
  {
    id: "sigh",
    name: "The Sigh",
    mechanism: "Long slow exhales — the cyclic-sigh pattern — settle arousal faster than meditation.",
    duration: 18000,
    audio: "breath",
    steps: [
      { at: 0, label: "Breathe in as it grows" },
      { at: 4000, label: "Long slow breath out" },
      { at: 9000, label: "In again — full" },
      { at: 13000, label: "All the way out" },
    ],
    Scene: ({ t }) => {
      // 9s breath cycle: 3.5s in, 5.5s out → two cycles per 18s
      const c = (t * 18000) % 9000;
      const p = c < 3500 ? ease(c / 3500) : 1 - ease((c - 3500) / 5500);
      const inhale = c < 3500;
      return (
        <>
          <Ring r={20} p={0.6 + p * 1.4} color={inhale ? ACCENT : SUCCESS} opacity={0.9} />
          <Dot size={20 + p * 18} color={inhale ? ACCENT : SUCCESS} glow={0.9} />
        </>
      );
    },
  },
  {
    id: "beacons",
    name: "Beacons",
    mechanism: "Five points light in sequence — an orienting scan that walks your gaze home.",
    duration: 15000,
    audio: "bells",
    steps: [
      { at: 0, label: "Look at each light as it appears" },
      { at: 12000, label: "Back to the center" },
    ],
    Scene: ({ t }) => {
      const order = [[-32, -12], [32, -12], [0, 0], [-32, 12], [32, 12]];
      const active = Math.min(Math.floor(t * 6), 4);
      return (
        <>
          {order.map(([x, y], i) => (
            <Dot key={i} x={x} y={y} size={i === active ? 30 : 14}
              color={i === active ? ACCENT : WARMTH}
              opacity={i <= active ? (i === active ? 1 : 0.4) : 0.12}
              glow={i === active ? 1.3 : 0.4} />
          ))}
        </>
      );
    },
  },
  {
    id: "aperture",
    name: "The Aperture",
    mechanism: "A ring keeps collapsing to a point — your visual field narrows onto the target.",
    duration: 15000,
    audio: "swell",
    steps: [
      { at: 0, label: "Watch it close in" },
      { at: 5000, label: "Narrower" },
      { at: 12500, label: "Back to it" },
    ],
    Scene: ({ t }) => {
      const cyc = (t * 3) % 1;
      return (
        <>
          <Ring r={70} p={1 - ease(cyc) * 0.94} opacity={0.9} />
          <Dot size={16 + ease(cyc) * 12} glow={0.8 + ease(cyc) * 0.7} />
        </>
      );
    },
  },
  {
    id: "horizon",
    name: "The Horizon",
    mechanism: "A distant resting point — the same gaze your eyes make looking out a window.",
    duration: 14000,
    audio: "drone",
    steps: [
      { at: 0, label: "Rest your eyes on the line — gaze into it" },
      { at: 9000, label: "Let it go soft" },
      { at: 12000, label: "Back to it" },
    ],
    Scene: ({ t }) => {
      const glow = 0.5 + Math.sin(t * Math.PI) * 0.5;
      return (
        <>
          <div className="absolute left-0 right-0"
            style={{
              top: "62%",
              height: 2,
              background: `linear-gradient(90deg, transparent, ${cm(ACCENT, 60)} 20%, ${cm(WARMTH, 70)} 50%, ${cm(ACCENT, 60)} 80%, transparent)`,
              boxShadow: `0 0 ${20 + glow * 20}px ${cm(WARMTH, 40)}`,
            }} />
          <div className="absolute left-0 right-0 bottom-0"
            style={{ top: "62%", background: `linear-gradient(180deg, ${cm(SUCCESS, 8)}, transparent)` }} />
          <Dot y={11} size={16} opacity={0.6} glow={0.5} />
        </>
      );
    },
  },
  {
    id: "meadow",
    name: "The Meadow",
    mechanism: "Forty seconds of green restores attention better than concrete — this is the short version.",
    duration: 16000,
    audio: "bells",
    steps: [
      { at: 0, label: "Just look — nothing to track" },
      { at: 8000, label: "Let your eyes wander the field" },
      { at: 13500, label: "Back to it" },
    ],
    Scene: ({ t, rm }) => {
      const drift = rm ? 0 : t;
      return (
        <>
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(120vw 60vh at ${30 + drift * 20}% 70%, ${cm(SUCCESS, 22)}, transparent 60%), radial-gradient(100vw 50vh at ${75 - drift * 15}% 80%, ${cm(SUCCESS, 14)}, transparent 55%)` }} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute rounded-full"
              style={{
                width: `${26 + i * 14}vw`, height: `${26 + i * 14}vw`,
                left: `${15 + i * 26 + drift * (i % 2 ? 4 : -4)}vw`,
                top: `${55 + (i % 2) * 12}vh`,
                backgroundColor: cm(SUCCESS, 10 + i * 4),
                filter: "blur(2px)",
              }} />
          ))}
        </>
      );
    },
  },
];

/* ── Per-technique soundtracks ────────────────────────────────────────────
   Each kind is a small synthesized score on its own AudioContext, so refocus
   audio never touches the soundscape engine's graph.                    */

export function playTechniqueAudio(kind: AudioKind): () => void {
  const ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  const nodes: AudioNode[] = [];
  const now = ctx.currentTime;

  const tone = (freq: number, t0: number, dur: number, vol: number, type: OscillatorType = "sine") => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now + t0);
    g.gain.exponentialRampToValueAtTime(vol, now + t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
    o.connect(g).connect(master);
    o.start(now + t0);
    o.stop(now + t0 + dur + 0.05);
    nodes.push(o, g);
  };

  if (kind === "swell") {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(196, now);
    o.frequency.exponentialRampToValueAtTime(392, now + 11);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.45, now + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 14.5);
    o.connect(g).connect(master);
    o.start(); o.stop(now + 15);
    nodes.push(o, g);
    tone(659, 12.5, 2.2, 0.4);
  } else if (kind === "ticks") {
    for (let i = 0; i < 14; i++) tone(880, 0.4 + i, 0.15, 0.16, "triangle");
    tone(659, 13.6, 1.6, 0.35);
  } else if (kind === "drone") {
    for (const f of [98, 147]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.22, now + 2);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 14.5);
      o.connect(g).connect(master);
      o.start(); o.stop(now + 15);
      nodes.push(o, g);
    }
    tone(523, 12.8, 2, 0.3);
  } else if (kind === "breath") {
    // rising tone on inhale, falling on exhale — the pacer itself
    for (const start of [0, 9]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(220, now + start);
      o.frequency.linearRampToValueAtTime(330, now + start + 3.5);
      o.frequency.linearRampToValueAtTime(196, now + start + 9);
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.linearRampToValueAtTime(0.3, now + start + 0.6);
      g.gain.setValueAtTime(0.3, now + start + 8.4);
      g.gain.linearRampToValueAtTime(0.0001, now + start + 9);
      o.connect(g).connect(master);
      o.start(now + start); o.stop(now + start + 9.2);
      nodes.push(o, g);
    }
  } else {
    // bells — sparse chimes
    for (const [f, t0] of [[659, 0.5], [523, 4.5], [587, 8.5], [659, 12.5]] as const) {
      tone(f, t0, 2, 0.3);
      tone(f * 2, t0 + 0.05, 1.4, 0.1);
    }
  }

  return () => {
    try {
      for (const n of nodes) {
        try { (n as OscillatorNode).stop?.(); } catch { /* done */ }
        try { n.disconnect(); } catch { /* detached */ }
      }
      void ctx.close().catch(() => {});
    } catch { /* already closed */ }
  };
}

function CenterPulse({ t, rm }: { t: number; rm: boolean }) {
  const pulse = rm ? 1 : 1 + Math.sin(t * Math.PI * 20) * 0.08;
  return (
    <div
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: 26, height: 26,
        backgroundColor: ACCENT,
        boxShadow: `0 0 22px 5px ${cm(ACCENT, 55)}, 0 0 58px 19px ${cm(ACCENT, 25)}`,
        transform: `translate(-50%, -50%) scale(${pulse})`,
      }}
    />
  );
}
