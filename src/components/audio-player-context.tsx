"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { PlayerTrack } from "@/components/advanced-audio-player";
import { getOfflineDB } from "@/lib/offline/db";

export const AUDIO_CACHE_NAME = "waqt-audio";

// Default download limit: 500 MB.
// User can change this in Settings (500MB / 1GB / 2GB / 3GB / Unlimited).
// When exceeded, oldest-played entries are evicted (LRU).
const DEFAULT_MAX_AUDIO_CACHE_BYTES = 500 * 1024 * 1024;
const DOWNLOAD_LIMIT_KEY = "waqt:download-limit-mb";

/**
 * Get the user's configured download limit in bytes.
 * Reads from localStorage; falls back to 500MB default.
 * Returns Infinity for "unlimited".
 */
export function getDownloadLimitBytes(): number {
  try {
    const stored = localStorage.getItem(DOWNLOAD_LIMIT_KEY);
    if (!stored) return DEFAULT_MAX_AUDIO_CACHE_BYTES;
    const mb = parseInt(stored, 10);
    if (isNaN(mb) || mb <= 0) return DEFAULT_MAX_AUDIO_CACHE_BYTES;
    return mb * 1024 * 1024;
  } catch {
    return DEFAULT_MAX_AUDIO_CACHE_BYTES;
  }
}

/**
 * Set the download limit (in MB). 0 = unlimited.
 */
export function setDownloadLimitMB(mb: number): void {
  try {
    localStorage.setItem(DOWNLOAD_LIMIT_KEY, String(mb));
  } catch { /* non-critical */ }
}

/**
 * Get the download limit in MB for display. 0 = unlimited.
 */
export function getDownloadLimitMB(): number {
  try {
    const stored = localStorage.getItem(DOWNLOAD_LIMIT_KEY);
    if (!stored) return 500;
    const mb = parseInt(stored, 10);
    return isNaN(mb) ? 500 : mb;
  } catch {
    return 500;
  }
}

export function audioCacheKey(url: string): string {
  const parsed = new URL(url, window.location.origin);
  const streamId = parsed.pathname === "/api/talks" ? parsed.searchParams.get("stream") : null;
  return `${parsed.origin}${parsed.pathname}${streamId ? `?stream=${streamId}` : ""}`;
}

export async function getCachedAudioKeys(): Promise<Set<string>> {
  const cache = await caches.open(AUDIO_CACHE_NAME);
  return new Set((await cache.keys()).map((request) => audioCacheKey(request.url)));
}

export async function isAudioCached(url: string): Promise<boolean> {
  return (await getCachedAudioKeys()).has(audioCacheKey(url));
}

/**
 * Get the total size of all cached audio entries (from manifest, fast).
 * Falls back to 0 if the manifest is empty or unavailable.
 */
export async function getAudioCacheSize(): Promise<number> {
  try {
    const db = getOfflineDB();
    const entries = await db.talkDownloads.toArray();
    return entries.reduce((sum, e) => sum + (e.size || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Get the count of downloaded talks.
 */
export async function getAudioCacheCount(): Promise<number> {
  try {
    const db = getOfflineDB();
    return await db.talkDownloads.count();
  } catch {
    return 0;
  }
}

/**
 * Evict oldest-played entries until the total cache size is under the limit.
 * Uses LRU (least recently used) based on lastPlayedAt.
 */
async function evictLRUIfNeeded(): Promise<void> {
  try {
    const db = getOfflineDB();
    const cache = await caches.open(AUDIO_CACHE_NAME);
    let totalSize = await getAudioCacheSize();
    const maxBytes = getDownloadLimitBytes();

    if (totalSize <= maxBytes) return;

    // Sort by lastPlayedAt ascending (oldest first) and evict until under limit
    const entries = await db.talkDownloads.orderBy("lastPlayedAt").toArray();
    for (const entry of entries) {
      if (totalSize <= maxBytes) break;
      // Delete from Cache API
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter((req) => audioCacheKey(req.url) === entry.cacheKey)
          .map((req) => cache.delete(req))
      );
      // Delete from manifest
      await db.talkDownloads.delete(entry.cacheKey);
      totalSize -= entry.size || 0;
    }
  } catch {
    // non-critical — eviction is best-effort
  }
}

/**
 * Check available storage before downloading.
 * Returns an error message if storage is likely insufficient, or null if OK.
 */
async function checkStorageAvailable(estimatedFileSize: number): Promise<string | null> {
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const remaining = (estimate.quota || 0) - (estimate.usage || 0);
      // Need 2x the file size as headroom (cache + processing overhead)
      if (remaining < estimatedFileSize * 2) {
        return "Storage is almost full. Remove some offline talks to free space.";
      }
    } catch {
      // estimate() not available — proceed without check
    }
  }
  return null;
}

/**
 * Save a talk for offline use.
 * Checks storage, downloads, records in manifest, and evicts LRU if over limit.
 * Throws with a user-friendly message if storage is insufficient.
 */
export async function saveAudioOffline(
  url: string,
  metadata?: { talkId: string; title: string; fileSize?: number }
): Promise<void> {
  const key = audioCacheKey(url);

  // Check storage before downloading
  if (metadata?.fileSize) {
    const storageError = await checkStorageAvailable(metadata.fileSize);
    if (storageError) throw new Error(storageError);
  }

  const cache = await caches.open(AUDIO_CACHE_NAME);

  // Remove any existing entry for this talk (re-download)
  await Promise.all(
    (await cache.keys())
      .filter((request) => audioCacheKey(request.url) === key)
      .map((request) => cache.delete(request))
  );

  // Download and cache
  await cache.add(url);

  // Get the actual cached size — try arrayBuffer first, then content-length
  // header, then metadata fileSize as fallback
  const response = await cache.match(new Request(url), { ignoreVary: true });
  let actualSize = metadata?.fileSize || 0;
  if (response) {
    try {
      const buffer = await response.clone().arrayBuffer();
      actualSize = buffer.byteLength;
    } catch {
      // Fall back to content-length header if arrayBuffer fails
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        actualSize = parseInt(contentLength, 10) || actualSize;
      }
    }
  }

  // Record in manifest
  if (metadata) {
    try {
      const db = getOfflineDB();
      const now = Date.now();
      await db.talkDownloads.put({
        cacheKey: key,
        talkId: metadata.talkId,
        title: metadata.title,
        size: actualSize,
        cachedAt: now,
        lastPlayedAt: now,
      });
    } catch {
      // manifest is best-effort — the cache entry still works
    }
  }

  // Evict old entries if over the limit
  await evictLRUIfNeeded();

  // Notify listeners (e.g. settings page) that the download manifest changed
  window.dispatchEvent(new CustomEvent("waqt:audio-cache-changed"));
}

/**
 * Remove a talk from offline cache.
 */
export async function removeAudioOffline(url: string): Promise<void> {
  const key = audioCacheKey(url);
  const cache = await caches.open(AUDIO_CACHE_NAME);

  // Delete from Cache API
  await Promise.all(
    (await cache.keys())
      .filter((request) => audioCacheKey(request.url) === key)
      .map((request) => cache.delete(request))
  );

  // Delete from manifest
  try {
    const db = getOfflineDB();
    await db.talkDownloads.delete(key);
  } catch {
    // best-effort
  }

  // Notify listeners that the download manifest changed
  window.dispatchEvent(new CustomEvent("waqt:audio-cache-changed"));
}

/**
 * Update lastPlayedAt for a talk in the manifest (for LRU tracking).
 */
export async function touchAudioCache(url: string): Promise<void> {
  const key = audioCacheKey(url);
  try {
    const db = getOfflineDB();
    const entry = await db.talkDownloads.get(key);
    if (entry) {
      await db.talkDownloads.update(key, { lastPlayedAt: Date.now() });
    }
  } catch {
    // best-effort
  }
}

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

  // Set a CSS variable on the root when a track is loaded.
  // The layout uses this to add bottom padding so content isn't hidden behind the mini bar.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--player-active",
      currentTrack ? "1" : "0"
    );
  }, [currentTrack]);

  const play = useCallback((track: PlayerTrack, trackQueue?: PlayerTrack[]) => {
    setCurrentTrack(track);
    if (trackQueue) setQueue(trackQueue);
  }, []);

  const close = useCallback(() => {
    setCurrentTrack(null);
    // Clear Media Session metadata so the notification doesn't linger with stale data.
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        if ("setPositionState" in navigator.mediaSession) {
          navigator.mediaSession.setPositionState({ duration: 0, playbackRate: 1, position: 0 });
        }
      } catch { /* non-critical */ }
    }
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
