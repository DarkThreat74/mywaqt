"use client";

import Link from "next/link";
import { ArrowLeft, Play, Music4 } from "lucide-react";
import { NASHEED_BY_SLUG } from "@/lib/nasheeds";
import { useAudioPlayer } from "@/components/audio-player-context";

const AR = /[؀-ۿ]/;
const ARABIC_NUMERAL = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];

function LyricLine({ line, chorus }: { line: string; chorus: boolean }) {
  const isArabic = AR.test(line);
  return (
    <p
      lang={isArabic ? "ar" : "en"}
      dir={isArabic ? "rtl" : "ltr"}
      className={
        isArabic
          ? chorus
            ? "text-center text-[1.6rem] leading-[2] sm:text-[1.8rem] sm:leading-[2.05]"
            : "text-center text-[1.5rem] leading-[2] sm:text-[1.7rem] sm:leading-[2.05]"
          : "text-center text-[0.95rem] leading-[1.9] sm:text-base"
      }
      style={{
        color: chorus
          ? "var(--color-accent)"
          : isArabic
            ? "var(--color-ink)"
            : "var(--color-ink-muted)",
        fontFamily: isArabic
          ? "var(--font-arabic, var(--font-amiri, serif))"
          : "inherit",
      }}
    >
      {line}
    </p>
  );
}

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

  const isPlaying = player.currentTrack?.id === `nasheed:${n.slug}`;
  // Verse numbers only count non-chorus stanzas — computed once so render
  // stays pure (a mutable counter mid-map trips react-hooks/immutability).
  const verseNums = n.verses.reduce<number[]>((acc, s) => {
    acc.push(s.chorus ? 0 : (acc[acc.length - 1] ?? 0) + 1);
    return acc;
  }, []);

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
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-4xl leading-[1.4] tracking-wide sm:text-[2.6rem]"
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

      {/* ── The text — chorus panels sit off the paper so the refrain is
          unmistakable; verses get a numbered ornament and ruled spacing. ── */}
      <div
        className="mt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        {n.verses.map((stanza, vi) => {
          if (stanza.chorus) {
            return (
              <section
                key={vi}
                aria-label="Chorus"
                className="my-5 rounded-2xl px-5 py-6 sm:px-8 sm:py-7"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-accent) 7%, var(--color-paper))",
                  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 18%, transparent)",
                }}
              >
                <p
                  className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--color-accent)" }}
                >
                  اللازمة
                </p>
                {stanza.lines.map((line, li) => (
                  <LyricLine key={li} line={line} chorus />
                ))}
              </section>
            );
          }
          const verseNo = verseNums[vi];
          return (
            <section
              key={vi}
              aria-label={`Verse ${verseNo}`}
              className="py-6 sm:py-7"
            >
              <div className="mb-3 flex items-center justify-center gap-3" aria-hidden="true">
                <span
                  className="h-px w-10"
                  style={{ backgroundColor: "var(--color-paper-3)" }}
                />
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-ink-muted)",
                    fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                  }}
                >
                  {ARABIC_NUMERAL[verseNo - 1] ?? verseNo}
                </span>
                <span
                  className="h-px w-10"
                  style={{ backgroundColor: "var(--color-paper-3)" }}
                />
              </div>
              {stanza.lines.map((line, li) => (
                <LyricLine key={li} line={line} chorus={false} />
              ))}
            </section>
          );
        })}
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
