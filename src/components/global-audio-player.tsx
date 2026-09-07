"use client";

import { useState, useEffect } from "react";
import { useAudioPlayer } from "@/components/audio-player-context";
import AdvancedAudioPlayer from "@/components/advanced-audio-player";

/**
 * Global audio player — rendered once in the (app) layout.
 * Survives route changes so background playback continues.
 * Reads from AudioPlayerContext.
 *
 * Uses a mounted guard instead of next/dynamic ssr:false to avoid
 * Server Components render errors in Next.js 16.
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
