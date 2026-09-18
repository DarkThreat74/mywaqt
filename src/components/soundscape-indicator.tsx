"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Volume2, VolumeX, Pause, Play, ChevronUp, ChevronDown } from "lucide-react";
import { useSoundscape, SOUNDSCAPES } from "@/components/soundscape-context";

/**
 * Floating "now playing" pill — appears whenever a study soundscape is active
 * and the user isn't on the study page. Tap to expand into a compact picker:
 * switch sounds, adjust volume, pause, or jump back to /study.
 *
 * Anchored above the bottom nav, the sync pill, AND the talks mini-player /
 * FAB via --player-active/--player-bar-h (set by AudioPlayerContext) so it
 * never overlaps them.
 */
export default function SoundscapeIndicator() {
  const { active, paused, volume, start, stop, togglePause, setVolume } = useSoundscape();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  // Hide on the study page — the tiles there already show what's playing
  if (!active || pathname === "/study") return null;

  const label = SOUNDSCAPES.find((s) => s.id === active)?.label ?? active;

  // Bottom anchor: nav (4rem) + safe-area + sync pill (~2.75rem) + talk bar
  // height when the audio player is active.
  const anchor = {
    right: "1rem",
    bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem + var(--player-active, 0) * var(--player-bar-h, 0px) + 2.75rem)",
  } as const;

  if (!expanded) {
    return (
      <div
        className="fixed z-50 flex items-center gap-1.5 rounded-full border px-2 py-1.5 shadow-lg backdrop-blur-md"
        style={{
          ...anchor,
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
        }}
        role="status"
        aria-label={`${label} soundscape ${paused ? "paused" : "playing"}`}
      >
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink)", minHeight: 32 }}
          aria-label={`${label} soundscape — expand controls`}
          aria-expanded={false}
        >
          <Volume2 className={paused ? "h-3.5 w-3.5" : "h-3.5 w-3.5 animate-pulse"} style={{ color: "var(--color-accent)" }} />
          {label}{paused ? " · paused" : ""}
          <ChevronUp className="h-3 w-3" style={{ color: "var(--color-ink-muted)" }} />
        </button>
        <button
          onClick={togglePause}
          className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 32, minWidth: 32 }}
          aria-label={paused ? `Resume ${label} sound` : `Pause ${label} sound`}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 rounded-2xl border p-3 shadow-lg backdrop-blur-md"
      style={{
        ...anchor,
        width: "min(19rem, calc(100vw - 2rem))",
        borderColor: "var(--color-paper-3)",
        backgroundColor: "color-mix(in oklab, var(--color-paper) 95%, transparent)",
      }}
      role="dialog"
      aria-label="Soundscape controls"
    >
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
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 32, minWidth: 32 }}
            aria-label="Minimize soundscape controls"
            aria-expanded={true}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* Sound picker — 2-col compact grid, scrollable if needed */}
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

      {/* Footer — stop + open study */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
        <button
          onClick={stop}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 32 }}
        >
          Stop
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
