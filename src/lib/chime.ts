"use client";

/* Tiny two-note nudge for the prayer-remind button — WebAudio only, no asset.
   Must be called inside a user gesture (or after one) so iOS unlocks the
   AudioContext. */

let ctx: AudioContext | null = null;

export function playNudge() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    // Soft bell: two sines a fifth apart, quick attack, exponential decay.
    for (const [freq, at] of [[987.77, 0], [1318.51, 0.08]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + at);
      gain.gain.linearRampToValueAtTime(0.14, t + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + at);
      osc.stop(t + at + 0.5);
    }
  } catch {
    // No audio support / context locked — silent is fine.
  }
}
