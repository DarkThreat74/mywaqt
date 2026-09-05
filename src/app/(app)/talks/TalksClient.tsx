"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ExternalLink, Folder, ChevronLeft, Play, Clock, Headphones, Download, Search, X } from "lucide-react";
import { useAudioPlayer } from "@/components/audio-player-context";
import type { PlayerTrack } from "@/components/advanced-audio-player";

interface Folder {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

interface Talk {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  topics: string | null;
  folderId: string | null;
  storageKey: string | null;
  processedStorageKey: string | null;
  fileSize: number | null;
  duration: number | null;
  externalUrl: string | null;
  streamUrl: string | null;
  addedAt: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function talkToTrack(talk: Talk): PlayerTrack {
  return {
    id: talk.id,
    title: talk.title,
    speaker: talk.speaker,
    description: talk.description,
    streamUrl: talk.streamUrl,
    externalUrl: talk.externalUrl,
    fileSize: talk.fileSize,
    duration: talk.duration,
    folderId: talk.folderId,
  };
}

export default function TalksClient() {
  const { play, offlineStatus } = useAudioPlayer();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("/api/talks").catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          if (data?.folders) setFolders(data.folders);
          if (data?.talks) setTalks(data.talks);
        }
      } catch {
        /* non-critical */
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const talksInFolder = useCallback((folderId: string | null) =>
    talks.filter((t) => t.folderId === folderId), [talks]);

  const uncategorized = talksInFolder(null);

  // Debounce search input → searchQuery (200ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Client-side search across title, speaker, description, and folder name
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return null;
    return talks.filter((t) => {
      const folder = folders.find((f) => f.id === t.folderId);
      return (
        t.title.toLowerCase().includes(q) ||
        (t.speaker && t.speaker.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.topics && t.topics.toLowerCase().includes(q)) ||
        (folder && folder.name.toLowerCase().includes(q)) ||
        (folder && folder.description && folder.description.toLowerCase().includes(q))
      );
    });
  }, [talks, folders, searchQuery]);

  // Group search results by folder for display
  const searchResultsByFolder = useMemo(() => {
    if (!searchResults) return null;
    const grouped = new Map<string | null, Talk[]>();
    for (const t of searchResults) {
      const key = t.folderId;
      const arr = grouped.get(key) ?? [];
      arr.push(t);
      grouped.set(key, arr);
    }
    return grouped;
  }, [searchResults]);

  // Play a talk — builds the queue from siblings and delegates to the global player
  const playTalk = useCallback((talk: Talk) => {
    const siblings = talk.folderId ? talksInFolder(talk.folderId) : uncategorized;
    play(talkToTrack(talk), siblings.map(talkToTrack));
  }, [talksInFolder, uncategorized, play]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: "var(--color-accent)", borderRightColor: "var(--color-accent)" }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading talks…</p>
        </div>
      </div>
    );
  }

  // ── Folder view (inside a folder) ──
  if (selectedFolder) {
    const folderTalks = talksInFolder(selectedFolder.id);
    const folderQuery = searchQuery.toLowerCase();
    const filteredFolderTalks = folderQuery
      ? folderTalks.filter((t) =>
          t.title.toLowerCase().includes(folderQuery) ||
          (t.speaker && t.speaker.toLowerCase().includes(folderQuery)) ||
          (t.description && t.description.toLowerCase().includes(folderQuery)) ||
          (t.topics && t.topics.toLowerCase().includes(folderQuery))
        )
      : folderTalks;
    return (
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => { setSelectedFolder(null); setSearchInput(""); }}
          className="mb-4 flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <ChevronLeft className="h-4 w-4" /> All folders
        </button>

        <div className="mb-5">
          <div className="flex items-center gap-3">
            {selectedFolder.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedFolder.imageUrl}
                alt=""
                className="h-12 w-12 rounded-xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <Folder className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{selectedFolder.name}</h1>
              <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>{folderTalks.length} talks</p>
            </div>
          </div>
          {selectedFolder.description && (
            <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>{selectedFolder.description}</p>
          )}
        </div>

        {folderTalks.length > 3 && (
          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-ink-muted)" }} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search in this folder…"
              className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink)",
              }}
              aria-label="Search in folder"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
              </button>
            )}
          </div>
        )}

        {filteredFolderTalks.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {folderQuery ? "No talks match your search." : "No talks in this folder yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFolderTalks.map((talk) => (
              <TalkCard
                key={talk.id}
                talk={talk}
                onPlay={() => playTalk(talk)}
                isOffline={!!offlineStatus[talk.id]}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main view (folder list) ──
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Talks Library</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Curated lectures and khutbahs from trusted speakers
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-ink-muted)" }} />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by title, speaker, or topic…"
          className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
          }}
          aria-label="Search talks"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          </button>
        )}
      </div>

      {/* Search results view */}
      {searchResults ? (
        searchResults.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
              <Search className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>No talks found</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Try a different search term.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="px-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {searchResults.length} {searchResults.length === 1 ? "result" : "results"} for &ldquo;{searchQuery}&rdquo;
            </p>
            {Array.from(searchResultsByFolder!.entries()).map(([folderId, folderTalks]) => {
              const folder = folders.find((f) => f.id === folderId);
              return (
                <div key={folderId ?? "uncategorized"}>
                  {folder && (
                    <div className="mb-2 flex items-center gap-1.5 px-1">
                      <Folder className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} />
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{folder.name}</span>
                    </div>
                  )}
                  {!folder && folderId !== null && (
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Unknown folder</p>
                  )}
                  <div className="space-y-2">
                    {folderTalks.map((talk) => (
                      <TalkCard
                        key={talk.id}
                        talk={talk}
                        onPlay={() => playTalk(talk)}
                        isOffline={!!offlineStatus[talk.id]}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : folders.length === 0 && talks.length === 0 ? (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <Headphones className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>No talks available yet</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Lectures from trusted speakers will appear here soon.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Folders */}
          {folders.map((folder) => {
            const count = talksInFolder(folder.id).length;
            return (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder)}
                className="flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
              >
                {folder.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={folder.imageUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                    <Folder className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{folder.name}</p>
                  {folder.description && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>{folder.description}</p>
                  )}
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{count} {count === 1 ? "talk" : "talks"}</p>
                </div>
                <ChevronLeft className="h-4 w-4 rotate-180 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
              </button>
            );
          })}

          {/* Uncategorized talks (shown directly) */}
          {uncategorized.length > 0 && (
            <div>
              {folders.length > 0 && (
                <p className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Individual talks</p>
              )}
              <div className="space-y-2">
                {uncategorized.map((talk) => (
                  <TalkCard
                    key={talk.id}
                    talk={talk}
                    onPlay={() => playTalk(talk)}
                    isOffline={!!offlineStatus[talk.id]}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Talk Card ───

function TalkCard({ talk, onPlay, isOffline }: { talk: Talk; onPlay: () => void; isOffline: boolean }) {
  const isExternal = !talk.streamUrl && talk.externalUrl;
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-3.5 transition-colors"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Play button */}
      {isExternal ? (
        <a
          href={talk.externalUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}
          aria-label={`Open ${talk.title} externally`}
        >
          <ExternalLink className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </a>
      ) : (
        <button
          onClick={onPlay}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}
          aria-label={`Play ${talk.title}`}
        >
          <Play className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </button>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{talk.title}</h3>
        <div className="mt-0.5 flex items-center gap-2">
          {talk.speaker && (
            <span className="truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>{talk.speaker}</span>
          )}
          {talk.duration && (
            <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              <Clock className="h-2.5 w-2.5" /> {formatDuration(talk.duration)}
            </span>
          )}
          {isOffline && (
            <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: "color-mix(in oklab, var(--color-success) 10%, transparent)", color: "var(--color-success)" }}>
              <Download className="h-2 w-2" /> Offline
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
