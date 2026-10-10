"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Play, Volume2 } from "lucide-react";
import { getSession, subscribeSession, segmentAt, sessionElapsed, setOverlayOpen } from "@/lib/study/session";
import { useSoundscape, SOUNDSCAPES } from "@/components/soundscape-context";
import { SoundscapePanel } from "@/components/soundscape-indicator";
import { useAudioPlayer } from "@/components/audio-player-context";
import FeedbackWidget from "@/components/feedback-widget";

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Unified floating dock — the ONE home for ambient pills so nothing ever
 * overlaps: study-session timer, soundscape, talks mini-player, feedback.
 * Segments appear only when relevant, inside a single anchored pill.
 */
export default function FloatingDock({ feedbackEnabled = false }: { feedbackEnabled?: boolean }) {
  const pathname = usePathname();
  const session = useSyncExternalStore(subscribeSession, getSession, getSession);
  const soundscape = useSoundscape();
  const player = useAudioPlayer();
  const [panel, setPanel] = useState<"sounds" | null>(null);

  // Live ticking only while a session is running — needed for the countdown.
  const [now, setNow] = useState(() => Date.now());
  const running = session.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const studySeg = running && !session.overlayOpen
    ? segmentAt(session.segments, sessionElapsed(now))
    : null;
  // Paged reading — the bubble mirrors the overlay's page clock, not the
  // chunk total: remaining ÷ pages-left minus time on the current page.
  const pageClock = session.status === "running" && studySeg && !studySeg.done && studySeg.segment.pages
    ? (() => {
        const seg = studySeg.segment;
        const done = session.pageDone?.[studySeg.index] ?? 0;
        const mark = session.pageMark?.[studySeg.index] ?? 0;
        const elapsedInSeg = seg.minutes * 60 - studySeg.remainingSec;
        const left = studySeg.remainingSec / Math.max(1, seg.pages! - done) - Math.max(0, elapsedInSeg - mark);
        return { page: (seg.pageStart ?? 1) + done, left };
      })()
    : null;
  const showSounds = !!soundscape.active && pathname !== "/study";
  const showTalks = !!player.currentTrack && player.view === "collapsed";

  // The + FAB only exists on the day calendar. When it's there the dock
  // stacks above it in the same lane; on other tabs the dock takes the
  // FAB's spot at the bottom-right.
  const fabPresent = pathname.startsWith("/calendar/day");

  if (!studySeg && !showSounds && !showTalks && !feedbackEnabled) return null;

  const seg = "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]";
  const soundLabel = soundscape.active ? SOUNDSCAPES.find((s) => s.id === soundscape.active)?.label ?? "Sound" : "Sounds";

  return (
    <>
      {/* Panels anchor above the dock */}
      {panel === "sounds" && (
        <div
          className="fixed z-50 rounded-2xl border p-3 shadow-lg backdrop-blur-md"
          style={{
            right: "1rem",
            // Track the dock's lane: 8.5rem (above the day-view FAB) or 5rem
            // (FAB's spot) + ~3rem of dock height. The old fixed 8rem sat
            // UNDER the dock on the day view — and under its z-60 too.
            bottom: fabPresent
              ? "calc(11.5rem + env(safe-area-inset-bottom))"
              : "calc(8rem + env(safe-area-inset-bottom))",
            width: "min(19rem, calc(100vw - 2rem))",
            borderColor: "var(--color-paper-3)",
            backgroundColor: "color-mix(in oklab, var(--color-paper) 95%, transparent)",
          }}
        >
          <SoundscapePanel onCollapse={() => setPanel(null)} />
        </div>
      )}

      <div
        // FAB lane: right-5 (1.25rem). On the day view the FAB occupies
        // bottom-20..bottom-20+3rem, so the dock stacks just above it;
        // elsewhere the dock drops into the FAB's own spot.
        className="fixed z-[60] flex items-center gap-0.5 rounded-full border p-1 shadow-lg backdrop-blur-md right-[calc(env(safe-area-inset-right)+1.25rem)] lg:right-[calc(env(safe-area-inset-right)+0.75rem)]"
        style={{
          bottom: fabPresent
            ? "calc(8.5rem + env(safe-area-inset-bottom))"
            : "calc(5rem + env(safe-area-inset-bottom))",
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
        }}
        role="toolbar"
        aria-label="Quick status"
      >
        {/* Study session — dark segment for contrast, live countdown */}
        {studySeg && (
          <button
            onClick={() => setOverlayOpen(true)}
            className="flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3 text-xs font-semibold"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 32 }}
            aria-label={`Open study session — ${studySeg.segment.label}, ${fmtClock(studySeg.remainingSec)} left`}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ color: studySeg.segment.kind === "break" ? "var(--color-success)" : "var(--color-accent)" }} />
            <span className="tabular-nums">
              {session.status === "running" && session.pausedAt ? "‖"
                : pageClock ? `p${pageClock.page} ${pageClock.left >= 0 ? fmtClock(Math.floor(pageClock.left)) : `+${fmtClock(Math.ceil(-pageClock.left))}`}`
                : fmtClock(studySeg.remainingSec)}
            </span>
            <span className="hidden max-w-[6rem] truncate text-[11px] font-normal opacity-80 sm:inline">{studySeg.segment.label}</span>
          </button>
        )}

        {/* Soundscape */}
        {showSounds && (
          <button
            onClick={() => setPanel((p) => (p === "sounds" ? null : "sounds"))}
            className={seg}
            style={{ color: soundscape.paused ? "var(--color-ink-muted)" : "var(--color-accent)", minHeight: 32 }}
            aria-label={`${soundLabel} soundscape — ${soundscape.paused ? "paused" : "playing"}`}
            aria-expanded={panel === "sounds"}
          >
            <Volume2 className={soundscape.paused ? "h-3.5 w-3.5" : "h-3.5 w-3.5 animate-pulse"} />
            <span className="max-w-[5rem] truncate">{soundLabel}</span>
          </button>
        )}

        {/* Talks mini-player — tap to open the half-sheet */}
        {showTalks && player.currentTrack && (
          <button
            onClick={() => player.setView("sheet")}
            className={seg}
            style={{ color: "var(--color-ink)", minHeight: 32 }}
            aria-label={`Open player — ${player.currentTrack.title}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
              <Play className="h-2.5 w-2.5 translate-x-px" />
            </span>
            <span className="max-w-[7rem] truncate">{player.currentTrack.title}</span>
          </button>
        )}

        {/* Feedback — utility segment, always last */}
        {feedbackEnabled && <FeedbackWidget docked />}
      </div>
    </>
  );
}
