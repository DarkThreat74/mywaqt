"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Compass, Heart, HandHeart, BookOpen, PlayCircle, X, Sparkles, LayoutGrid, ArrowUpRight } from "lucide-react";

interface Tool {
  href: string;
  label: string;
  arabic: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const TOOLS: Tool[] = [
  {
    href: "/qibla",
    label: "Qibla",
    arabic: "قبلة",
    description: "Direction to the Kaaba",
    icon: Compass,
  },
  {
    href: "/dhikr",
    label: "Dhikr",
    arabic: "ذكر",
    description: "Tasbih counter",
    icon: Heart,
  },
  {
    href: "/sadaqah",
    label: "Sadaqah",
    arabic: "صدقة",
    description: "Track your giving",
    icon: HandHeart,
  },
  {
    href: "/names",
    label: "99 Names",
    arabic: "أسماء الله",
    description: "Names of Allah",
    icon: Sparkles,
  },
  {
    href: "/learn",
    label: "Learn",
    arabic: "علم",
    description: "Prayer knowledge",
    icon: BookOpen,
  },
  {
    href: "/talks",
    label: "Talks",
    arabic: "دروس",
    description: "Lectures & khutbahs",
    icon: PlayCircle,
  },
];

export default function ToolsMenu({ variant = "icon" }: { variant?: "icon" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

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
            className="w-full overflow-hidden border sm:max-w-md"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              // Sheet on mobile (top corners only), floating card on desktop
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

            {/* Header — editorial: Arabic wordmark + close */}
            <div className="flex items-start justify-between px-5 pt-4 pb-4 sm:pt-5">
              <div>
                <p
                  className="text-xl leading-none"
                  style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}
                  aria-hidden="true"
                >
                  أدوات
                </p>
                <h2 className="mt-1.5 text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
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

            {/* Divider */}
            <div className="mx-5 h-px" style={{ backgroundColor: "var(--color-paper-3)" }} />

            {/* Tool list — clean rows, consistent with the rest of the app */}
            <div className="flex flex-col px-3 py-2 pb-5">
              {TOOLS.map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className="group flex items-center gap-3.5 rounded-xl px-2.5 py-3 transition-colors hover:bg-[var(--color-paper-2)] active:bg-[var(--color-paper-3)]"
                    style={{
                      animation: `tools-item-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${0.035 * i + 0.05}s both`,
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        backgroundColor: "var(--color-paper-2)",
                        borderColor: "var(--color-paper-3)",
                        color: "var(--color-ink-soft)",
                      }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[15px] font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>
                          {tool.label}
                        </span>
                        <span
                          className="text-[13px] leading-none"
                          style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}
                        >
                          {tool.arabic}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
                        {tool.description}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--color-ink-muted)" }}
                    />
                  </Link>
                );
              })}
            </div>
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
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
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
