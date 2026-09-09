"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { X, ChevronRight, BookOpen, Lightbulb } from "lucide-react";
import {
  getNextFunFactIndex,
  getFunFactByIndex,
  GLOBAL_GLOSSARY,
  type FunFact,
} from "@/lib/content/fun-facts";

// ── Storage keys ──
const STORAGE_KEY_NEXT_SHOW = "waqt:funfact:nextShow"; // timestamp when next card should appear
const STORAGE_KEY_INDEX = "waqt:funfact:index"; // last shown index
const STORAGE_KEY_SEEN = "waqt:funfact:seen"; // JSON array of permanently seen indices
const STORAGE_KEY_CURRENT = "waqt:funfact:current"; // current fact index being shown (for X-out reuse)

const INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ── Time-based scheduling ──
// Calculate the next 3-hour mark from now (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00)
function getNextScheduledTime(from: Date = new Date()): number {
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  // Round up to the next multiple of 3 hours
  while (next.getHours() % 3 !== 0) {
    next.setHours(next.getHours() + 1);
  }
  return next.getTime();
}

// Get the initial state on mount
function getInitialFact(): { fact: FunFact | null; shouldShow: boolean; factIndex: number } {
  if (typeof window === "undefined") return { fact: null, shouldShow: false, factIndex: -1 };

  const nextShowStr = localStorage.getItem(STORAGE_KEY_NEXT_SHOW);
  const nextShow = nextShowStr ? parseInt(nextShowStr, 10) : null;

  // If no next show time set, or time hasn't arrived yet, don't show
  if (nextShow === null) return { fact: null, shouldShow: false, factIndex: -1 };
  if (Date.now() < nextShow) return { fact: null, shouldShow: false, factIndex: -1 };

  // Time to show! Pick the next fact.
  // Check if there's a "current" fact (from X-out, can be reused)
  const currentStr = localStorage.getItem(STORAGE_KEY_CURRENT);
  if (currentStr !== null) {
    const currentIndex = parseInt(currentStr, 10);
    const fact = getFunFactByIndex(currentIndex);
    return { fact, shouldShow: true, factIndex: currentIndex };
  }

  // Otherwise, pick the next unseen fact
  const seenStr = localStorage.getItem(STORAGE_KEY_SEEN);
  const seen: number[] = seenStr ? JSON.parse(seenStr) : [];

  const lastIndexStr = localStorage.getItem(STORAGE_KEY_INDEX);
  const lastIndex = lastIndexStr ? parseInt(lastIndexStr, 10) : -1;

  // Find next index that hasn't been permanently seen
  let nextIndex = getNextFunFactIndex(lastIndex);
  let attempts = 0;
  while (seen.includes(nextIndex) && attempts < 100) {
    nextIndex = getNextFunFactIndex(nextIndex);
    attempts++;
  }

  const fact = getFunFactByIndex(nextIndex);
  return { fact, shouldShow: true, factIndex: nextIndex };
}

// Merge global glossary with per-card glossary (per-card takes priority on conflicts)
function getMergedGlossary(fact: FunFact): { term: string; definition: string }[] {
  const map = new Map<string, { term: string; definition: string }>();
  for (const g of GLOBAL_GLOSSARY) map.set(g.term.toLowerCase(), g);
  if (fact.glossary) {
    for (const g of fact.glossary) map.set(g.term.toLowerCase(), g);
  }
  return Array.from(map.values());
}

// ── Inline glossary text renderer ──
function GlossaryText({
  text,
  glossary,
}: {
  text: string;
  glossary: { term: string; definition: string }[];
}) {
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const segments = useMemo(() => {
    if (!glossary || glossary.length === 0) return [{ type: "text" as const, value: text }];

    const sortedTerms = [...glossary].sort((a, b) => b.term.length - a.term.length);
    const escaped = sortedTerms.map((g) => g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");

    const parts: { type: "text" | "term"; value: string; term?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
      }
      const matchedText = match[0];
      const glossaryEntry = sortedTerms.find(
        (g) => g.term.toLowerCase() === matchedText.toLowerCase()
      );
      parts.push({ type: "term", value: matchedText, term: glossaryEntry?.term });
      lastIndex = match.index + matchedText.length;
      if (regex.lastIndex === match.index) regex.lastIndex++;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }
    return parts;
  }, [text, glossary]);

  const getDefinition = (term: string) =>
    glossary.find((g) => g.term.toLowerCase() === term.toLowerCase())?.definition;

  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        const def = getDefinition(seg.term || seg.value);
        const termKey = (seg.term || seg.value).toLowerCase();
        const isOpen = openTerm === termKey;
        return (
          <span key={i} className="relative inline">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenTerm(isOpen ? null : termKey);
              }}
              className="inline cursor-pointer border-b border-dashed font-medium transition-colors hover:opacity-70"
              style={{
                color: "var(--color-accent)",
                borderColor: "var(--color-accent)",
              }}
            >
              {seg.value}
            </button>
            {isOpen && def && (
              <span
                className="absolute left-0 top-full z-30 mt-1 block w-72 max-w-[90vw] rounded-xl border p-3.5 text-xs shadow-2xl"
                style={{
                  backgroundColor: "var(--color-paper)",
                  borderColor: "color-mix(in oklab, var(--color-accent) 25%, var(--color-paper-3))",
                  color: "var(--color-ink-soft)",
                  lineHeight: 1.6,
                  animation: "glossaryFadeIn 0.15s ease-out",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="block font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                  {seg.term}
                </span>
                {def}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// ── Ornamental divider symbol ──
function OrnamentDivider({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1" style={{ color, opacity: 0.5 }}>
      <span className="h-px w-12" style={{ backgroundColor: "currentColor" }} />
      <span className="text-base leading-none" style={{ fontSize: "14px" }}>۞</span>
      <span className="h-px w-12" style={{ backgroundColor: "currentColor" }} />
    </div>
  );
}

export default function FunFactPopup() {
  // HYDRATION-SAFE: Start with a neutral state that matches the server.
  // getInitialFact() reads localStorage + Date.now() which produce
  // different results on server vs client, causing React error #441
  // (hydration mismatch). Compute the real state in useEffect instead.
  const [fact, setFact] = useState<FunFact | null>(null);
  const [factIndex, setFactIndex] = useState<number>(-1);
  const [show, setShow] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Initialize next show time if not set (first visit)
    const nextShowStr = localStorage.getItem(STORAGE_KEY_NEXT_SHOW);
    if (!nextShowStr) {
      localStorage.setItem(STORAGE_KEY_NEXT_SHOW, getNextScheduledTime().toString());
    }

    const initial = getInitialFact();
    if (!initial.shouldShow || !initial.fact) return;
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    Promise.resolve().then(() => {
      setFact(initial.fact!);
      setFactIndex(initial.factIndex);
    });
    const timer = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // ── "Got it" / Continue: mark as permanently seen, advance to next ──
  function handleGotIt() {
    setShow(false);
    // Mark this fact as permanently seen
    const seenStr = localStorage.getItem(STORAGE_KEY_SEEN);
    const seen: number[] = seenStr ? JSON.parse(seenStr) : [];
    if (factIndex >= 0 && !seen.includes(factIndex)) {
      seen.push(factIndex);
      localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(seen));
    }
    // Advance index
    localStorage.setItem(STORAGE_KEY_INDEX, factIndex.toString());
    // Clear current (no reuse possible)
    localStorage.removeItem(STORAGE_KEY_CURRENT);
    // Set next show time: 3 hours from now (timer starts on dismiss)
    localStorage.setItem(STORAGE_KEY_NEXT_SHOW, (Date.now() + INTERVAL_MS).toString());
  }

  // ── X (close): card can come back, don't mark as seen ──
  function handleDismiss() {
    setShow(false);
    // Keep the current fact index so it can be reused next time
    if (factIndex >= 0) {
      localStorage.setItem(STORAGE_KEY_CURRENT, factIndex.toString());
    }
    // Set next show time: 3 hours from now (timer starts on dismiss)
    localStorage.setItem(STORAGE_KEY_NEXT_SHOW, (Date.now() + INTERVAL_MS).toString());
  }

  useEffect(() => {
    if (!show) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleDismiss();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, fact, factIndex]);

  if (!show || !fact) return null;

  const mergedGlossary = getMergedGlossary(fact);

  const categoryColors: Record<string, string> = {
    salah: "var(--color-accent)",
    wudu: "var(--color-success)",
    fasting: "var(--color-warmth)",
    quran: "var(--color-accent)",
    adab: "var(--color-ink-soft)",
    dhikr: "var(--color-accent)",
    prophet: "var(--color-warmth)",
    history: "var(--color-ink-muted)",
    zakat: "var(--color-success)",
    hajj: "var(--color-warmth)",
    general: "var(--color-ink-muted)",
  };

  const categoryLabels: Record<string, string> = {
    salah: "Prayer",
    wudu: "Purification",
    fasting: "Fasting",
    quran: "Quran",
    adab: "Etiquette",
    dhikr: "Remembrance",
    prophet: "Prophet ﷺ",
    history: "History",
    zakat: "Charity",
    hajj: "Pilgrimage",
    general: "General",
  };

  const accentColor = categoryColors[fact.category] || "var(--color-accent)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
      onClick={handleDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-visible rounded-3xl border shadow-2xl"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "color-mix(in oklab, " + accentColor + " 20%, var(--color-paper-3))",
          animation: "funFactEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── Top accent bar with ornament ── */}
        <div
          className="flex items-center justify-center rounded-t-3xl py-2"
          style={{
            background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${accentColor} 8%, var(--color-paper)), transparent)`,
          }}
        >
          <span className="text-lg" style={{ color: accentColor, opacity: 0.6 }}>۞</span>
        </div>

        {/* Close button (X) — dismisses without marking as seen */}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
          aria-label="Close (card may reappear later)"
          title="Close — this card may appear again"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Teaser state (before click) ── */}
        {!revealed ? (
          <div className="flex flex-col items-center gap-5 px-6 pb-7 pt-3 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: accentColor, opacity: 0.8 }}>
                Did you know
              </p>
              <h2 className="text-[17px] font-semibold leading-snug px-2" style={{ color: "var(--color-ink)" }}>
                {fact.teaser}
              </h2>
            </div>

            <OrnamentDivider color={accentColor} />

            <button
              onClick={() => setRevealed(true)}
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-transform hover:scale-[1.03]"
              style={{
                backgroundColor: accentColor,
                color: "var(--color-paper)",
              }}
            >
              <Lightbulb className="h-4 w-4" />
              Tell me
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* ── Revealed state (after click) ── */
          <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
            {/* Category badge */}
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `color-mix(in oklab, ${accentColor} 10%, var(--color-paper))`,
                  color: accentColor,
                }}
              >
                {categoryLabels[fact.category]}
              </span>
            </div>

            {/* The reveal */}
            <h2 className="text-[15px] font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>
              <GlossaryText text={fact.reveal} glossary={mergedGlossary} />
            </h2>

            {/* Arabic text (if available) */}
            {fact.arabicText && (
              <p
                className="text-right text-base leading-loose py-2"
                dir="rtl"
                lang="ar"
                style={{
                  color: "var(--color-ink)",
                  fontFamily: "'Amiri', 'Scheherazade New', 'Traditional Arabic', serif",
                  fontSize: "18px",
                }}
              >
                {fact.arabicText}
              </p>
            )}

            {/* Ornamental divider */}
            <OrnamentDivider color={accentColor} />

            {/* Explanation with inline glossary */}
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
              <GlossaryText text={fact.explanation} glossary={mergedGlossary} />
            </p>

            {/* Hint about tappable terms */}
            <p className="text-[11px]" style={{ color: "var(--color-ink-muted)", opacity: 0.7 }}>
              Tap any highlighted word to see its definition.
            </p>

            {/* Source */}
            {fact.source && (
              <p className="text-[11px] italic" style={{ color: "var(--color-ink-muted)" }}>
                Source: <GlossaryText text={fact.source} glossary={mergedGlossary} />
              </p>
            )}

            {/* Action bar */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--color-paper-3)" }}>
              <Link
                href="/learn"
                className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
                style={{ color: accentColor }}
                onClick={handleGotIt}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Explore Learn
              </Link>
              {/* "Got it" — marks as permanently seen, won't reappear */}
              <button
                onClick={handleGotIt}
                className="rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--color-ink)",
                  color: "var(--color-paper)",
                }}
                title="Mark as read — this card won't appear again"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes funFactEnter {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(12px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes glossaryFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
