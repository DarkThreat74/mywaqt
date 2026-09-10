"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Compass, Heart, HandHeart, BookOpen, PlayCircle, Wrench, X, Sparkles } from "lucide-react";

interface Tool {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  span?: "full" | "half";
}

const TOOLS: Tool[] = [
  {
    href: "/qibla",
    label: "Qibla Compass",
    description: "Find the direction to the Kaaba from wherever you are",
    icon: Compass,
    color: "var(--color-accent)",
    span: "full",
  },
  {
    href: "/dhikr",
    label: "Dhikr Counter",
    description: "Tasbih counter with curated sequences",
    icon: Heart,
    color: "var(--color-warmth)",
    span: "half",
  },
  {
    href: "/sadaqah",
    label: "Akhirah Card",
    description: "Track your charitable giving",
    icon: HandHeart,
    color: "var(--color-success)",
    span: "half",
  },
  {
    href: "/names",
    label: "99 Names",
    description: "Learn the beautiful names of Allah",
    icon: Sparkles,
    color: "var(--color-accent)",
    span: "half",
  },
  {
    href: "/learn",
    label: "Learn",
    description: "Prayer knowledge library",
    icon: BookOpen,
    color: "var(--color-ink-soft)",
    span: "half",
  },
  {
    href: "/talks",
    label: "Talks",
    description: "Curated lectures and khutbahs",
    icon: PlayCircle,
    color: "var(--color-ink-soft)",
    span: "half",
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
          <Wrench className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          Tools
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
          aria-label="Open tools menu"
        >
          <Wrench className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
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
            className="w-full overflow-hidden rounded-t-3xl border sm:max-w-md sm:rounded-3xl"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              paddingTop: "env(safe-area-inset-top)",
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

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-5 sm:pb-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
                  Tools
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  Islamic utilities and resources
                </p>
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

            {/* Bento grid — asymmetric tiles, not equal columns */}
            <div className="grid grid-cols-2 gap-2.5 px-4 pb-5">
              {TOOLS.map((tool, i) => {
                const Icon = tool.icon;
                const isFull = tool.span === "full";
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-transform active:scale-[0.97] ${isFull ? "col-span-2" : "col-span-1"}`}
                    style={{
                      borderColor: "color-mix(in oklab, var(--color-paper-3) 60%, transparent)",
                      backgroundColor: `color-mix(in oklab, ${tool.color} 5%, var(--color-paper))`,
                      animation: `tools-item-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${0.05 * i + 0.06}s both`,
                      minHeight: isFull ? 96 : 88,
                    }}
                  >
                    {/* Subtle top accent line in the tool's color */}
                    <div
                      className="absolute inset-x-0 top-0 h-px opacity-40"
                      style={{ backgroundColor: tool.color }}
                    />

                    {/* Icon + content */}
                    {isFull ? (
                      // Full-width feature tile: horizontal layout
                      <div className="flex h-full items-center gap-4 px-4 py-3.5">
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: `color-mix(in oklab, ${tool.color} 14%, transparent)` }}
                        >
                          <Icon className="h-6 w-6" style={{ color: tool.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>
                            {tool.label}
                          </p>
                          <p className="mt-1 text-xs leading-snug" style={{ color: "var(--color-ink-muted)" }}>
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    ) : (
                      // Half-width tiles: vertical layout
                      <div className="flex h-full flex-col gap-2 px-3.5 py-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `color-mix(in oklab, ${tool.color} 14%, transparent)` }}
                        >
                          <Icon className="h-[18px] w-[18px]" style={{ color: tool.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--color-ink)" }}>
                            {tool.label}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-tight" style={{ color: "var(--color-ink-muted)" }}>
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    )}
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
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
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
