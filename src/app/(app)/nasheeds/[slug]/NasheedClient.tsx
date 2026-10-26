"use client";

import Link from "next/link";
import { ArrowLeft, Play, Music4 } from "lucide-react";
import { NASHEED_BY_SLUG } from "@/lib/nasheeds";
import { useAudioPlayer } from "@/components/audio-player-context";

export default function NasheedClient({ slug }: { slug: string }) {
  const player = useAudioPlayer();
  const n = NASHEED_BY_SLUG.get(slug);

  if (!n) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
        <p
          className="text-3xl leading-relaxed"
          lang="ar"
          style={{
            color: "var(--color-ink)",
            fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
          }}
        >
          غير موجود
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
          This nasheed isn&rsquo;t in the library yet.
        </p>
        <Link
          href="/nasheeds"
          className="mt-5 inline-block text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--color-accent)" }}
        >
          ← Back to nasheeds
        </Link>
      </div>
    );
  }

  const isPlaying =
    player.currentTrack?.id === `nasheed:${n.slug}`;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/nasheeds"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <ArrowLeft className="h-4 w-4" /> Nasheeds
      </Link>

      {/* ── Title block ── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-3xl leading-[1.4] tracking-wide sm:text-4xl"
            lang="ar"
            dir="rtl"
            style={{
              color: "var(--color-ink)",
              fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
            }}
          >
            {n.arabic}
          </h1>
          <p
            className="mt-2 text-sm font-medium"
            style={{ color: "var(--color-ink)" }}
          >
            {n.title}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {n.artist ?? "Traditional"}
          </p>
        </div>

        {n.audio && (
          <button
            type="button"
            aria-label={isPlaying ? `Playing ${n.title}` : `Play ${n.title}`}
            onClick={() =>
              player.play({
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
              })
            }
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              backgroundColor: isPlaying
                ? "var(--color-accent)"
                : "color-mix(in oklab, var(--color-accent) 12%, transparent)",
            }}
          >
            <Play
              className="h-5 w-5 fill-current"
              style={{ color: isPlaying ? "var(--color-paper)" : "var(--color-accent)" }}
            />
          </button>
        )}
      </div>

      {/* ── The text — stanzas like a lyric sheet, set large and slow.
          Hairlines divide verses; nothing else competes with the words. ── */}
      <div
        className="border-t"
        style={{
          borderColor: "var(--color-paper-3)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
        }}
      >
        {n.verses.map((verse, vi) => (
          <section
            key={vi}
            className="border-b py-6 sm:py-7"
            style={{ borderColor: "var(--color-paper-3)" }}
            aria-label={`Verse ${vi + 1}`}
          >
            {verse.map((line, li) => (
              <p
                key={li}
                lang="ar"
                dir="rtl"
                className="text-center text-[1.55rem] leading-[2.1] sm:text-[1.75rem] sm:leading-[2.15]"
                style={{
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                }}
              >
                {line}
              </p>
            ))}
          </section>
        ))}
      </div>

      {!n.audio && (
        <p
          className="mt-6 flex items-center justify-center gap-2 text-xs"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <Music4 className="h-3.5 w-3.5" />
          Audio coming soon — lyrics ready to read
        </p>
      )}
    </div>
  );
}
