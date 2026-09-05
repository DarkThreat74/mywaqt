"use client";

import dynamic from "next/dynamic";
import { useAudioPlayer } from "@/components/audio-player-context";

// Lazy load the heavy player component — only loads when a track is playing
const AdvancedAudioPlayer = dynamic(() => import("@/components/advanced-audio-player"), {
  ssr: false,
  loading: () => null,
});

/**
 * Global audio player — rendered once in the (app) layout.
 * Survives route changes so background playback continues.
 * Reads from AudioPlayerContext.
 */
export default function GlobalAudioPlayer() {
  const { currentTrack, queue, close, next, prev, selectTrack, setOffline } = useAudioPlayer();

  if (!currentTrack) return null;

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
