"use client";

import Link from "next/link";
import { Volume2, VolumeX, Pause, Play, ChevronDown } from "lucide-react";
import { useSoundscape, SOUNDSCAPES } from "@/components/soundscape-context";

/**
 * Soundscape control panel — picker grid + volume + close. Rendered by the
 * unified FloatingDock when the sounds segment is tapped. Positioning is the
 * caller's job; this is just the card content.
 */
export function SoundscapePanel({ onCollapse }: { onCollapse?: () => void }) {
  const { active, paused, volume, start, stop, togglePause, setVolume } = useSoundscape();
  const label = active ? SOUNDSCAPES.find((s) => s.id === active)?.label ?? active : "Sounds";

  return (
    <div role="dialog" aria-label="Soundscape controls">
      {/* Header row — pause + collapse */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
          <Volume2 className={paused ? "h-3.5 w-3.5 shrink-0" : "h-3.5 w-3.5 shrink-0 animate-pulse"} style={{ color: "var(--color-accent)" }} />
          <span className="truncate">{label}{paused ? " · paused" : ""}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            onClick={togglePause}
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 32, minWidth: 32 }}
            aria-label={paused ? `Resume ${label} sound` : `Pause ${label} sound`}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)", minHeight: 32, minWidth: 32 }}
              aria-label="Minimize soundscape controls"
              aria-expanded={true}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>

      {/* Sound picker — 2-col compact grid, scrollable */}
      <div className="grid grid-cols-2 gap-1.5 overflow-y-auto" style={{ maxHeight: "11.5rem" }}>
        {SOUNDSCAPES.map((s) => {
          const isOn = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => start(s.id)}
              className="flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors"
              style={{
                borderColor: isOn ? "var(--color-accent)" : "var(--color-paper-3)",
                backgroundColor: isOn ? "color-mix(in oklab, var(--color-accent) 8%, var(--color-paper))" : "var(--color-paper)",
                color: isOn ? "var(--color-accent)" : "var(--color-ink)",
                minHeight: 36,
              }}
            >
              <span className="truncate">{s.label}</span>
              {isOn
                ? <Volume2 className="h-3 w-3 shrink-0" />
                : <VolumeX className="h-3 w-3 shrink-0" style={{ color: "var(--color-ink-muted)" }} />}
            </button>
          );
        })}
      </div>

      {/* Volume */}
      <div className="mt-2.5 flex items-center gap-2">
        <VolumeX className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ accentColor: "var(--color-accent)", backgroundColor: "var(--color-paper-3)" }}
          aria-label="Soundscape volume"
        />
        <Volume2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
      </div>

      {/* Footer — close + open study */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
        <button
          onClick={() => { stop(); onCollapse?.(); }}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 32 }}
        >
          Close
        </button>
        <Link
          href="/study"
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-accent)", minHeight: 32 }}
        >
          Open Study →
        </Link>
      </div>
    </div>
  );
}
