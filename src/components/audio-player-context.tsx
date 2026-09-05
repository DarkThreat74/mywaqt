"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { PlayerTrack } from "@/components/advanced-audio-player";

interface AudioPlayerState {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  offlineStatus: Record<string, boolean>;
  play: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  selectTrack: (track: PlayerTrack) => void;
  setOffline: (talkId: string, isOffline: boolean) => void;
}

const AudioPlayerContext = createContext<AudioPlayerState | null>(null);

export function useAudioPlayer(): AudioPlayerState {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    // Return a no-op context if used outside provider — prevents crashes
    return {
      currentTrack: null,
      queue: [],
      offlineStatus: {},
      play: () => {},
      close: () => {},
      next: () => {},
      prev: () => {},
      selectTrack: () => {},
      setOffline: () => {},
    };
  }
  return ctx;
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [offlineStatus, setOfflineStatus] = useState<Record<string, boolean>>({});

  // Keep a ref to current track + queue for stable callbacks
  const trackRef = useRef(currentTrack);
  const queueRef = useRef(queue);
  useEffect(() => { trackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const play = useCallback((track: PlayerTrack, trackQueue?: PlayerTrack[]) => {
    setCurrentTrack(track);
    if (trackQueue) setQueue(trackQueue);
  }, []);

  const close = useCallback(() => {
    setCurrentTrack(null);
  }, []);

  const next = useCallback(() => {
    const track = trackRef.current;
    const q = queueRef.current;
    if (!track || q.length === 0) return;
    const idx = q.findIndex((t) => t.id === track.id);
    if (idx >= 0 && idx < q.length - 1) {
      setCurrentTrack(q[idx + 1]);
    }
  }, []);

  const prev = useCallback(() => {
    const track = trackRef.current;
    const q = queueRef.current;
    if (!track || q.length === 0) return;
    const idx = q.findIndex((t) => t.id === track.id);
    if (idx > 0) {
      setCurrentTrack(q[idx - 1]);
    }
  }, []);

  const selectTrack = useCallback((track: PlayerTrack) => {
    setCurrentTrack(track);
  }, []);

  const setOffline = useCallback((talkId: string, isOffline: boolean) => {
    setOfflineStatus((prev) => ({ ...prev, [talkId]: isOffline }));
  }, []);

  const value: AudioPlayerState = {
    currentTrack,
    queue,
    offlineStatus,
    play,
    close,
    next,
    prev,
    selectTrack,
    setOffline,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}
