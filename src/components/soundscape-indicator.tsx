"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Volume2, Pause, Play } from "lucide-react";
import { useSoundscape, SOUNDSCAPES } from "@/components/soundscape-context";

/**
 * Floating "now playing" pill — appears whenever a study soundscape is active
 * and the user isn't on the study page. Lets them pause or jump back.
 * Sits above the bottom nav (and the sync pill) on mobile, bottom-right on
 * desktop — same pattern as the sync-status pill.
 */
export default function SoundscapeIndicator() {
  const { active, paused, togglePause } = useSoundscape();
  const pathname = usePathname();

  // Hide on the study page — the tiles there already show what's playing
  if (!active || pathname === "/study") return null;

  const label = SOUNDSCAPES.find((s) => s.id === active)?.label ?? active;

  return (
    <div
      className="fixed z-50 flex items-center gap-1.5 rounded-full border px-2 py-1.5 shadow-lg backdrop-blur-md"
      style={{
        borderColor: "var(--color-paper-3)",
        backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
        right: "1rem",
        bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem + var(--player-active, 0) * var(--player-bar-h, 0px) + 2.75rem)",
      }}
      role="status"
      aria-label={`${label} soundscape playing`}
    >
      <Link
        href="/study"
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ color: "var(--color-ink)", minHeight: 32 }}
      >
        <Volume2 className={paused ? "h-3.5 w-3.5" : "h-3.5 w-3.5 animate-pulse"} style={{ color: "var(--color-accent)" }} />
        {label}{paused ? " · paused" : ""}
      </Link>
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
