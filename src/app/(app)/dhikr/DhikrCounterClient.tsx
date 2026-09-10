"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RotateCcw, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import { hapticImpact, hapticNotification } from "@/lib/native-bridge";

interface DhikrSequence {
  id: string;
  phraseArabic: string;
  phraseTransliteration: string;
  targetCount: number;
  sequenceOrder: number;
  sourceCitation: string;
}

// Default post-prayer adhkar — universally authenticated from
// Sahih al-Bukhari 844 / Sahih Muslim 597 (Abu Hurayrah RA).
// Used as a fallback when the dhikr_sequences table is empty.
const DEFAULT_SEQUENCES: DhikrSequence[] = [
  {
    id: "default_subhanallah",
    phraseArabic: "سُبْحَانَ اللَّهِ",
    phraseTransliteration: "SubhanAllah",
    targetCount: 33,
    sequenceOrder: 0,
    sourceCitation: "Sahih Muslim 597 — Abu Hurayrah (RA)",
  },
  {
    id: "default_alhamdulillah",
    phraseArabic: "الْحَمْدُ لِلَّهِ",
    phraseTransliteration: "Alhamdulillah",
    targetCount: 33,
    sequenceOrder: 1,
    sourceCitation: "Sahih Muslim 597 — Abu Hurayrah (RA)",
  },
  {
    id: "default_allahuakbar",
    phraseArabic: "اللَّهُ أَكْبَرُ",
    phraseTransliteration: "Allahu Akbar",
    targetCount: 34,
    sequenceOrder: 2,
    sourceCitation: "Sahih Muslim 597 — Abu Hurayrah (RA)",
  },
  {
    id: "default_tahlil",
    phraseArabic: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
    phraseTransliteration: "La ilaha illa Allah, wahdahu la sharika lah, lahul-mulku wa lahul-hamdu, wa Huwa ala kulli shayin qadeer",
    targetCount: 1,
    sequenceOrder: 3,
    sourceCitation: "Sahih al-Bukhari 844 / Sahih Muslim 597 — Abu Hurayrah (RA)",
  },
];

export default function DhikrCounterClient() {
  // ── Restore dhikr session from localStorage so navigating away and back
  //    doesn't lose the current count/position ──
  const [sequences, setSequences] = useState<DhikrSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("waqt:dhikr-session");
      if (saved) {
        const { idx } = JSON.parse(saved);
        if (typeof idx === "number") return idx;
      }
    } catch { /* non-critical */ }
    return 0;
  });
  const [count, setCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("waqt:dhikr-session");
      if (saved) {
        const { cnt } = JSON.parse(saved);
        if (typeof cnt === "number") return cnt;
      }
    } catch { /* non-critical */ }
    return 0;
  });
  const [completedSequences, setCompletedSequences] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("waqt:dhikr-session");
      if (saved) {
        const { completed } = JSON.parse(saved);
        if (Array.isArray(completed)) return new Set(completed);
      }
    } catch { /* non-critical */ }
    return new Set();
  });
  const [pulseKey, setPulseKey] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false); // controls/settings overlay
  const ringRef = useRef<SVGCircleElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  // ── Persist dhikr session to localStorage on every change ──
  useEffect(() => {
    try {
      localStorage.setItem("waqt:dhikr-session", JSON.stringify({
        idx: currentIndex,
        cnt: count,
        completed: [...completedSequences],
      }));
    } catch { /* non-critical */ }
  }, [currentIndex, count, completedSequences]);

  // Load dhikr sequences — fall back to defaults if table is empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dhikr").catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const data = await res.json().catch(() => null);
          if (data?.sequences?.length > 0) {
            setSequences(data.sequences);
          } else {
            setSequences(DEFAULT_SEQUENCES);
          }
        } else {
          setSequences(DEFAULT_SEQUENCES);
        }
      } catch {
        if (!cancelled) setSequences(DEFAULT_SEQUENCES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const current = sequences[currentIndex];
  const isLast = currentIndex === sequences.length - 1;
  const allComplete = completedSequences.size === sequences.length && sequences.length > 0;

  const goToSequence = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    setCount(0);
    void hapticImpact("light");
  }, []);

  const handleTap = useCallback(() => {
    if (!current || showOverlay) return;
    const newCount = count + 1;
    setCount(newCount);
    setPulseKey((k) => k + 1);

    // Light haptic on each tap
    void hapticImpact("light");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(12); } catch { /* no-op */ }
    }

    if (newCount >= current.targetCount) {
      setCompletedSequences((prev) => new Set(prev).add(currentIndex));
      void hapticNotification("success");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate([40, 20, 60]); } catch { /* no-op */ }
      }

      // Auto-advance after a brief pause
      setTimeout(() => {
        if (!isLast) {
          setCurrentIndex((i) => i + 1);
          setCount(0);
        }
      }, 700);
    }
  }, [count, current, currentIndex, isLast, showOverlay]);

  const handleReset = useCallback(() => {
    setCount(0);
    void hapticImpact("medium");
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) goToSequence(currentIndex - 1);
  }, [currentIndex, goToSequence]);

  const handleNext = useCallback(() => {
    if (!isLast) goToSequence(currentIndex + 1);
  }, [currentIndex, isLast, goToSequence]);

  const handleRestartAll = useCallback(() => {
    setCompletedSequences(new Set());
    setCurrentIndex(0);
    setCount(0);
    void hapticNotification("warning");
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: "var(--color-accent)", borderRightColor: "var(--color-accent)" }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading dhikr…</p>
        </div>
      </div>
    );
  }

  // ── All complete ──
  if (allComplete) {
    return (
      <div className="mx-auto max-w-md py-8 sm:py-12">
        <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in oklab, var(--color-success) 15%, transparent)" }}>
            <Check className="h-7 w-7" style={{ color: "var(--color-success)" }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Dhikr Complete</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            You have completed all {sequences.length} dhikr sequences. May Allah accept your remembrance.
          </p>
          <button
            onClick={handleRestartAll}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper-2)", minHeight: 44 }}
          >
            <RotateCcw className="h-4 w-4" />
            Start Again
          </button>
        </div>
      </div>
    );
  }

  const progress = current ? (count / current.targetCount) * 100 : 0;
  const isComplete = count >= (current?.targetCount ?? 0);
  const ringCircumference = 2 * Math.PI * 48;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center py-6 lg:min-h-dvh lg:py-10">
      <div className="mx-auto w-full max-w-md px-4">
        {/* ── Full-screen tap area with side nav buttons ── */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Prev button */}
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="shrink-0 rounded-full border p-2.5 transition-colors disabled:opacity-20 sm:p-3"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper)", minHeight: 44, minWidth: 44 }}
            aria-label="Previous dhikr"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* The entire tap area is the counter — huge, centered, with a progress ring */}
          <button
            onClick={handleTap}
            disabled={isComplete}
            className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto rounded-3xl border transition-colors active:scale-[0.99] disabled:cursor-default"
            style={{
              minHeight: "min(60vh, 440px)",
              maxHeight: "min(75dvh, 560px)",
              backgroundColor: isComplete
                ? "color-mix(in oklab, var(--color-success) 6%, var(--color-paper))"
                : "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
            aria-label={`Count dhikr (${count} of ${current?.targetCount ?? 0})`}
          >
        {/* ── Top bar: sequence indicator + overlay toggle ── */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {currentIndex + 1} / {sequences.length}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowOverlay(!showOverlay); }}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="Show controls"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>

        {/* ── Arabic phrase ── */}
        {current && (
          <div className="mb-8 min-w-0 max-w-full px-6 text-center">
            <p
              className="max-w-full break-words text-2xl leading-snug sm:text-3xl"
              style={{ color: "var(--color-ink)", fontFamily: "var(--font-amiri, serif)", direction: "rtl", overflowWrap: "break-word" }}
            >
              {current.phraseArabic}
            </p>
            <p
              className="mt-1.5 max-w-full break-words text-sm italic"
              style={{ color: "var(--color-ink-soft)", overflowWrap: "break-word" }}
            >
              {current.phraseTransliteration}
            </p>
          </div>
        )}

        {/* ── Progress ring + count (the hero) ── */}
        <div className="relative flex items-center justify-center" style={{ width: "min(55vw, 200px)", height: "min(55vw, 200px)" }}>
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 100 100"
            style={{ width: "100%", height: "100%" }}
          >
            <circle
              cx="50" cy="50" r="48"
              fill="none"
              strokeWidth="2"
              stroke="var(--color-paper-3)"
            />
            <circle
              ref={ringRef}
              cx="50" cy="50" r="48"
              fill="none"
              strokeWidth="3"
              stroke={isComplete ? "var(--color-success)" : "var(--color-accent)"}
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringCircumference * (1 - progress / 100)}
              style={{ transition: "stroke-dashoffset 0.25s ease-out, stroke 0.3s ease" }}
            />
          </svg>

          {/* Count number — the hero of the page */}
          <div className="relative flex flex-col items-center">
            <span
              key={pulseKey}
              ref={countRef}
              className="text-6xl font-bold tabular-nums sm:text-7xl"
              style={{
                color: isComplete ? "var(--color-success)" : "var(--color-ink)",
                animation: pulseKey > 0 ? "dhikr-pulse 0.25s ease-out" : undefined,
                lineHeight: 1,
              }}
            >
              {count}
            </span>
            <span className="mt-1 text-sm tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
              / {current?.targetCount ?? 0}
            </span>
          </div>
        </div>

        {/* ── Tap hint / completion state ── */}
        <div className="mt-8 text-center">
          {isComplete ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-success)" }}>
              <Check className="h-4 w-4" />
              Complete
            </span>
          ) : (
            <span className="text-[11px] font-medium uppercase tracking-[0.15em]" style={{ color: "var(--color-ink-muted)" }}>
              Tap anywhere to count
            </span>
          )}
        </div>

        {/* ── Sequence progress dots ── */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
          {sequences.map((seq, i) => (
            <div
              key={seq.id}
              className="h-1.5 rounded-full transition-all duration-200"
              style={{
                width: i === currentIndex ? 16 : 6,
                backgroundColor: completedSequences.has(i)
                  ? "var(--color-success)"
                  : i === currentIndex
                    ? "var(--color-accent)"
                    : "var(--color-paper-3)",
              }}
            />
          ))}
        </div>

        {/* ── Ripple effect on tap ── */}
        {pulseKey > 0 && !isComplete && (
          <span
            key={`ripple-${pulseKey}`}
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: "min(55vw, 200px)",
              height: "min(55vw, 200px)",
              transform: "translate(-50%, -50%)",
              border: "2px solid var(--color-accent)",
              animation: "dhikr-ripple 0.4s ease-out forwards",
            }}
          />
        )}
          </button>

          {/* Next button */}
          <button
            onClick={handleNext}
            disabled={isLast}
            className="shrink-0 rounded-full border p-2.5 transition-colors disabled:opacity-20 sm:p-3"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper)", minHeight: 44, minWidth: 44 }}
            aria-label="Next dhikr"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

      {/* ── Controls overlay (slides up when toggled) ── */}
      {showOverlay && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 30%, transparent)" }}
            onClick={() => setShowOverlay(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            style={{
              borderColor: "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <div className="mx-auto max-w-md">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Controls</h3>
                <button
                  onClick={() => setShowOverlay(false)}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label="Close controls"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Sequence navigation */}
              <div className="mb-4 flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors disabled:opacity-30"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  onClick={handleReset}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset count
                </button>
                <button
                  onClick={handleNext}
                  disabled={isLast}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors disabled:opacity-30"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44 }}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Sequence picker */}
              <div className="flex flex-wrap gap-1.5">
                {sequences.map((seq, i) => (
                  <button
                    key={seq.id}
                    onClick={() => { goToSequence(i); setShowOverlay(false); }}
                    className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                    style={{
                      borderColor: i === currentIndex ? "var(--color-accent)" : "var(--color-paper-3)",
                      color: i === currentIndex ? "var(--color-accent)" : completedSequences.has(i) ? "var(--color-success)" : "var(--color-ink-muted)",
                      backgroundColor: i === currentIndex ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                    }}
                  >
                    {completedSequences.has(i) && "✓ "}{seq.phraseTransliteration.slice(0, 20)}
                  </button>
                ))}
              </div>

              {/* Source citation */}
              {current && (
                <p className="mt-4 text-center text-[11px] italic" style={{ color: "var(--color-ink-muted)" }}>
                  Source: {current.sourceCitation}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes dhikr-pulse {
          0% { transform: scale(1); }
          35% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        @keyframes dhikr-ripple {
          0% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.85); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
      </div>
    </div>
  );
}
