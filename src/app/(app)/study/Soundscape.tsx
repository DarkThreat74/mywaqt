"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";
import { useSoundscape, SOUNDSCAPES, type SoundId } from "@/components/soundscape-context";

/**
 * Soundscape picker — the audio engine itself lives in SoundscapeProvider so
 * playback survives navigation. A floating indicator appears app-wide while
 * a sound is playing.
 */
export default function Soundscape() {
  const { play: cue } = useUISFX();
  const { active, volume, start, stop, setVolume } = useSoundscape();

  function toggle(id: SoundId) {
    if (active === id) {
      stop();
      cue("toggle-off");
    } else {
      start(id);
      cue("toggle-on");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {SOUNDSCAPES.map((s) => {
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
                  ? <Volume2 className="h-4 w-4 animate-pulse" style={{ color: "var(--color-accent)" }} />
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
        Generated on-device — works offline, keeps playing as you navigate, and
        a small pill lets you pause it from anywhere. Keep the volume low.
      </p>
    </div>
  );
}
