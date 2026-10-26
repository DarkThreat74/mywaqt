"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, X, Play, Music4 } from "lucide-react";
import { NASHEEDS, type Nasheed } from "@/lib/nasheeds";
import { useAudioPlayer } from "@/components/audio-player-context";
import type { PlayerTrack } from "@/components/advanced-audio-player";

function trackOf(n: Nasheed): PlayerTrack {
  return {
    id: `nasheed:${n.slug}`,
    title: `${n.title} · ${n.arabic}`,
    speaker: n.artist ?? "Traditional",
    description: null,
    streamUrl: n.audio,
    externalUrl: null,
    fileSize: null,
    duration: null,
    folderId: "nasheeds",
    folderName: "Nasheeds",
  };
}

export default function NasheedsClient() {
  const [query, setQuery] = useState("");
  const player = useAudioPlayer();
  const queue = NASHEEDS.filter((n) => n.audio).map(trackOf);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? NASHEEDS.filter((n) =>
        n.title.toLowerCase().includes(trimmed) ||
        (n.artist ?? "").toLowerCase().includes(trimmed) ||
        n.arabic.includes(query.trim())
      )
    : NASHEEDS;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6">
        <h1
          className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl"
          style={{ color: "var(--color-ink)" }}
        >
          Nasheeds
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Scroll, choose, read along — lyrics in clear Arabic
        </p>
      </div>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--color-ink-muted)" }}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nasheeds…"
          aria-label="Search nasheeds"
          className="w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
            minHeight: 44,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          </button>
        )}
      </div>

      {/* ── The folder — a ruled register of nasheeds. Transliteration and
          munshid on the left, the Arabic title set large on the right. ── */}
      {filtered.length > 0 ? (
        <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          {filtered.map((n) => (
            <Link
              key={n.slug}
              href={`/nasheeds/${n.slug}`}
              className="flex items-center gap-4 border-b px-1 py-4 transition-colors hover:bg-[var(--color-paper-2)] sm:gap-5"
              style={{ borderColor: "var(--color-paper-3)" }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold leading-snug"
                  style={{ color: "var(--color-ink)" }}
                >
                  {n.title}
                </p>
                <p
                  className="mt-0.5 text-xs leading-snug"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {n.artist ?? "Traditional"} · {n.verses.flatMap((v) => v.lines).length} lines
                </p>
              </div>

              <p
                className="shrink-0 text-xl leading-[1.5] tracking-wide sm:text-2xl"
                style={{
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                  direction: "rtl",
                  textAlign: "right",
                }}
                lang="ar"
              >
                {n.arabic}
              </p>

              {n.audio && (
                <button
                  type="button"
                  aria-label={`Play ${n.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    player.play(trackOf(n), queue);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-3)]"
                  style={{
                    backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
                  }}
                >
                  <Play className="h-4 w-4 fill-current" style={{ color: "var(--color-accent)" }} />
                </button>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center rounded-2xl border p-8 text-center"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
          }}
        >
          <div
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
            }}
          >
            <Music4 className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink-soft)" }}>
            No nasheeds match &ldquo;{query.trim()}&rdquo;
          </p>
          <button
            onClick={() => setQuery("")}
            className="mt-4 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
