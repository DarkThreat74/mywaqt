"use client";

import { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

/**
 * Focus soundscapes — generated live with the Web Audio API.
 * No audio files: noise buffers are synthesized, so it works fully offline
 * and adds zero download weight.
 *
 * - White: equal energy per frequency — static-like masking.
 * - Pink:  -3 dB/octave — sounds like heavy rain (Paul Kellet's filter).
 * - Brown: -6 dB/octave — deep rumble like ocean/thunder.
 * - Night: brown through a gentle low-pass — muffled wind.
 */

type SoundId = "white" | "pink" | "brown" | "night" | "waves" | "fan" | "storm";

const SOUNDS: { id: SoundId; label: string; hint: string }[] = [
  { id: "brown", label: "Deep", hint: "Ocean rumble — most calming" },
  { id: "pink", label: "Rain", hint: "Heavy rain — best studied" },
  { id: "white", label: "Static", hint: "Full masking — sharpest focus" },
  { id: "night", label: "Night", hint: "Soft wind — gentlest" },
  { id: "waves", label: "Waves", hint: "Slow rolling surf" },
  { id: "fan", label: "Fan", hint: "Warm air, steady hum" },
  { id: "storm", label: "Storm", hint: "Distant rolling thunder" },
];

function makeNoiseBuffer(ctx: AudioContext, kind: SoundId): AudioBuffer {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const out = buffer.getChannelData(0);

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
  } else if (kind === "fan") {
    // White noise, softened — low-passed later in the chain too
    for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * 0.7;
  } else {
    // Brown / night / waves / storm: integrate white noise, then normalize
    let last = 0;
    for (let i = 0; i < out.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  }
  return buffer;
}

export default function Soundscape() {
  const { play: cue } = useUISFX();
  const [active, setActive] = useState<SoundId | null>(null);
  const [volume, setVolume] = useState(0.5);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  function stop() {
    for (const n of nodesRef.current) {
      try { (n as AudioBufferSourceNode | OscillatorNode).stop?.(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* not connected */ }
    }
    nodesRef.current = [];
  }

  function startSound(id: SoundId) {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.gain.value = volume;
      gainRef.current.connect(ctxRef.current.destination);
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    stop();
    const nodes: AudioNode[] = [];
    const source = ctx.createBufferSource();
    source.buffer = makeNoiseBuffer(ctx, id);
    source.loop = true;
    nodes.push(source);

    // Per-sound coloration chain
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

    switch (id) {
      case "night":
        addFilter("lowpass", 320);
        break;
      case "fan": {
        // Steady hum: softened white noise with a faint band resonance
        addFilter("lowpass", 900);
        addFilter("peaking", 120, 2);
        break;
      }
      case "waves": {
        // Rolling surf: brown noise + a slow amplitude swell (~8s cycle)
        const g = ctx.createGain();
        head.connect(g);
        head = g;
        nodes.push(g);
        addLfo(0.12, 0.55, g.gain);
        addFilter("lowpass", 1400);
        break;
      }
      case "storm": {
        // Distant thunder: heavily low-passed brown with a slow, deep swell
        const lp = addFilter("lowpass", 220);
        addLfo(0.07, 90, lp.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.8;
        head.connect(g);
        head = g;
        nodes.push(g);
        addLfo(0.09, 0.35, g.gain);
        break;
      }
      default:
        break;
    }

    head.connect(gainRef.current!);
    source.start();
    nodesRef.current = nodes;
  }

  function toggle(id: SoundId) {
    if (active === id) {
      stop();
      setActive(null);
      cue("toggle-off");
    } else {
      startSound(id);
      setActive(id);
      cue("toggle-on");
    }
  }

  // Live volume
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {SOUNDS.map((s) => {
          const isOn = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className="flex flex-col items-start gap-2 rounded-2xl border px-4 py-4 text-left transition-colors"
              style={{
                borderColor: isOn ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: isOn ? "color-mix(in oklab, var(--color-accent) 8%, var(--color-paper))" : "var(--color-paper)",
                minHeight: 88,
              }}
            >
              <span className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: isOn ? "var(--color-accent)" : "var(--color-ink)" }}>
                  {s.label}
                </span>
                {isOn
                  ? <Volume2 className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                  : <VolumeX className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />}
              </span>
              <span className="text-[11px] leading-snug" style={{ color: "var(--color-ink-muted)" }}>
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Volume */}
      <div className="mt-5 flex items-center gap-3">
        <VolumeX className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ accentColor: "var(--color-accent)", backgroundColor: "var(--color-paper-3)" }}
          aria-label="Volume"
        />
        <Volume2 className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Generated on-device — works offline, no downloads. Research suggests
        pink/brown noise gives a modest focus boost; keep the volume low.
      </p>
    </div>
  );
}
