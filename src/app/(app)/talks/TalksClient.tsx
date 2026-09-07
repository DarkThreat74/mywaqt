"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ExternalLink, Folder, ChevronLeft, Play, Clock, Headphones, Download, Search, X, Mic2, Check, Loader2, History } from "lucide-react";
import { audioCacheKey, getCachedAudioKeys, removeAudioOffline, saveAudioOffline, useAudioPlayer } from "@/components/audio-player-context";
import type { PlayerTrack } from "@/components/advanced-audio-player";
const RECENT_KEY = "waqt:talks:recent";
const MAX_RECENT = 6;

interface Folder {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

interface Talk {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  topics: string | null;
  folderId: string | null;
  fileSize: number | null;
  duration: number | null;
  externalUrl: string | null;
  streamUrl: string | null;
  addedAt: string;
}

interface RecentEntry {
  id: string;
  title: string;
  speaker: string | null;
  folderId: string | null;
  folderName: string | null;
  addedAt: string;
}

type FilterPill = "all" | "folders" | "downloaded";

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

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentEntry =>
      typeof entry?.id === "string" &&
      typeof entry?.title === "string" &&
      (entry.speaker === null || typeof entry.speaker === "string") &&
      (entry.folderId === null || typeof entry.folderId === "string") &&
      (entry.folderName === null || typeof entry.folderName === "string") &&
      typeof entry.addedAt === "string"
    ).slice(0, MAX_RECENT);
  } catch { return []; }
}

function saveRecent(entry: RecentEntry) {
  try {
    const existing = loadRecent().filter((e) => e.id !== entry.id);
    existing.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(existing.slice(0, MAX_RECENT)));
  } catch { /* non-critical */ }
}

function removeRecent(id: string) {
  try {
    const existing = loadRecent().filter((e) => e.id !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(existing));
  } catch { /* non-critical */ }
}

export default function TalksClient() {
  const { play, offlineStatus, setOffline } = useAudioPlayer();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [talks, setTalks] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterPill>("all");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const res = await fetch("/api/talks");
        if (!res.ok) throw new Error("Failed to load talks");
        const data = await res.json();
        if (cancelled) return;
        const loadedTalks: Talk[] = Array.isArray(data.talks) ? data.talks : [];
        setFolders(Array.isArray(data.folders) ? data.folders : []);
        setTalks(loadedTalks);
        try {
          const cachedKeys = await getCachedAudioKeys();
          if (!cancelled) {
            setDownloadedIds(new Set(loadedTalks
              .filter((talk) => talk.streamUrl && cachedKeys.has(audioCacheKey(talk.streamUrl)))
              .map((talk) => talk.id)));
          }
        } catch { /* Cache Storage is unavailable */ }
      } catch {
        if (!cancelled) setError("We couldn't load the talks library. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    Promise.resolve().then(() => {
      if (!cancelled) setRecent(loadRecent());
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

  // Download a talk for offline use
  const handleDownload = useCallback(async (talk: Talk) => {
    if (!talk.streamUrl || downloadedIds.has(talk.id) || downloadingIds.has(talk.id)) return;
    setDownloadingIds((prev) => new Set(prev).add(talk.id));
    try {
      await saveAudioOffline(talk.streamUrl);
      setDownloadedIds((prev) => new Set(prev).add(talk.id));
      setOffline(talk.id, true);
      setDownloadError(null);
    } catch {
      setDownloadError("This talk couldn't be downloaded. Check your connection and available storage.");
    }
    finally {
      setDownloadingIds((prev) => { const n = new Set(prev); n.delete(talk.id); return n; });
    }
  }, [downloadedIds, downloadingIds, setOffline]);

  // Remove a talk from offline cache
  const handleRemoveDownload = useCallback(async (talk: Talk) => {
    if (!talk.streamUrl || !downloadedIds.has(talk.id)) return;
    try {
      await removeAudioOffline(talk.streamUrl);
      setDownloadedIds((prev) => { const n = new Set(prev); n.delete(talk.id); return n; });
      setOffline(talk.id, false);
      setDownloadError(null);
    } catch {
      setDownloadError("The offline copy couldn't be removed. Try again.");
    }
  }, [downloadedIds, setOffline]);

  // Play a talk — builds the queue from siblings, saves to recent
  const playTalk = useCallback((talk: Talk) => {
    const siblings = talk.folderId ? talksInFolder(talk.folderId) : uncategorized;
    play(talkToTrack(talk), siblings.map(talkToTrack));
    // Save to recently played
    const folder = folders.find((f) => f.id === talk.folderId);
    saveRecent({
      id: talk.id,
      title: talk.title,
      speaker: talk.speaker,
      folderId: talk.folderId,
      folderName: folder?.name || null,
      addedAt: talk.addedAt,
    });
    setRecent(loadRecent());
  }, [talksInFolder, uncategorized, play, folders]);

  // Remove a talk from recent history
  const handleRemoveRecent = useCallback((id: string) => {
    removeRecent(id);
    setRecent(loadRecent());
  }, []);

  // ── Loading state ──
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

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={Headphones} title="Talks couldn't load" subtitle={error}>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg px-3.5 py-2 text-xs font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Try again
          </button>
        </EmptyState>
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

        {/* Folder header */}
        <div className="mb-5">
          <div className="flex items-center gap-3">
            {selectedFolder.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedFolder.imageUrl}
                alt=""
                className="h-14 w-14 rounded-2xl object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <Folder className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>{selectedFolder.name}</h1>
              <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>{folderTalks.length} {folderTalks.length === 1 ? "talk" : "talks"}</p>
            </div>
          </div>
          {selectedFolder.description && (
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{selectedFolder.description}</p>
          )}
        </div>

        {/* In-folder search */}
        {folderTalks.length > 3 && (
          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-ink-muted)" }} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search in this folder…"
              className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
              aria-label="Search in folder"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]" aria-label="Clear search">
                <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
              </button>
            )}
          </div>
        )}

        {filteredFolderTalks.length === 0 ? (
          <EmptyState
            icon={folderQuery ? Search : Mic2}
            title={folderQuery ? "No matches found" : "This folder is empty"}
            subtitle={folderQuery ? "Try a different search term or clear the search to see all talks." : "Talks added to this folder will appear here. Check back soon."}
          />
        ) : (
          <div className="space-y-2">
            {filteredFolderTalks.map((talk) => (
              <TalkCard
                key={talk.id}
                talk={talk}
                onPlay={() => playTalk(talk)}
                isOffline={!!offlineStatus[talk.id] || downloadedIds.has(talk.id)}
                isDownloading={downloadingIds.has(talk.id)}
                onDownload={() => handleDownload(talk)}
                onRemoveDownload={() => handleRemoveDownload(talk)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main view (folder list + all talks) ──
  const downloadedTalks = talks.filter((t) => downloadedIds.has(t.id) || offlineStatus[t.id]);
  const availableRecent = recent.filter((entry) => talks.some((talk) => talk.id === entry.id));
  const showRecent = availableRecent.length > 0 && !searchQuery && activeFilter === "all";
  const showFolders = folders.length > 0 && (activeFilter === "all" || activeFilter === "folders") && !searchQuery;
  const showAllTalks = activeFilter === "all" || activeFilter === "downloaded";
  const talksToShow = activeFilter === "downloaded" ? downloadedTalks : talks;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Talks Library</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Curated lectures and khutbahs from trusted speakers
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-ink-muted)" }} />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by title, speaker, or topic…"
          className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          aria-label="Search talks"
        />
        {searchInput && (
          <button onClick={() => setSearchInput("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]" aria-label="Clear search">
            <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      {!searchQuery && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <FilterPill active={activeFilter === "all"} onClick={() => setActiveFilter("all")} label="All" />
          <FilterPill active={activeFilter === "folders"} onClick={() => setActiveFilter("folders")} label="Folders" />
          <FilterPill active={activeFilter === "downloaded"} onClick={() => setActiveFilter("downloaded")} label={`Downloaded${downloadedTalks.length > 0 ? ` (${downloadedTalks.length})` : ""}`} />
        </div>
      )}

      {downloadError && (
        <div
          role="alert"
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-xs"
          style={{ borderColor: "color-mix(in oklab, var(--color-error) 25%, transparent)", color: "var(--color-error)" }}
        >
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="flex h-8 w-8 shrink-0 items-center justify-center" aria-label="Dismiss download error">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search results view */}
      {searchResults ? (
        searchResults.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No talks found"
            subtitle={`Nothing matches "${searchQuery}". Try searching by title, speaker name, or topic.`}
          >
            <button onClick={() => setSearchInput("")} className="mt-4 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
              Clear search
            </button>
          </EmptyState>
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
                        isOffline={!!offlineStatus[talk.id] || downloadedIds.has(talk.id)}
                        isDownloading={downloadingIds.has(talk.id)}
                        onDownload={() => handleDownload(talk)}
                        onRemoveDownload={() => handleRemoveDownload(talk)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : folders.length === 0 && talks.length === 0 ? (
        /* Empty library — no folders and no talks at all */
        <EmptyState
          icon={Headphones}
          title="No talks available yet"
          subtitle="Lectures and khutbahs from trusted speakers will appear here. This library is curated by hand, not generated."
        />
      ) : activeFilter === "downloaded" && downloadedTalks.length === 0 ? (
        /* Downloaded filter active but nothing downloaded */
        <EmptyState
          icon={Download}
          title="Nothing downloaded yet"
          subtitle="Download talks to listen offline. Tap the download icon next to any talk to save it."
        >
          <button
            onClick={() => setActiveFilter("all")}
            className="mt-4 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Browse all talks
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {/* Continue Listening (recently played) */}
          {showRecent && (
            <RecentSection
              recent={availableRecent}
              onPlay={(talkId) => {
                const talk = talks.find((t) => t.id === talkId);
                if (talk) playTalk(talk);
              }}
              onRemove={handleRemoveRecent}
            />
          )}

          {/* Folders — 2-column grid on wider screens, single column on mobile */}
          {showFolders && (
            <section>
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Folders</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {folders.map((folder) => {
                  const count = talksInFolder(folder.id).length;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolder(folder)}
                      className="group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-[border-color,box-shadow] hover:border-[var(--color-paper-3)] hover:shadow-sm"
                      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
                    >
                      {folder.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={folder.imageUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-[var(--color-paper-3)]"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.03]"
                          style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}
                        >
                          <Folder className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{folder.name}</p>
                        {folder.description && (
                          <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>{folder.description}</p>
                        )}
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                          {count > 0 ? `${count} ${count === 1 ? "talk" : "talks"}` : "Empty"}
                        </p>
                      </div>
                      <ChevronLeft className="h-4 w-4 rotate-180 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--color-ink-muted)" }} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* All talks / downloaded talks */}
          {showAllTalks && (
            <section>
              {(showFolders || activeFilter === "downloaded") && (
                <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  {activeFilter === "downloaded" ? "Downloaded" : "All Talks"}
                </h2>
              )}
              {talksToShow.length === 0 ? (
                <p className="px-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>No talks available.</p>
              ) : (
                <div className="space-y-2">
                  {talksToShow.map((talk) => (
                    <TalkCard
                      key={talk.id}
                      talk={talk}
                      onPlay={() => playTalk(talk)}
                      isOffline={!!offlineStatus[talk.id] || downloadedIds.has(talk.id)}
                      isDownloading={downloadingIds.has(talk.id)}
                      onDownload={() => handleDownload(talk)}
                      onRemoveDownload={() => handleRemoveDownload(talk)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter Pill ───

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-3.5 py-2.5 text-xs font-medium transition-colors"
      style={
        active
          ? { backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }
          : { backgroundColor: "transparent", color: "var(--color-ink-muted)", border: "1px solid var(--color-paper-3)" }
      }
    >
      {label}
    </button>
  );
}

// ─── Continue Listening (Recently Played) ───

function RecentSection({
  recent,
  onPlay,
  onRemove,
}: {
  recent: RecentEntry[];
  onPlay: (talkId: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <History className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} />
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Continue Listening</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {recent.map((entry) => (
          <div key={entry.id} className="group relative w-36 shrink-0">
            <button
              onClick={() => onPlay(entry.id)}
              className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--color-paper-3)]"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <Play className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" style={{ color: "var(--color-ink)" }}>{entry.title}</p>
                <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {entry.speaker || entry.folderName || "Tap to resume"}
                </p>
              </div>
            </button>
            <button
              onClick={() => onRemove(entry.id)}
              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full transition-opacity"
              style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}
              aria-label="Remove from recent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Empty State ───

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border px-6 py-14 text-center"
      style={{
        borderColor: "var(--color-paper-3)",
        backgroundColor: "color-mix(in oklab, var(--color-paper) 60%, var(--color-paper-2))",
      }}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
          border: "1px solid color-mix(in oklab, var(--color-accent) 15%, transparent)",
        }}
      >
        <Icon className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</p>
      {subtitle && (
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

// ─── Talk Card ───

function TalkCard({
  talk,
  onPlay,
  isOffline,
  isDownloading,
  onDownload,
  onRemoveDownload,
}: {
  talk: Talk;
  onPlay: () => void;
  isOffline: boolean;
  isDownloading: boolean;
  onDownload: () => void;
  onRemoveDownload: () => void;
}) {
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
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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

      {/* Download / remove offline button — only for self-hosted talks */}
      {talk.streamUrl && !isExternal && (
        <button
          onClick={isOffline ? onRemoveDownload : onDownload}
          disabled={isDownloading}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
          style={{
            color: isOffline ? "var(--color-success)" : "var(--color-ink-muted)",
            backgroundColor: isOffline
              ? "color-mix(in oklab, var(--color-success) 10%, transparent)"
              : "transparent",
          }}
          aria-label={isOffline ? "Remove offline copy" : "Download for offline use"}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isOffline ? (
            <Check className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
