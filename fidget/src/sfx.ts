// Synthesized fidget sounds for the worlds that ship no audio —
// hose/sakuga get cartoon pops, cockpit gets a soft mechanical click,
// pixel gets a chiptune blip. Honored by the global Sound toggle.
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

const PLAYERS: Record<string, (c: AudioContext, kind: "down" | "up") => void> = {
  cartoon(c, kind) {
    if (kind === "down") { tone(c, 220, 80, "sine", 0.12, 0.2); noise(c, 0.05, 0.05); }
    else { tone(c, 90, 340, "sine", 0.16, 0.18); tone(c, 180, 520, "triangle", 0.1, 0.06); }
  },
  click(c, kind) {
    if (kind === "down") { tone(c, 1400, 900, "square", 0.03, 0.05); noise(c, 0.02, 0.03); }
    else tone(c, 900, 1400, "square", 0.025, 0.04);
  },
  chip(c, kind) {
    if (kind === "down") tone(c, 880, 220, "square", 0.07, 0.08);
    else tone(c, 440, 990, "square", 0.06, 0.06);
  },
};

const WORLD_STYLE: Record<string, keyof typeof PLAYERS> = {
  hose: "cartoon", sakuga: "cartoon", cockpit: "click", pixel: "chip",
};

export function sfx(worldId: string, kind: "down" | "up") {
  const style = WORLD_STYLE[worldId];
  if (!style) return;
  const c = ac();
  if (c) PLAYERS[style](c, kind);
}
