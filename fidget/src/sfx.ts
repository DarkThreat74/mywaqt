// Synthesized fidget sounds for the worlds that ship no audio.
// Every toy gets its own voice: a per-toy hash varies base pitch,
// waveform and slide so no two pieces sound identical.
// Honored by the global Sound toggle.
import { prefs } from "./settings";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!prefs.sound) return null;
  const AC = window.AudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, f0: number, f1: number, type: OscillatorType, dur: number, gain = 0.15) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur);
}

function noise(c: AudioContext, dur: number, gain = 0.08) {
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const g = c.createGain();
  g.gain.value = gain;
  n.buffer = buf;
  n.connect(g).connect(c.destination);
  n.start();
}

// Per-toy character: hash of the id picks pitch (0.75–1.5×) and a
// waveform, so hose/button ≠ hose/toggle ≠ sakuga/button.
const WAVES: OscillatorType[] = ["sine", "triangle", "square", "sawtooth"];
function voice(toyId: string) {
  let h = 7;
  for (const ch of toyId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  h = Math.abs(h);
  return { pitch: 0.75 + (h % 100) / 133, wave: WAVES[h % WAVES.length], spark: (h >> 8) % 3 };
}

const PLAYERS: Record<string, (c: AudioContext, kind: "down" | "up", toyId: string) => void> = {
  cartoon(c, kind, id) {
    const v = voice(id);
    if (kind === "down") {
      tone(c, 240 * v.pitch, 80, v.wave === "sawtooth" ? "triangle" : v.wave, 0.12, 0.2);
      noise(c, 0.04 + v.spark * 0.015, 0.05);
    } else {
      tone(c, 90, 340 * v.pitch, "sine", 0.16, 0.18);
      tone(c, 180 * v.pitch, 520, v.wave, 0.1, 0.06);
    }
  },
  click(c, kind, id) {
    const v = voice(id);
    const f = (kind === "down" ? 1200 : 800) * v.pitch;
    tone(c, f, f * (kind === "down" ? 0.6 : 1.5), v.wave, 0.025 + v.spark * 0.008, 0.05);
    if (v.spark === 0) noise(c, 0.02, 0.03);
  },
  chip(c, kind, id) {
    const v = voice(id);
    if (kind === "down") tone(c, 880 * v.pitch, 220, v.wave, 0.07, 0.08);
    else tone(c, 440 * v.pitch, 990, v.wave, 0.06, 0.06);
  },
};

const WORLD_STYLE: Record<string, keyof typeof PLAYERS> = {
  hose: "cartoon", sakuga: "cartoon", cockpit: "click", pixel: "chip",
};

export function sfx(worldId: string, kind: "down" | "up", toyId = "") {
  const style = WORLD_STYLE[worldId];
  if (!style) return;
  const c = ac();
  if (c) PLAYERS[style](c, kind, toyId);
}
