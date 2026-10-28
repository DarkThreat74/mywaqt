"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Pause, Music4 } from "lucide-react";
import { NASHEED_BY_SLUG } from "@/lib/nasheeds";
import { isAudioCached, saveAudioOffline, useAudioPlayer } from "@/components/audio-player-context";

const AR = /[؀-ۿ]/;
const ARABIC_NUMERAL = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١", "١٢", "١٣", "١٤", "١٥"];

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Active word position inside a stanza. When real alignment data exists
// (lineTimes/wordTimes from forced alignment) it's used verbatim; otherwise
// lines split proportionally to character count and words sweep evenly.
function stanzaCursor(
  stanza: { lines: string[]; lineTimes?: number[]; wordTimes?: number[] },
  start: number,
  end: number,
  now: number,
): { line: number; word: number } | null {
  if (now < start || now >= end) return null;
  const lt = stanza.lineTimes;
  if (lt && lt.length === stanza.lines.length) {
    let li = 0;
    for (let i = 0; i < lt.length; i++) if (now >= lt[i]) li = i;
    const nW = stanza.lines[li].split(" ").length;
    const wt = stanza.wordTimes;
    const totalWords = stanza.lines.reduce((n, line) => n + line.split(" ").length, 0);
    if (wt && wt.length === totalWords) {
      let off = 0;
      for (let i = 0; i < li; i++) off += stanza.lines[i].split(" ").length;
      let w = 0;
      for (let i = 0; i < nW; i++) if (now >= wt[off + i]) w = i;
      return { line: li, word: w };
    }
    const lineEnd = li + 1 < lt.length ? lt[li + 1] : end;
    const span = Math.max(lineEnd - lt[li], 0.001);
    return { line: li, word: Math.min(nW, Math.floor(((now - lt[li]) / span) * nW)) };
  }
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
  const lastLine = stanza.lines.length - 1;
  return { line: lastLine, word: Math.max(0, stanza.lines[lastLine].split(" ").length - 1) };
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
                  wi <= litWords ? baseColor : `color-mix(in oklab, ${baseColor} 35%, transparent)`,
                fontWeight: wi === litWords && curWord ? 600 : undefined,
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

// A quiet timestamp mark — the play/stop affordance for each stanza.
function TimeMark({
  time,
  live,
  onToggle,
}: {
  time: number;
  live: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={live ? `Stop — back to ${fmt(time)}` : `Play from ${fmt(time)}`}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums transition-colors"
      style={{
        color: live ? "var(--color-paper)" : "var(--color-ink-muted)",
        backgroundColor: live
          ? "var(--color-accent)"
          : "color-mix(in oklab, var(--color-ink) 6%, transparent)",
      }}
    >
      {live ? (
        <span className="inline-block h-1.5 w-1.5 rounded-[1px] bg-current" />
      ) : (
        <Play className="h-2.5 w-2.5 fill-current" />
      )}
      {fmt(time)}
    </button>
  );
}

export default function NasheedClient({ slug }: { slug: string }) {
  const player = useAudioPlayer();
  const n = NASHEED_BY_SLUG.get(slug);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState(false);
  const activeLineRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const sections = useMemo(
    () =>
      (n?.verses ?? [])
        .map((s, i) => ({ i, t: s.time }))
        .filter((x): x is { i: number; t: number } => x.t !== undefined),
    [n],
  );

  // Which stanza the playhead sits in (index into n.verses), or -1.
  // Position-based, not play-state-based — a paused reader still shows
  // where it stopped instead of losing the highlight.
  const activeIdx = useMemo(() => {
    if (!n || now === 0) return -1;
    let idx = -1;
    for (const s of sections) if (now >= s.t) idx = s.i;
    return idx;
  }, [n, now, sections]);

  const stanzaEnd = (si: number) => {
    const next = sections.find((s) => s.i > si);
    return next?.t ?? (duration || Number.MAX_SAFE_INTEGER);
  };

  const activeStanza = activeIdx >= 0 ? n!.verses[activeIdx] : null;
  const activeEnd = activeIdx >= 0 ? stanzaEnd(activeIdx) : 0;
  const activeCursor =
    activeStanza?.time !== undefined
      ? stanzaCursor(
          activeStanza!,
          activeStanza.time,
          activeEnd,
          Math.min(now, Math.max(activeStanza.time, activeEnd - 0.001)),
        )
      : null;

  // Keep the sung line in view — refires only when stanza/line changes.
  // A manual scroll suppresses follow-scroll for a few seconds so reading
  // ahead while listening doesn't get yanked back.
  const lastUserScroll = useRef(0);
  useEffect(() => {
    const mark = () => { lastUserScroll.current = Date.now(); };
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchmove", mark, { passive: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
    };
  }, []);
  const scrollKey = activeCursor ? `${activeIdx}:${activeCursor.line}` : "";
  useEffect(() => {
    if (scrollKey && playing && Date.now() - lastUserScroll.current > 4000)
      activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollKey, playing]);

  // `timeupdate` is intentionally coarse in mobile browsers. Sample the
  // media clock while playing so word follow stays smooth without rendering
  // more than 20 times per second.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const time = audioRef.current?.currentTime;
      if (time != null) setNow(Math.round(time * 20) / 20);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

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
      const a = new Audio();
      a.preload = "auto";
      a.src = n.audio;
      a.addEventListener("timeupdate", () => setNow(a.currentTime));
      a.addEventListener("loadedmetadata", () => setDuration(a.duration));
      a.addEventListener("ended", () => setPlaying(false));
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("play", () => setPlaying(true));
      a.addEventListener("error", () => setLoadError(true));
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const startPlayback = (t?: number) => {
    const a = audio();
    if (!a) return;
    player.close(); // silence the dock player — the reader drives itself
    if (!saved && n.audio) {
      setSaved(true);
      void isAudioCached(n.audio)
        .then((have) =>
          have
            ? undefined
            : saveAudioOffline(n.audio!, {
                talkId: `nasheed:${n.slug}`,
                title: `${n.title} · ${n.arabic}`,
              }),
        )
        .catch(() => {});
    }
    if (t !== undefined && a.readyState < 1) {
      // Seek requested before metadata loaded. play() MUST stay inside the
      // tap's gesture stack — deferring it into loadedmetadata loses the
      // iOS autoplay grant and the tap silently does nothing. Play now
      // (from 0 for a split second), then jump to the section on metadata.
      void a.play().catch((err: unknown) => {
        if (!(err instanceof DOMException) || err.name !== "AbortError") setLoadError(true);
      });
      a.addEventListener(
        "loadedmetadata",
        () => {
          a.currentTime = t;
          setNow(t);
        },
        { once: true },
      );
      return;
    }
    if (t !== undefined) {
      a.currentTime = t;
      setNow(t);
    }
    void a.play().catch((err: unknown) => {
      if (!(err instanceof DOMException) || err.name !== "AbortError") setLoadError(true);
    });
  };

  const toggleMain = () => {
    const a = audio();
    if (!a) return;
    if (playing) a.pause();
    else startPlayback(now > 0 && now < duration ? undefined : 0);
  };

  const toggleSection = (si: number) => {
    const stanza = n.verses[si];
    if (stanza.time === undefined) return;
    if (playing && activeIdx === si) {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = stanza.time;
        setNow(stanza.time);
      }
      return;
    }
    startPlayback(stanza.time);
  };

  const seekRail = (e: React.MouseEvent) => {
    const a = audioRef.current ?? audio();
    const rail = railRef.current;
    if (!a || !rail || !duration) return;
    const rect = rail.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
    setNow(a.currentTime);
  };

  const progress = duration > 0 ? Math.min(1, now / duration) : 0;
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
      <div className="mb-2">
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
        <p className="mt-2 text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          {n.title}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {n.artist ?? "Traditional"}
        </p>
      </div>

      {/* ── Embedded transport — one row: button, rail, times. ── */}
      {n.audio && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMain}
            aria-label={playing ? "Pause" : `Play ${n.title}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-current" style={{ color: "var(--color-paper)" }} />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" style={{ color: "var(--color-paper)" }} />
            )}
          </button>
          <span
            className="w-9 shrink-0 text-right text-[0.7rem] tabular-nums"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {fmt(now)}
          </span>
          <div
            ref={railRef}
            onClick={seekRail}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(now)}
            className="group relative h-6 flex-1 cursor-pointer"
          >
            <div
              className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 12%, transparent)" }}
            />
            <div
              className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: "var(--color-accent)",
                transition: playing ? "none" : "width 120ms linear",
              }}
            />
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                left: `${progress * 100}%`,
                backgroundColor: "var(--color-accent)",
              }}
            />
          </div>
          <span
            className="w-9 shrink-0 text-[0.7rem] tabular-nums"
            style={{ color: "var(--color-ink-muted)" }}
          >
            {duration ? fmt(duration) : "--:--"}
          </span>
        </div>
      )}
      {loadError && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Couldn&rsquo;t load the audio — check your connection once and it will be saved for offline use.
        </p>
      )}

      {/* ── The text — chorus panels sit off the paper so the refrain is
          unmistakable; verses get a numbered ornament and ruled spacing.
          Timed stanzas carry a timestamp mark; while playing, words light
          up one by one. ── */}
      <div
        className="mt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
      >
        {n.verses.map((stanza, vi) => {
          const cursor = activeIdx === vi ? activeCursor : null;
          const follow = activeIdx === vi && !stanza.music;
          const mark = n.audio && stanza.time !== undefined && (
            <TimeMark
              time={stanza.time}
              live={playing && activeIdx === vi}
              onToggle={() => toggleSection(vi)}
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
                {mark}
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
                  {mark}
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
                    lineRef={follow && cursor?.line === li ? activeLineRef : undefined}
                  />
                ))}
              </section>
            );
          }

          const verseNo = verseNums[vi];
          return (
            <section key={vi} aria-label={`Verse ${verseNo}`} className="py-6 sm:py-7">
              <div className="mb-3 flex items-center justify-center gap-3">
                <span className="h-px w-10" style={{ backgroundColor: "var(--color-paper-3)" }} />
                {mark}
                <span
                  className="text-xs tabular-nums"
                  style={{
                    color: "var(--color-ink-muted)",
                    fontFamily: "var(--font-arabic, var(--font-amiri, serif))",
                  }}
                >
                  {ARABIC_NUMERAL[verseNo - 1] ?? verseNo}
                </span>
                <span className="h-px w-10" style={{ backgroundColor: "var(--color-paper-3)" }} />
              </div>
              {stanza.lines.map((line, li) => (
                <FollowLine
                  key={li}
                  line={line}
                  chorus={false}
                  cursor={cursor}
                  lineIndex={li}
                  follow={follow}
                  lineRef={follow && cursor?.line === li ? activeLineRef : undefined}
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
