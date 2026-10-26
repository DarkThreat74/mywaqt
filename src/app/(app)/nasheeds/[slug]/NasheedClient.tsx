"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Square, Music4 } from "lucide-react";
import { NASHEED_BY_SLUG } from "@/lib/nasheeds";
import { saveAudioOffline, useAudioPlayer } from "@/components/audio-player-context";

const AR = /[؀-ۿ]/;
const ARABIC_NUMERAL = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];

// Active word position inside a stanza: lines split proportionally to their
// character count, words sweep evenly across a line.
function stanzaCursor(
  stanza: { lines: string[] },
  start: number,
  end: number,
  now: number,
): { line: number; word: number } | null {
  if (now < start || now >= end) return null;
  const weights = stanza.lines.map((l) => Math.max(l.length, 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let target = ((now - start) / (end - start)) * total;
  for (let li = 0; li < weights.length; li++) {
    if (target < weights[li]) {
      const words = stanza.lines[li].split(" ").length;
      return { line: li, word: Math.floor((target / weights[li]) * words) };
    }
    target -= weights[li];
  }
  return { line: stanza.lines.length - 1, word: 0 };
}

function SectionButton({
  playing,
  active,
  onToggle,
  label,
}: {
  playing: boolean;
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  const live = playing && active;
  return (
    <button
      type="button"
      aria-label={live ? `Stop ${label}` : `Play ${label}`}
      onClick={onToggle}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
      style={{
        backgroundColor: live
          ? "var(--color-accent)"
          : "color-mix(in oklab, var(--color-accent) 12%, transparent)",
      }}
    >
      {live ? (
        <Square
          className="h-2.5 w-2.5 fill-current"
          style={{ color: "var(--color-paper)" }}
        />
      ) : (
        <Play
          className="h-3 w-3 fill-current"
          style={{ color: "var(--color-accent)" }}
        />
      )}
    </button>
  );
}

function LyricLine({
  line,
  chorus,
  litWords,
  curWord,
}: {
  line: string;
  chorus: boolean;
  litWords: number | null; // words already sung; null = no follow mode
  curWord: boolean;
}) {
  const isArabic = AR.test(line);
  const words = line.split(" ");
  const baseColor = chorus
    ? "var(--color-accent)"
    : isArabic
      ? "var(--color-ink)"
      : "var(--color-ink-muted)";
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
        fontFamily: isArabic
          ? "var(--font-arabic, var(--font-amiri, serif))"
          : "inherit",
      }}
    >
      {litWords === null
        ? line
        : words.map((w, wi) => (
            <span
              key={wi}
              style={{
                color:
                  wi < litWords || (wi === litWords && curWord)
                    ? baseColor
                    : `color-mix(in oklab, ${baseColor} 35%, transparent)`,
                opacity: wi === litWords && curWord ? 1 : undefined,
                transition: "color 150ms linear",
              }}
            >
              {w}
              {wi < words.length - 1 ? " " : ""}
            </span>
          ))}
    </p>
  );
}

export default function NasheedClient({ slug }: { slug: string }) {
  const player = useAudioPlayer();
  const n = NASHEED_BY_SLUG.get(slug);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const activeLineRef = useRef<HTMLElement | null>(null);

  const sections = useMemo(
    () =>
      (n?.verses ?? [])
        .map((s, i) => ({ i, t: s.time }))
        .filter((x): x is { i: number; t: number } => x.t !== undefined),
    [n],
  );

  // Which stanza is playing right now (index into n.verses), or -1.
  const activeIdx = useMemo(() => {
    if (!n || !playing) return -1;
    let idx = -1;
    for (const s of sections) if (now >= s.t) idx = s.i;
    return idx;
  }, [n, playing, now, sections]);

  const stanzaEnd = (si: number) => {
    const next = sections.find((s) => s.i > si);
    return next?.t ?? (duration || Number.MAX_SAFE_INTEGER);
  };

  const activeStanza = activeIdx >= 0 ? n!.verses[activeIdx] : null;
  const activeCursor =
    activeStanza?.time !== undefined
      ? stanzaCursor(activeStanza!, activeStanza.time, stanzaEnd(activeIdx), now)
      : null;

  // Keep the sung line in view — refires only when stanza/line changes.
  const scrollKey = activeCursor ? `${activeIdx}:${activeCursor.line}` : "";
  useEffect(() => {
    if (scrollKey)
      activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollKey]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

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

  const audio = () => {
    if (!audioRef.current && n.audio) {
      const a = new Audio(n.audio);
      a.preload = "auto";
      a.addEventListener("timeupdate", () => setNow(a.currentTime));
      a.addEventListener("ended", () => setPlaying(false));
      a.addEventListener("loadedmetadata", () => setDuration(a.duration));
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("play", () => setPlaying(true));
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const toggleSection = (si: number) => {
    const a = audio();
    const stanza = n.verses[si];
    if (!a || stanza.time === undefined) return;
    if (playing && activeIdx === si) {
      a.pause();
      a.currentTime = stanza.time;
      return;
    }
    player.close();
    a.currentTime = stanza.time;
    void a.play();
    // First section play = intent to use this nasheed — pin it into the
    // offline audio cache in the background (SW only serves from cache,
    // it never auto-caches).
    void saveAudioOffline(n.audio!, {
      talkId: `nasheed:${n.slug}`,
      title: `${n.title} · ${n.arabic}`,
    }).catch(() => {});
  };

  const isPlaying = player.currentTrack?.id === `nasheed:${n.slug}`;
  // Verse numbers only count sung, non-chorus stanzas — computed once so
  // render stays pure (a mutable counter mid-map trips react-hooks).
  const verseNums = n.verses.reduce<number[]>((acc, s) => {
    acc.push(s.chorus || s.music ? 0 : (acc[acc.length - 1] ?? 0) + 1);
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
            onClick={() => {
              audioRef.current?.pause();
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
              });
            }}
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
          unmistakable; verses get a numbered ornament and ruled spacing.
          Timed stanzas carry a compact play/stop chip; while the section
          audio runs, words light up one by one. ── */}
      <div
        className="mt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        {n.verses.map((stanza, vi) => {
          const cursor = activeIdx === vi ? activeCursor : null;
          const follow = playing && activeIdx === vi && !stanza.music;
          const chip = n.audio && stanza.time !== undefined && (
            <SectionButton
              playing={playing}
              active={activeIdx === vi}
              onToggle={() => toggleSection(vi)}
              label={`from ${Math.floor(stanza.time / 60)}:${String(
                Math.floor(stanza.time % 60),
              ).padStart(2, "0")}`}
            />
          );

          if (stanza.music) {
            return (
              <div
                key={vi}
                className="my-2 flex items-center justify-center gap-3 py-2"
                aria-label="Instrumental"
              >
                <span
                  className="h-px w-8"
                  style={{ backgroundColor: "var(--color-paper-3)" }}
                />
                {chip}
                <span
                  className="text-[0.7rem]"
                  style={{
                    color: "var(--color-ink-muted)",
                    fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                  }}
                >
                  {stanza.lines[0]}
                </span>
                <span
                  className="h-px w-8"
                  style={{ backgroundColor: "var(--color-paper-3)" }}
                />
              </div>
            );
          }

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
                <div className="mb-3 flex items-center justify-center gap-2.5">
                  {chip}
                  <p
                    className="text-[0.65rem] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: "var(--color-accent)" }}
                  >
                    اللازمة
                  </p>
                </div>
                {stanza.lines.map((line, li) => (
                  <FollowLine
                    key={li}
                    line={line}
                    chorus
                    cursor={cursor}
                    lineIndex={li}
                    follow={follow}
                    lineRef={
                      follow && cursor?.line === li ? activeLineRef : undefined
                    }
                  />
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
                {chip}
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
                <FollowLine
                  key={li}
                  line={line}
                  chorus={false}
                  cursor={cursor}
                  lineIndex={li}
                  follow={follow}
                  lineRef={
                    follow && cursor?.line === li ? activeLineRef : undefined
                  }
                />
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

function FollowLine({
  line,
  chorus,
  cursor,
  lineIndex,
  follow,
  lineRef,
}: {
  line: string;
  chorus: boolean;
  cursor: { line: number; word: number } | null;
  lineIndex: number;
  follow: boolean;
  lineRef?: React.RefObject<HTMLElement | null>;
}) {
  const done = follow && cursor !== null && lineIndex < cursor.line;
  const onLine = follow && cursor !== null && lineIndex === cursor.line;
  return (
    <span ref={lineRef as React.Ref<HTMLSpanElement>} style={{ display: "block" }}>
      <LyricLine
        line={line}
        chorus={chorus}
        litWords={done ? line.split(" ").length : onLine ? cursor!.word : follow ? 0 : null}
        curWord={onLine}
      />
    </span>
  );
}
