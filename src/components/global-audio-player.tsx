"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAudioPlayer } from "@/components/audio-player-context";

// Lazy-load the heavy AdvancedAudioPlayer (~1200 lines, 21 lucide icons).
// This keeps it out of the initial bundle — it only loads when a track is played.
// ssr:false because it uses browser-only APIs (MediaSession, Cache API, etc.)
const AdvancedAudioPlayer = dynamic(
  () => import("@/components/advanced-audio-player"),
  { ssr: false }
);

/**
 * Global audio player — rendered once in the (app) layout.
 * Survives route changes so background playback continues.
 * Reads from AudioPlayerContext.
 *
 * Uses a mounted guard + next/dynamic ssr:false to avoid
 * Server Components render errors in Next.js 16 and keep the
 * heavy audio player out of the initial bundle.
 */
export default function GlobalAudioPlayer() {
  const { currentTrack, queue, close, next, prev, selectTrack, setOffline } = useAudioPlayer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => setMounted(true));
  }, []);

  // Don't render the player during SSR — it uses browser-only APIs
  if (!mounted || !currentTrack) return null;

  return (
    <AdvancedAudioPlayer
      track={currentTrack}
      queue={queue}
      onClose={close}
      onNext={next}
      onPrev={prev}
      onTrackChange={selectTrack}
      onOfflineStatusChange={setOffline}
    />
  );
}

// Re-export the hook for convenience
export { useAudioPlayer };
