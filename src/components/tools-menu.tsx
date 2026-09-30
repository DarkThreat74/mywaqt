"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, LayoutGrid } from "lucide-react";
import { useHiddenTabs } from "@/lib/nav-prefs";

/**
 * Tool picker — pictorial tiles, not a numbered list. Each tool carries its
 * own inline SVG line-art (compass rose, tasbih beads, open hand…) drawn in
 * the app's ink/accent strokes so the sheet reads as a set of instruments,
 * not a settings table.
 */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function QiblaArt() {
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="24" r="17" />
      <circle cx="24" cy="24" r="13" opacity="0.35" />
      <path d="M24 9v3M24 36v3M9 24h3M36 24h3" opacity="0.6" />
      <path d="M30 18l-4.5 7.5L18 30l4.5-7.5z" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DhikrArt() {
  // Tasbih strand: beads arcing around a tassel
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      {[...Array(9)].map((_, i) => {
        const a = Math.PI * (0.15 + (i / 8) * 0.7);
        return <circle key={i} cx={24 + 15 * Math.cos(a)} cy={22 + 15 * Math.sin(a)} r="2.6" />;
      })}
      <path d="M35 34c1.5 4 1 7-1 9" />
      <path d="M35 43h.01" />
      <circle cx="31.5" cy="40" r="2" />
      <path d="M31.5 42v3" />
    </svg>
  );
}

function NamesArt() {
  // Eight-point khatam star
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 6l4.2 9.8L38 11.5l-4.3 9.8L43.5 24l-9.8 4.2 4.3 9.8-9.8-4.3L24 43.5l-4.2-9.8-9.8 4.3 4.3-9.8L4.5 24l9.8-4.2L10 10l9.8 4.2z" />
      <circle cx="24" cy="24" r="4" />
    </svg>
  );
}

function StudyArt() {
  // Focus timer dial
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="26" r="15" />
      <path d="M24 5v4M20 5h8" />
      <path d="M24 26V17" />
      <path d="M24 26l6 4" opacity="0.55" />
    </svg>
  );
}

function LearnArt() {
  // Open book
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 12c-4-2.5-9-3-14-2v28c5-1 10-.5 14 2 4-2.5 9-3 14-2V10c-5-1-10-.5-14 2z" />
      <path d="M24 12v28" />
      <path d="M14 17c2.5-.4 5-.2 7 .5M14 23c2.5-.4 5-.2 7 .5M34 17c-2.5-.4-5-.2-7 .5M34 23c-2.5-.4-5-.2-7 .5" opacity="0.5" />
    </svg>
  );
}

function QuranArt() {
  // Mushaf with an ayah ornament
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <rect x="10" y="8" width="28" height="32" rx="2.5" />
      <path d="M16 8v32" opacity="0.4" />
      <circle cx="27" cy="24" r="6.5" />
      <path d="M27 19.5l1 2.6 2.8.2-2.2 1.8.7 2.8-2.3-1.5-2.3 1.5.7-2.8-2.2-1.8 2.8-.2z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

function MutashabihArt() {
  // Two ayah lines sharing one path, then diverging — the mutashabih shape.
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M8 20h14c6 0 8 4 14 4" />
      <path d="M22 20c6 0 8-4 14-4" opacity="0.45" />
      <path d="M8 30h22" />
      <path d="M8 30h12c6 0 8 6 14 6" opacity="0.45" />
      <circle cx="8" cy="20" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TalksArt() {
  // Play triangle inside sound arcs
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="24" r="16" />
      <path d="M21 18.5v11l9-5.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface Tool {
  href: string;
  label: string;
  arabic: string;
  description: string;
  art: () => React.ReactElement;
  ranked?: boolean;
}

const SECTIONS: { title: string; tools: Tool[] }[] = [
  {
    title: "Worship",
    tools: [
      { href: "/qibla", label: "Qibla", arabic: "قبلة", description: "Direction to the Kaaba", art: QiblaArt },
      { href: "/dhikr", label: "Dhikr", arabic: "ذكر", description: "Tasbih counter", art: DhikrArt },
      { href: "/mutashabihat", label: "Mutashabih", arabic: "متشابه", description: "The verses that look alike", art: MutashabihArt, ranked: true },
      { href: "/quran", label: "AyaTrace", arabic: "قرآن", description: "Name the surah", art: QuranArt, ranked: true },
    ],
  },
  {
    title: "Grow",
    tools: [
      { href: "/names", label: "99 Names", arabic: "أسماء الله", description: "Names of Allah", art: NamesArt },
      { href: "/study", label: "Study", arabic: "دراسة", description: "Focus timer & sounds", art: StudyArt },
      { href: "/learn", label: "Learn", arabic: "علم", description: "Prayer knowledge", art: LearnArt },
      { href: "/talks", label: "Talks", arabic: "دروس", description: "Lectures & khutbahs", art: TalksArt },
    ],
  },
];

export default function ToolsMenu({ variant = "icon" }: { variant?: "icon" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const hiddenTabs = useHiddenTabs();
  const sections = SECTIONS
    .map((s) => ({ ...s, tools: s.tools.filter((t) => !hiddenTabs.has(t.href)) }))
    .filter((s) => s.tools.length > 0);

  // Mount guard for portal (document.body doesn't exist during SSR)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Listen for custom event to open from sidebar/desktop
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-tools-menu", handler);
    return () => window.removeEventListener("open-tools-menu", handler);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Smooth dismiss with exit animation
  function dismiss() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 220);
  }

  let tileIdx = 0;

  return (
    <>
      {/* Trigger button — variant controls appearance */}
      {variant === "sidebar" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)" }}
        >
          <LayoutGrid className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          Tools
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
          aria-label="Open tools menu"
        >
          <LayoutGrid className="h-[18px] w-[18px]" style={{ color: "var(--color-ink-soft)" }} />
        </button>
      )}

      {/* Tool picker — rendered via portal to escape any containing block
          created by backdrop-filter on ancestor headers */}
      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 55%, transparent)",
            animation: closing ? "tools-fade-out 0.22s ease-out forwards" : "tools-fade-in 0.2s ease-out",
          }}
          onClick={dismiss}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Tools"
            className="w-full overflow-hidden border sm:max-w-lg"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: "env(safe-area-inset-bottom)",
              maxHeight: "88dvh",
              overflowY: "auto",
              animation: closing
                ? "tools-slide-down 0.22s ease-in forwards"
                : "tools-slide-up 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            </div>

            {/* Header — Arabic wordmark as ornament */}
            <div className="flex items-start justify-between px-5 pt-5 pb-2 sm:pt-6">
              <div>
                <p
                  className="text-2xl leading-none"
                  style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}
                  aria-hidden="true"
                >
                  أدوات
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
                  Tools
                </h2>
              </div>
              <button
                onClick={dismiss}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 44, minWidth: 44 }}
                aria-label="Close tools menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sections of pictorial tiles */}
            {sections.map((section) => (
              <div key={section.title} className="px-5 pb-4 pt-2">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                  {section.title}
                </p>
                <div className="grid grid-cols-4 gap-2 max-[380px]:grid-cols-2">
                  {section.tools.map((tool) => {
                    const Art = tool.art;
                    const i = tileIdx++;
                    return (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className="group relative flex flex-col items-center overflow-hidden rounded-2xl border px-2 pb-2.5 pt-3 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-paper-2)] active:bg-[var(--color-paper-3)]"
                        style={{
                          borderColor: "var(--color-paper-3)",
                          animation: `tools-item-in 0.34s cubic-bezier(0.16, 1, 0.3, 1) ${0.03 * i + 0.04}s both`,
                        }}
                      >
                        {tool.ranked && (
                          <span
                            className="absolute right-0 top-0 rounded-bl-lg px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em]"
                            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                          >
                            Ranked
                          </span>
                        )}
                        <span
                          className="block h-11 w-11 transition-colors group-hover:text-[var(--color-accent)]"
                          style={{ color: "var(--color-ink-soft)" }}
                        >
                          <Art />
                        </span>
                        <span className="mt-1.5 text-[11px] font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>
                          {tool.label}
                        </span>
                        <span
                          className="mt-0.5 text-[11px] leading-none"
                          style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}
                        >
                          {tool.arabic}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <p className="px-5 pb-5 pt-1 text-center text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Quiet utilities, made with care
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Animations */}
      <style>{`
        @media (min-width: 640px) {
          [role="dialog"][aria-label="Tools"] {
            border-radius: 20px !important;
          }
        }
        @keyframes tools-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes tools-fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes tools-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes tools-slide-down {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes tools-item-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (min-width: 640px) {
          @keyframes tools-slide-up {
            from { transform: translateY(24px) scale(0.96); opacity: 0; }
            to { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes tools-slide-down {
            from { transform: translateY(0) scale(1); opacity: 1; }
            to { transform: translateY(24px) scale(0.96); opacity: 0; }
          }
        }
      `}</style>
    </>
  );
}
