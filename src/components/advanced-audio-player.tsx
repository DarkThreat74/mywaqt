"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw,
  Download, Trash2, Clock, Volume2, VolumeX, Volume1,
  ChevronUp, ChevronDown, Repeat, Repeat1, Shuffle,
  Gauge, Moon, Bookmark, BookmarkPlus, ListMusic,
  X, AlertCircle, RefreshCw, Airplay,
} from "lucide-react";
import { isAudioCached, removeAudioOffline, saveAudioOffline } from "@/components/audio-player-context";

// ─── Types ───

export interface PlayerTrack {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  streamUrl: string | null;
  externalUrl: string | null;
  fileSize: number | null;
  duration: number | null;
  folderId: string | null;
  folderName?: string | null;
  folderImageUrl?: string | null;
}

interface Bookmark {
  time: number;
  label: string;
  createdAt: number;
}

type RepeatMode = "off" | "one" | "all";
type PlayerView = "fab" | "mini" | "full" | "closed";

// ─── Helpers ───

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  return formatTime(seconds);
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Perceptual volume curve
function sliderToVolume(slider: number): number {
  return Math.pow(slider, 2.5);
}

function volumeToSlider(volume: number): number {
  return Math.pow(volume, 1 / 2.5);
}

// Throttle helper
function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  }) as T;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5 min", value: 5 * 60 },
  { label: "10 min", value: 10 * 60 },
  { label: "15 min", value: 15 * 60 },
  { label: "20 min", value: 20 * 60 },
  { label: "30 min", value: 30 * 60 },
  { label: "45 min", value: 45 * 60 },
  { label: "1 hour", value: 60 * 60 },
];

const PROGRESS_KEY = "waqt-player-progress";
const BOOKMARKS_KEY = "waqt-player-bookmarks";
const VOLUME_KEY = "waqt-player-volume";
const RATE_KEY = "waqt-player-rate";

// ─── Component ───

interface AdvancedAudioPlayerProps {
  track: PlayerTrack;
  queue: PlayerTrack[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTrackChange: (track: PlayerTrack) => void;
  onOfflineStatusChange: (talkId: string, isOffline: boolean) => void;
}

export default function AdvancedAudioPlayer({
  track,
  queue,
  onClose,
  onNext,
  onPrev,
  onTrackChange,
  onOfflineStatusChange,
}: AdvancedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [view, setView] = useState<PlayerView>("fab");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Advanced features state — initialized from localStorage
  const [playbackRate, setPlaybackRate] = useState(() => {
    try { return parseFloat(localStorage.getItem(RATE_KEY) || "1") || 1; } catch { return 1; }
  });
  const [volume, setVolume] = useState(() => {
    try { return parseFloat(localStorage.getItem(VOLUME_KEY) || "1") || 1; } catch { return 1; }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isShuffled, setIsShuffled] = useState(false);
  const [sleepTimer, setSleepTimer] = useState(0); // 0 = off, otherwise end time in seconds (absolute playback position)
  const [sleepStartVolume, setSleepStartVolume] = useState(1);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      const all = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
      return all[track.id] || [];
    } catch { return []; }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [showSleepControl, setShowSleepControl] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [airplayAvailable, setAirplayAvailable] = useState(false);

  // Refs for retry
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  // Sleep timer deadline and remaining seconds
  const [sleepEnd, setSleepEnd] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  // ─── Reset state when track changes ───
  // Without this, switching tracks leaves stale duration/currentTime from
  // the previous track, and the audio element may not reload properly.
  // Track change: reset state and auto-play if we were already playing.
  // The <audio> element remounts via key={track.id}, so the new element
  // starts paused. If isPlaying was true (user was listening), resume
  // playback on the new track automatically.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    wasPlayingRef.current = isPlaying;
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      setCurrentTime(0);
      setDuration(0);
      setBuffered(0);
      setIsLoading(true);
      setIsBuffering(false);
      setError(null);
      setRetryCount(0);
      setIsPlaying(false); // reset — the onPlay handler will set it back
    });
    const audio = audioRef.current;
    if (audio) {
      audio.load();
      if (wasPlayingRef.current) {
        // Auto-play the new track if the previous one was playing
        audio.play().catch(() => {
          // Autoplay blocked (e.g., iOS requires user gesture) — user can tap play
          setIsPlaying(false);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  // ─── Load bookmarks when track changes ───
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
      const bms = all[track.id] || [];
      // Defer to microtask to avoid set-state-in-effect
      Promise.resolve().then(() => setBookmarks(bms));
    } catch {
      Promise.resolve().then(() => setBookmarks([]));
    }
  }, [track.id]);

  // ─── Save bookmarks ───
  const saveBookmarks = useCallback((bms: Bookmark[]) => {
    try {
      const all = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "{}");
      all[track.id] = bms;
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(all));
    } catch { /* non-critical */ }
  }, [track.id]);

  // ─── Check if track is cached offline ───
  useEffect(() => {
    if (!track.streamUrl || !("caches" in window)) {
      Promise.resolve().then(() => setIsOffline(false));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cached = await isAudioCached(track.streamUrl!);
        if (!cancelled) Promise.resolve().then(() => setIsOffline(cached));
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [track.streamUrl]);

  // ─── Media Session position state helper ───
  const updatePositionState = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) return;
    // Guard: duration must be positive and finite, position must be 0..duration
    const dur = audio.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    const pos = Math.max(0, Math.min(audio.currentTime || 0, dur));
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: audio.playbackRate || 1,
        position: pos,
      });
    } catch { /* non-critical */ }
  }, []);

  // ─── Restore playback position ───
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const restore = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
        if (saved[track.id] && saved[track.id].time > 5 && saved[track.id].time < (audio.duration - 5)) {
          audio.currentTime = saved[track.id].time;
          Promise.resolve().then(() => setCurrentTime(saved[track.id].time));
        }
      } catch { /* non-critical */ }
    };
    // Restore after metadata loads
    const onMeta = () => {
      restore();
      Promise.resolve().then(() => setIsLoading(false));
      updatePositionState();
    };
    audio.addEventListener("loadedmetadata", onMeta);
    return () => audio.removeEventListener("loadedmetadata", onMeta);
  }, [track.id, updatePositionState]);

  // ─── Save playback position (throttled) ───
  // Saves to localStorage for instant resume + server for cross-device sync
  const persistProgress = useCallback((time: number, id: string) => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
      saved[id] = { time, updatedAt: Date.now() };
      // Keep only last 50 entries
      const ids = Object.keys(saved);
      if (ids.length > 50) {
        const sorted = ids.sort((a, b) => saved[b].updatedAt - saved[a].updatedAt);
        for (const oldId of sorted.slice(50)) delete saved[oldId];
      }
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(saved));
    } catch { /* non-critical */ }
    // Sync to server (best-effort, non-blocking)
    try {
      fetch("/api/talks/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talkId: id, position: Math.floor(time) }),
      }).catch(() => {});
    } catch { /* non-critical */ }
  }, []);
  const saveProgress = useMemo(() => throttle(persistProgress, 5000), [persistProgress]);

  const [shuffledQueue, setShuffledQueue] = useState<PlayerTrack[]>([]);
  useEffect(() => {
    if (!isShuffled) {
      Promise.resolve().then(() => setShuffledQueue([]));
      return;
    }
    const shuffled = [...queue];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    Promise.resolve().then(() => setShuffledQueue(shuffled));
  }, [isShuffled, queue]);

  const effectiveQueue = isShuffled && shuffledQueue.length === queue.length ? shuffledQueue : queue;
  const currentIndex = useMemo(() => effectiveQueue.findIndex((item) => item.id === track.id), [effectiveQueue, track.id]);
  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < effectiveQueue.length - 1) {
      onTrackChange(effectiveQueue[currentIndex + 1]);
    } else if (repeatMode === "all" && effectiveQueue.length > 0) {
      onTrackChange(effectiveQueue[0]);
    } else {
      onNext();
    }
  }, [currentIndex, effectiveQueue, onNext, onTrackChange, repeatMode]);
  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onTrackChange(effectiveQueue[currentIndex - 1]);
    } else if (repeatMode === "all" && effectiveQueue.length > 0) {
      onTrackChange(effectiveQueue[effectiveQueue.length - 1]);
    } else {
      onPrev();
    }
  }, [currentIndex, effectiveQueue, onPrev, onTrackChange, repeatMode]);

  // ─── Media Session API ───
  // Provides lock-screen / notification / media-hub metadata + controls.
  // Key fixes:
  //  - Artwork uses folder image (if available) at multiple sizes, falling back to app icons.
  //  - "artist" shows speaker, or folder name, or empty (never "Unknown speaker").
  //  - "album" shows folder name, or "Waqt Talks".
  //  - setPositionState is called on timeupdate so the notification seek bar tracks + is draggable.
  //  - seekto uses fastSeek when available for smooth scrubbing.

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Build artwork array — prefer folder image, fall back to app icons.
    const artwork: { src: string; sizes: string; type: string }[] = [];
    if (track.folderImageUrl) {
      // Folder image — provide as the primary artwork at common sizes.
      // The browser picks the best size; one src is enough but we declare multiple sizes
      // so Android Chrome can choose the right resolution for the notification.
      artwork.push({ src: track.folderImageUrl, sizes: "512x512", type: "image/png" });
      artwork.push({ src: track.folderImageUrl, sizes: "256x256", type: "image/png" });
      artwork.push({ src: track.folderImageUrl, sizes: "192x192", type: "image/png" });
    }
    // Always include app icons as fallback (Android Chrome needs multiple sizes).
    artwork.push({ src: "/icon-192.png", sizes: "192x192", type: "image/png" });
    artwork.push({ src: "/icon-512.png", sizes: "512x512", type: "image/png" });
    artwork.push({ src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png" });
    artwork.push({ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png" });

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      // Never show "Unknown speaker" — use folder name or empty string.
      artist: track.speaker || track.folderName || "",
      album: track.folderName || "Waqt Talks",
      artwork,
    });

    const setAction = (action: MediaSessionAction, handler: ((details: MediaSessionActionDetails) => void) | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* not supported */ }
    };

    setAction("play", () => { audioRef.current?.play().catch(() => {}); });
    setAction("pause", () => { audioRef.current?.pause(); });
    setAction("stop", () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    });
    setAction("seekbackward", (e) => {
      if (audioRef.current) {
        const offset = e.seekOffset ?? 15;
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - offset);
        updatePositionState();
      }
    });
    setAction("seekforward", (e) => {
      if (audioRef.current) {
        const offset = e.seekOffset ?? 30;
        audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + offset);
        updatePositionState();
      }
    });
    setAction("seekto", (e) => {
      if (audioRef.current && e.seekTime !== undefined) {
        const audio = audioRef.current as HTMLAudioElement & { fastSeek?: (t: number) => void };
        if (e.fastSeek && typeof audio.fastSeek === "function") {
          audio.fastSeek(e.seekTime);
        } else {
          audioRef.current.currentTime = e.seekTime;
        }
        updatePositionState();
      }
    });
    setAction("previoustrack", goPrev);
    setAction("nexttrack", goNext);

    return () => {
      setAction("play", null);
      setAction("pause", null);
      setAction("stop", null);
      setAction("seekbackward", null);
      setAction("seekforward", null);
      setAction("seekto", null);
      setAction("previoustrack", null);
      setAction("nexttrack", null);
    };
  }, [track, goNext, goPrev, updatePositionState]);

  // ─── AirPlay availability ───
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.remote) return;
    const handler = (available: boolean) => setAirplayAvailable(available);
    audio.remote.watchAvailability(handler).catch(() => setAirplayAvailable(false));
    return () => { try { audio.remote.cancelWatchAvailability(); } catch { /* non-critical */ } };
  }, []);

  // ─── Apply volume + rate to audio element ───
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : sliderToVolume(volume);
      audioRef.current.playbackRate = playbackRate;
      // preservesPitch keeps voices natural at different speeds
      const audio = audioRef.current as HTMLAudioElement & { preservesPitch?: boolean };
      audio.preservesPitch = true;
    }
  }, [volume, isMuted, playbackRate]);

  // ─── Save volume + rate ───
  useEffect(() => {
    try { localStorage.setItem(VOLUME_KEY, volume.toString()); } catch { /* non-critical */ }
  }, [volume]);
  useEffect(() => {
    try { localStorage.setItem(RATE_KEY, playbackRate.toString()); } catch { /* non-critical */ }
  }, [playbackRate]);

  // ─── Error retry with exponential backoff ───
  const attemptRetry = useCallback(() => {
    if (retryCount >= 5) {
      setError("Unable to load audio. Please check your connection and try again.");
      setIsBuffering(false);
      return;
    }
    const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s, 4s, 8s
    setRetryCount((c) => c + 1);
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const wasTime = audio.currentTime;
      audio.load();
      audio.currentTime = wasTime;
      // Only auto-play if the user had already started playback
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }, delay);
  }, [retryCount, isPlaying]);

  // ─── Audio event handlers ───
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Declare playback intent — prevents iOS silent/ring switch from muting talks
    // and improves speaker/Bluetooth routing. Harmless on non-iOS browsers.
    if ("audioSession" in navigator) {
      try { (navigator as unknown as { audioSession: { type: string } }).audioSession.type = "playback"; } catch { /* not supported */ }
    }

    if (isPlaying) {
      audio.pause();
    } else {
      setError(null);
      audio.play().catch(() => {
        // iOS may require a user gesture to unlock the audio element.
        // Attempt a silent unlock then retry.
        const unlock = audio;
        const resumeAt = unlock.currentTime;
        const resumeVolume = unlock.volume;
        unlock.muted = true;
        unlock.volume = 0;
        unlock.play().then(() => {
          unlock.pause();
          unlock.currentTime = resumeAt;
          unlock.muted = false;
          unlock.volume = resumeVolume;
          unlock.play().catch(() => {
            setError("Tap play again to start playback.");
          });
        }).catch(() => {
          unlock.muted = false;
          unlock.volume = resumeVolume;
          setError("Tap play again to start playback.");
        });
      });
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
    persistProgress(time, track.id);
    updatePositionState();
  }, [persistProgress, track.id, updatePositionState]);

  const skipBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
    updatePositionState();
  }, [updatePositionState]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (repeatMode === "one") {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
      return;
    }
    // Auto-mark talk as completed (100% reached)
    try {
      fetch("/api/talks/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talkId: track.id, completed: true, position: 0 }),
      }).catch(() => {});
    } catch { /* non-critical */ }
    // Clear saved progress for this track
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
      delete saved[track.id];
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(saved));
    } catch { /* non-critical */ }
    goNext();
  }, [repeatMode, track.id, goNext]);

  // ─── Background track-end fallback ───
  // iOS throttles the JS thread when backgrounded, so the "ended" event may not fire.
  // This interval acts as a backup to detect track end and advance the queue.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || !audio.duration || !isFinite(audio.duration)) return;
      // If we're within 0.5s of the end and the ended event didn't fire, advance
      if (audio.currentTime >= audio.duration - 0.5) {
        handleEnded();
      }
      // Keep Media Session position state fresh for lock-screen scrubbing
      if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: Math.min(audio.currentTime, audio.duration),
          });
        } catch { /* not supported */ }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, handleEnded]);

  // ─── Sleep timer logic (deadline-based with fade) ───
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (sleepTimer === 0) {
        setSleepEnd(null);
        setSleepRemaining(0);
        return;
      }
      setSleepEnd(Date.now() + sleepTimer * 1000);
      setSleepRemaining(sleepTimer);
      setSleepStartVolume(volume);
    });
    return () => { cancelled = true; };
  }, [sleepTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkSleepTimer = useCallback(() => {
    if (sleepEnd === null) return;
    const remaining = (sleepEnd - Date.now()) / 1000;
    setSleepRemaining(Math.max(0, Math.ceil(remaining)));
    const FADE = 30; // 30 second fade
    if (remaining <= 0) {
      audioRef.current?.pause();
      setSleepEnd(null);
      setSleepTimer(0);
      if (audioRef.current) audioRef.current.volume = sliderToVolume(volume);
      return;
    }
    if (remaining < FADE && audioRef.current) {
      audioRef.current.volume = sliderToVolume(sleepStartVolume) * (remaining / FADE);
    }
  }, [sleepEnd, sleepStartVolume, volume]);

  useEffect(() => {
    if (sleepEnd === null) return;
    const interval = setInterval(checkSleepTimer, 1000);
    return () => clearInterval(interval);
  }, [checkSleepTimer, sleepEnd]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target.isContentEditable) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBy(e.shiftKey ? -30 : -15);
          break;
        case "ArrowRight":
          e.preventDefault();
          skipBy(e.shiftKey ? 30 : 15);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => Math.min(1, v + 0.05));
          setIsMuted(false);
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => Math.max(0, v - 0.05));
          break;
        case "m":
          e.preventDefault();
          setIsMuted((m) => !m);
          break;
        case "n":
          e.preventDefault();
          goNext();
          break;
        case "p":
          e.preventDefault();
          goPrev();
          break;
        case "f":
          e.preventDefault();
          setView((v) => v === "full" ? "fab" : v === "fab" ? "mini" : "full");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePlayPause, skipBy, goNext, goPrev]);

  // ─── Double-tap to skip (mobile gesture) ───
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (view !== "full") return;
    const touch = e.changedTouches[0];
    const now = Date.now();
    const last = lastTapRef.current;

    if (last && now - last.time < 300 && Math.abs(touch.clientX - last.x) < 40) {
      // Double tap detected
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const tapX = touch.clientX - rect.left;
      const isLeft = tapX < rect.width / 2;
      skipBy(isLeft ? -10 : 10);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
    }
  }, [view, skipBy]);

  // ─── Bookmark management ───
  const addBookmark = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = audio.currentTime;
    const label = `Bookmark at ${formatTime(time)}`;
    const newBm: Bookmark = { time, label, createdAt: Date.now() };
    const updated = [...bookmarks, newBm].sort((a, b) => a.time - b.time);
    setBookmarks(updated);
    saveBookmarks(updated);
  }, [bookmarks, saveBookmarks]);

  const removeBookmark = useCallback((idx: number) => {
    const updated = bookmarks.filter((_, i) => i !== idx);
    setBookmarks(updated);
    saveBookmarks(updated);
  }, [bookmarks, saveBookmarks]);

  const jumpToBookmark = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
      updatePositionState();
    }
  }, [updatePositionState]);

  // ─── Offline save/remove ───
  const handleSaveOffline = useCallback(async () => {
    if (!track.streamUrl || isOffline) return;
    setIsSavingOffline(true);
    try {
      await saveAudioOffline(track.streamUrl, {
        talkId: track.id,
        title: track.title,
        fileSize: track.fileSize || undefined,
      });
      setIsOffline(true);
      onOfflineStatusChange(track.id, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save for offline use.";
      setError(msg);
    } finally {
      setIsSavingOffline(false);
    }
  }, [track, isOffline, onOfflineStatusChange]);

  const handleRemoveOffline = useCallback(async () => {
    if (!track.streamUrl) return;
    try {
      await removeAudioOffline(track.streamUrl);
      setIsOffline(false);
      onOfflineStatusChange(track.id, false);
    } catch { /* non-critical */ }
  }, [track, onOfflineStatusChange]);

  // ─── AirPlay ───
  const handleAirPlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio?.remote) {
      audio.remote.prompt().catch(() => {});
    }
  }, []);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    const audio = audioRef.current;
    const retryTimeout = retryTimeoutRef.current;
    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (audio) {
        persistProgress(audio.currentTime, track.id);
      }
    };
  }, [persistProgress, track.id]);

  // ─── Render ───

  if (!track.streamUrl && !track.externalUrl) return null;

  // External link only — no player
  if (!track.streamUrl && track.externalUrl) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-md" style={{ backgroundColor: "color-mix(in oklab, var(--color-paper) 95%, transparent)", borderColor: "var(--color-paper-3)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{track.title}</p>
            <p className="truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>External link</p>
          </div>
          <a href={track.externalUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>Open</a>
          <button onClick={onClose} className="rounded-lg p-2" style={{ color: "var(--color-ink-muted)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <>
      {/* Hidden audio element — key forces clean remount on track change */}
      <audio
        key={track.id}
        ref={audioRef}
        src={track.streamUrl || undefined}
        crossOrigin="anonymous"
        preload="auto"
        playsInline
        {...{ "x-webkit-airplay": "allow" }}
        onPlay={() => { setIsPlaying(true); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; }}
        onPause={() => { setIsPlaying(false); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; persistProgress(audioRef.current?.currentTime || 0, track.id); }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          saveProgress(t, track.id);
          checkSleepTimer();
          // Update buffered
          if (e.currentTarget.buffered.length > 0) {
            setBuffered(e.currentTarget.buffered.end(e.currentTarget.buffered.length - 1));
          }
          // Update Media Session position state so the notification seek bar tracks + is draggable.
          // The browser throttles timeupdate to ~4Hz so this is cheap.
          updatePositionState();
        }}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setIsLoading(false); updatePositionState(); }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onEnded={handleEnded}
        onError={(e) => {
          const audio = e.currentTarget;
          // Code 1 = aborted (user navigated or tapped play before URL loaded)
          // Code 2 = network error (R2 presigned URL not ready yet, or connection issue)
          // Both are transient — retry silently without showing an error.
          if (audio.error?.code === 1) {
            // Aborted — don't show error, just reset buffering state
            setIsBuffering(false);
            return;
          }
          if (audio.error?.code === 2) {
            // Network error — retry silently (R2 URL may still be generating)
            setIsBuffering(true);
            attemptRetry();
            return;
          }
          if (audio.error?.code === 3) {
            setError("Audio format not supported.");
          } else if (audio.error?.code === 4) {
            setError("Audio source not found.");
          }
        }}
        onStalled={() => setIsBuffering(true)}
        onSuspend={() => { /* browser paused buffering — normal */ }}
        className="hidden"
      />

      {/* ─── FAB (floating circle — minimized state) ─── */}
      {view === "fab" && (
        <button
          onClick={() => setView("mini")}
          className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 lg:bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          style={{
            right: "calc(env(safe-area-inset-right) + 1rem)",
            // Mobile: above the bottom nav (4rem). Desktop: overridden by lg: class.
            bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
            width: 56,
            height: 56,
            backgroundColor: "var(--color-accent)",
            boxShadow: "0 8px 24px -8px color-mix(in oklab, var(--color-accent) 60%, transparent)",
            animation: "player-fade-in 0.25s ease-out",
          }}
          aria-label="Open player"
        >
          {isBuffering ? (
            <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--color-paper)" }} />
          ) : isPlaying ? (
            <div className="flex items-end gap-0.5" aria-hidden>
              <div className="h-2.5 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.4s" }} />
              <div className="h-4 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.6s" }} />
              <div className="h-3 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.5s" }} />
            </div>
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" style={{ color: "var(--color-paper)" }} />
          )}
          {/* Mini progress ring around the FAB */}
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 56 56"
            style={{ pointerEvents: "none" }}
          >
            <circle cx="28" cy="28" r="26" fill="none" stroke="color-mix(in oklab, var(--color-paper) 30%, transparent)" strokeWidth="2" />
            <circle
              cx="28" cy="28" r="26" fill="none"
              stroke="var(--color-paper)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - progressPercent / 100)}`}
              style={{ transition: "stroke-dashoffset 0.3s linear" }}
            />
          </svg>
        </button>
      )}

      {/* ─── Mini Player (bottom bar) ─── */}
      {view === "mini" && (
        <div
          className="fixed left-0 right-0 z-50 border-t backdrop-blur-md lg:bottom-[calc(env(safe-area-inset-bottom)+0px)]"
          style={{
            // Mobile: sit above the bottom nav (~64px / 4rem tall).
            // Desktop: overridden by lg: class to sit at the bottom.
            bottom: "calc(4rem + env(safe-area-inset-bottom))",
            paddingBottom: 0,
            backgroundColor: "color-mix(in oklab, var(--color-paper) 96%, transparent)",
            borderColor: "var(--color-paper-3)",
            animation: "player-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Progress bar (thin, at top of bar) */}
          <div className="relative h-0.5 w-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
            <div className="absolute h-full" style={{ width: `${bufferedPercent}%`, backgroundColor: "color-mix(in oklab, var(--color-accent) 30%, transparent)" }} />
            <div className="absolute h-full" style={{ width: `${progressPercent}%`, backgroundColor: "var(--color-accent)" }} />
          </div>

          <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
            {/* Track info (tap to expand) */}
            <button onClick={() => setView("full")} className="flex min-w-0 flex-1 items-center gap-2.5 text-left sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                {isBuffering ? (
                  <RefreshCw className="h-4 w-4 animate-spin" style={{ color: "var(--color-accent)" }} />
                ) : isPlaying ? (
                  <div className="flex items-end gap-0.5" aria-hidden>
                    <div className="h-2 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.4s" }} />
                    <div className="h-3 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.6s" }} />
                    <div className="h-2.5 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.5s" }} />
                  </div>
                ) : (
                  <Play className="h-4 w-4 translate-x-0.5" style={{ color: "var(--color-accent)" }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{track.title}</p>
                <p className="truncate text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {track.speaker ? `${track.speaker} · ` : ""}{formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>
            </button>

            {/* Controls — compact on mobile, full on sm+ */}
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button onClick={() => skipBy(-15)} className="flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-soft)", minHeight: 36, minWidth: 36 }} aria-label="Skip back 15 seconds">
                <RotateCcw className="h-4 w-4" />
                <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>15s</span>
              </button>
              <button onClick={handlePlayPause} className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 sm:h-12 sm:w-12" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
              </button>
              <button onClick={() => skipBy(30)} className="flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-soft)", minHeight: 36, minWidth: 36 }} aria-label="Skip forward 30 seconds">
                <RotateCw className="h-4 w-4" />
                <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>30s</span>
              </button>
              <button onClick={() => setView("full")} className="hidden items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)] sm:flex" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Expand player">
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>

            {/* Minimize to bubble + Close */}
            <button onClick={() => setView("fab")} className="flex shrink-0 flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Minimize to bubble">
              <ChevronDown className="h-4 w-4" />
              <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>Bubble</span>
            </button>
            <button onClick={onClose} className="flex shrink-0 flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Close player">
              <X className="h-4 w-4" />
              <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>Close</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Full Player (bottom sheet) ─── */}
      {view === "full" && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)", animation: "player-fade-in 0.2s ease-out" }}
          onClick={() => setView("mini")}
        >
          <div
            className="relative w-full overflow-hidden rounded-t-3xl border sm:max-w-lg sm:rounded-3xl"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              maxHeight: "92dvh",
              animation: "player-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={handleTouchEnd}
          >
            {/* Drag handle — minimize to mini bar */}
            <div className="flex justify-center pt-2.5 pb-1" onClick={() => setView("mini")} role="button" aria-label="Minimize to bar">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            </div>

            {/* Minimize to FAB (left) + Close (right) */}
            <button onClick={() => setView("fab")} className="absolute left-3 top-3 flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Minimize to circle">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="absolute right-3 top-3 flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Close player">
              <X className="h-4 w-4" />
              <span className="text-[8px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>Close</span>
            </button>

            <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]" style={{ maxHeight: "calc(92dvh - 2rem)" }}>
              {/* ─── Track info ─── */}
              <div className="mb-5 mt-3 text-center">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, var(--color-ink) 0%, color-mix(in oklab, var(--color-ink) 80%, var(--color-accent)) 100%)", boxShadow: "0 12px 32px -12px color-mix(in oklab, var(--color-ink) 50%, transparent)" }}>
                  {isBuffering ? (
                    <RefreshCw className="h-8 w-8 animate-spin" style={{ color: "var(--color-paper)" }} />
                  ) : isPlaying ? (
                    <div className="flex items-end gap-1" aria-hidden>
                      <div className="h-4 w-1 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.4s" }} />
                      <div className="h-7 w-1 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.6s" }} />
                      <div className="h-5 w-1 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.5s" }} />
                      <div className="h-6 w-1 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-paper)", animationDuration: "0.7s" }} />
                    </div>
                  ) : (
                    <Play className="h-8 w-8 translate-x-0.5" style={{ color: "var(--color-paper)" }} />
                  )}
                </div>
                <h2 className="text-base font-bold leading-tight" style={{ color: "var(--color-ink)" }}>{track.title}</h2>
                {track.speaker && <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>{track.speaker}</p>}
                {track.description && <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{track.description}</p>}
                <div className="mt-2 flex items-center justify-center gap-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {track.duration && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {formatDuration(track.duration)}</span>}
                  {track.fileSize && <span>· {formatFileSize(track.fileSize)}</span>}
                  {isOffline && <span className="rounded-full px-1.5 py-0.5 font-medium" style={{ backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)", color: "var(--color-success)" }}>Offline</span>}
                  {sleepRemaining > 0 && <span className="rounded-full px-1.5 py-0.5 font-medium" style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 10%, transparent)", color: "var(--color-warmth)" }}>Sleep {formatTime(sleepRemaining)}</span>}
                </div>
              </div>

              {/* ─── Error ─── */}
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "color-mix(in oklab, var(--color-error) 30%, transparent)", backgroundColor: "color-mix(in oklab, var(--color-error) 8%, transparent)", color: "var(--color-error)" }} role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => { setError(null); setRetryCount(0); attemptRetry(); }} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}>Retry</button>
                </div>
              )}

              {/* ─── Progress bar ─── */}
              <div className="mb-2 flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{formatTime(currentTime)}</span>
                <div className="relative flex-1">
                  {/* Buffered indicator */}
                  <div className="absolute h-1.5 w-full rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
                  <div className="absolute h-1.5 rounded-full" style={{ width: `${bufferedPercent}%`, backgroundColor: "color-mix(in oklab, var(--color-accent) 25%, transparent)" }} />
                  {/* Seek bar */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="relative h-1.5 w-full cursor-pointer appearance-none rounded-full"
                    style={{ accentColor: "var(--color-accent)", background: "transparent" }}
                    aria-label="Seek"
                  />
                  {/* Progress overlay */}
                  <div className="pointer-events-none absolute left-0 top-0 h-1.5 rounded-full" style={{ width: `${progressPercent}%`, backgroundColor: "var(--color-accent)" }} />
                </div>
                <span className="w-12 shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{isLoading ? "--:--" : formatTime(duration)}</span>
              </div>

              {/* ─── Main controls ─── */}
              <div className="mb-4 flex items-center justify-center gap-3">
                {/* Shuffle */}
                <button
                  onClick={() => setIsShuffled((s) => !s)}
                  className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: isShuffled ? "var(--color-accent)" : "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
                  aria-label="Shuffle"
                  aria-pressed={isShuffled}
                >
                  <Shuffle className="h-4 w-4" />
                </button>

                {/* Previous */}
                <button
                  onClick={goPrev}
                  className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
                  aria-label="Previous track"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                {/* Skip back 15 */}
                <button
                  onClick={() => skipBy(-15)}
                  className="flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
                  aria-label="Skip back 15 seconds"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span className="text-[9px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>15s</span>
                </button>

                {/* Play/Pause */}
                <button
                  onClick={handlePlayPause}
                  className="flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", boxShadow: "0 6px 20px -6px color-mix(in oklab, var(--color-accent) 50%, transparent)" }}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
                </button>

                {/* Skip forward 30 */}
                <button
                  onClick={() => skipBy(30)}
                  className="flex flex-col items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
                  aria-label="Skip forward 30 seconds"
                >
                  <RotateCw className="h-5 w-5" />
                  <span className="text-[9px] font-semibold leading-none" style={{ color: "var(--color-ink-muted)" }}>30s</span>
                </button>

                {/* Next */}
                <button
                  onClick={goNext}
                  className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
                  aria-label="Next track"
                >
                  <SkipForward className="h-5 w-5" />
                </button>

                {/* Repeat */}
                <button
                  onClick={() => setRepeatMode((r) => r === "off" ? "all" : r === "all" ? "one" : "off")}
                  className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: repeatMode !== "off" ? "var(--color-accent)" : "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
                  aria-label={`Repeat: ${repeatMode}`}
                  aria-pressed={repeatMode !== "off"}
                >
                  {repeatMode === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                </button>
              </div>

              {/* ─── Secondary controls row ─── */}
              <div className="mb-4 flex items-center justify-center gap-1.5">
                {/* Speed */}
                <button
                  onClick={() => { setShowSpeedControl((s) => !s); setShowSleepControl(false); setShowBookmarks(false); setShowQueue(false); }}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: showSpeedControl ? "var(--color-accent)" : "var(--color-paper-3)",
                    color: playbackRate !== 1 ? "var(--color-accent)" : "var(--color-ink-muted)",
                    backgroundColor: showSpeedControl ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                  }}
                  aria-label="Playback speed"
                  aria-pressed={showSpeedControl}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {playbackRate}×
                </button>

                {/* Sleep timer */}
                <button
                  onClick={() => { setShowSleepControl((s) => !s); setShowSpeedControl(false); setShowBookmarks(false); setShowQueue(false); }}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: showSleepControl ? "var(--color-warmth)" : "var(--color-paper-3)",
                    color: sleepTimer > 0 ? "var(--color-warmth)" : "var(--color-ink-muted)",
                    backgroundColor: showSleepControl ? "color-mix(in oklab, var(--color-warmth) 8%, transparent)" : "transparent",
                  }}
                  aria-label="Sleep timer"
                  aria-pressed={showSleepControl}
                >
                  <Moon className="h-3.5 w-3.5" />
                  {sleepRemaining > 0 ? formatTime(sleepRemaining) : "Sleep"}
                </button>

                {/* Bookmark */}
                <button
                  onClick={() => { setShowBookmarks((s) => !s); setShowSpeedControl(false); setShowSleepControl(false); setShowQueue(false); }}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: showBookmarks ? "var(--color-accent)" : "var(--color-paper-3)",
                    color: showBookmarks ? "var(--color-accent)" : "var(--color-ink-muted)",
                    backgroundColor: showBookmarks ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                  }}
                  aria-label="Bookmarks"
                  aria-pressed={showBookmarks}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {bookmarks.length > 0 ? bookmarks.length : ""}
                </button>

                {/* Queue */}
                <button
                  onClick={() => { setShowQueue((s) => !s); setShowSpeedControl(false); setShowSleepControl(false); setShowBookmarks(false); }}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: showQueue ? "var(--color-accent)" : "var(--color-paper-3)",
                    color: showQueue ? "var(--color-accent)" : "var(--color-ink-muted)",
                    backgroundColor: showQueue ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                  }}
                  aria-label="Queue"
                  aria-pressed={showQueue}
                >
                  <ListMusic className="h-3.5 w-3.5" />
                  {effectiveQueue.length > 0 ? `${currentIndex + 1}/${effectiveQueue.length}` : ""}
                </button>

                {/* AirPlay */}
                {airplayAvailable && (
                  <button
                    onClick={handleAirPlay}
                    className="flex items-center justify-center rounded-full border px-2.5 py-1.5 transition-colors"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                    aria-label="AirPlay"
                  >
                    <Airplay className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Offline save */}
                <button
                  onClick={isOffline ? handleRemoveOffline : handleSaveOffline}
                  disabled={isSavingOffline}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
                  style={{
                    borderColor: isOffline ? "color-mix(in oklab, var(--color-success) 30%, transparent)" : "var(--color-paper-3)",
                    color: isOffline ? "var(--color-success)" : "var(--color-ink-muted)",
                    backgroundColor: isOffline ? "color-mix(in oklab, var(--color-success) 8%, transparent)" : "transparent",
                  }}
                  aria-label={isOffline ? "Remove offline copy" : "Save for offline use"}
                  aria-pressed={isOffline}
                >
                  {isSavingOffline ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : isOffline ? (
                    <Trash2 className="h-3.5 w-3.5" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {isOffline ? "Saved" : "Save"}
                </button>
              </div>

              {/* ─── Speed control panel ─── */}
              {showSpeedControl && (
                <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Playback Speed</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setPlaybackRate(rate)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: playbackRate === rate ? "var(--color-accent)" : "var(--color-paper)",
                          color: playbackRate === rate ? "var(--color-paper)" : "var(--color-ink-soft)",
                          border: "1px solid var(--color-paper-3)",
                        }}
                        aria-pressed={playbackRate === rate}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Sleep timer panel ─── */}
              {showSleepControl && (
                <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Sleep Timer</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SLEEP_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSleepTimer(opt.value)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: (opt.value === 0 && sleepTimer === 0) || (opt.value > 0 && sleepTimer === opt.value) ? "var(--color-warmth)" : "var(--color-paper)",
                          color: (opt.value === 0 && sleepTimer === 0) || (opt.value > 0 && sleepTimer === opt.value) ? "var(--color-paper)" : "var(--color-ink-soft)",
                          border: "1px solid var(--color-paper-3)",
                        }}
                        aria-pressed={(opt.value === 0 && sleepTimer === 0) || (opt.value > 0 && sleepTimer === opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>Audio fades out in the last 30 seconds before sleep.</p>
                </div>
              )}

              {/* ─── Bookmarks panel ─── */}
              {showBookmarks && (
                <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Bookmarks</p>
                    <button onClick={addBookmark} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }} aria-label="Add bookmark at current position">
                      <BookmarkPlus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  {bookmarks.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>No bookmarks yet. Tap &ldquo;Add&rdquo; to bookmark the current position.</p>
                  ) : (
                    <div className="space-y-1">
                      {bookmarks.map((bm, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-paper)]">
                          <button onClick={() => jumpToBookmark(bm.time)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            <Bookmark className="h-3 w-3 shrink-0" style={{ color: "var(--color-accent)" }} />
                            <span className="truncate text-xs" style={{ color: "var(--color-ink)" }}>{bm.label}</span>
                            <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>{formatTime(bm.time)}</span>
                          </button>
                          <button onClick={() => removeBookmark(i)} className="shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--color-paper-3)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Remove bookmark">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── Queue panel ─── */}
              {showQueue && (
                <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Queue ({effectiveQueue.length})</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {effectiveQueue.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => onTrackChange(t)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-paper)]"
                        style={{ backgroundColor: t.id === track.id ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent" }}
                      >
                        <span className="w-5 shrink-0 text-[10px] tabular-nums" style={{ color: t.id === track.id ? "var(--color-accent)" : "var(--color-ink-muted)" }}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium" style={{ color: t.id === track.id ? "var(--color-accent)" : "var(--color-ink)" }}>{t.title}</p>
                          {t.speaker && <p className="truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{t.speaker}</p>}
                        </div>
                        {t.id === track.id && isPlaying && (
                          <div className="flex items-end gap-0.5" aria-hidden>
                            <div className="h-2 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.4s" }} />
                            <div className="h-3 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.6s" }} />
                            <div className="h-2.5 w-0.5 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-accent)", animationDuration: "0.5s" }} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Volume control ─── */}
              <div className="mb-4 flex items-center gap-2">
                <button onClick={() => setIsMuted((m) => !m)} className="shrink-0" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label={isMuted ? "Unmute" : "Mute"}>
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : volume < 0.5 ? <Volume1 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volumeToSlider(volume)}
                  onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
                  style={{ accentColor: "var(--color-accent)", backgroundColor: "var(--color-paper-3)" }}
                  aria-label="Volume"
                />
              </div>

              {/* ─── Hint text ─── */}
              <p className="text-center text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                Double-tap left/right to skip 10s · Keyboard: space, ←→, ↑↓, m
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Animations ─── */}
      <style>{`
        @keyframes player-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes player-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (min-width: 640px) {
          @keyframes player-slide-up {
            from { transform: translateY(20px) scale(0.96); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}

