"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, LayoutGrid, Star, Download, Loader2 } from "lucide-react";
import { useHiddenTabs, refreshNavPrefs } from "@/lib/nav-prefs";
import { useInbox } from "@/lib/inbox";

/**
 * App drawer — opens like a launcher (full-screen slide-up, staggered icon
 * grid). "Apps" shows installed apps; "Store" browses every app by category
 * with Install/Open — installing also precaches the page for offline.
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

function BirthdayArt() {
  // Cake with a single candle
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <circle cx="24" cy="8" r="1.6" />
      <path d="M24 11v5" />
      <path d="M12 40V27c0-2 1-3 3-3h18c2 0 3 1 3 3v13" />
      <path d="M12 31c2 2 4 2 6 0s4-2 6 0 4 2 6 0 4-2 6 0" />
      <path d="M8 40h32" />
    </svg>
  );
}

function SubsArt() {
  // Receipt with a renewal loop
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M15 8h18v30l-3-2.4-3 2.4-3-2.4-3 2.4-3-2.4-3 2.4z" />
      <path d="M20 16h8" />
      <path d="M20 21h8" />
      <path d="M24 33a6 6 0 1 1 1.2-3.7" />
      <path d="M25.3 24.8v4.5h-4.5" />
    </svg>
  );
}

function GuideArt() {
  // Open guidebook with a compass needle
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 14c-4-2.5-9-3-14-2v26c5-1 10-.5 14 2 4-2.5 9-3 14-2V12c-5-1-10-.5-14 2z" />
      <path d="M24 14v26" />
      <circle cx="24" cy="26" r="5.5" />
      <path d="M26.2 23.8l-4 1.6 1.6 4 4-1.6z" />
    </svg>
  );
}

function MasjidArt() {
  // Dome on a base with two minarets
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M14 34v-6a10 10 0 0 1 20 0v6" />
      <path d="M24 16v-4" />
      <circle cx="24" cy="10.5" r="1.6" />
      <path d="M10 34h28M12 38h24" />
      <path d="M8 34V22M40 34V22" />
      <circle cx="8" cy="20" r="1.6" />
      <circle cx="40" cy="20" r="1.6" />
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

function MessageArt() {
  // Speech bubble with a tail
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M10 12h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H20l-7 7v-7h-3a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" />
      <circle cx="17" cy="23" r="1.8" />
      <circle cx="24" cy="23" r="1.8" />
      <circle cx="31" cy="23" r="1.8" />
    </svg>
  );
}

function ShieldArt() {
  // Shield over a crescent
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M24 5l15 5v11c0 10-6.5 18-15 22-8.5-4-15-12-15-22V10z" />
      <path d="M29 18a7.5 7.5 0 1 0 4 13.4A9 9 0 1 1 29 18z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

function HomeworkArt() {
  // Notebook with a checked line
  return (
    <svg viewBox="0 0 48 48" {...STROKE} aria-hidden="true">
      <path d="M14 6h20a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" />
      <path d="M14 6v36" opacity="0.4" />
      <path d="M20 18l3 3 6-6" />
      <path d="M20 30h12" opacity="0.5" />
    </svg>
  );
}

interface AppDef {
  key: string;       // registry key (hiddenTabs entry = uninstalled)
  href: string;
  label: string;
  arabic: string;
  description: string;
  rating: string;
  installs: string;
  art: () => React.ReactElement;
  ranked?: boolean;
}

const CATEGORIES: { title: string; apps: AppDef[] }[] = [
  {
    title: "Prayer",
    apps: [
      { key: "/qibla", href: "/qibla", label: "Qibla", arabic: "قبلة", description: "Direction to the Kaaba, live compass", rating: "4.9", installs: "18K", art: QiblaArt },
      { key: "/dhikr", href: "/dhikr", label: "Dhikr", arabic: "ذكر", description: "Tasbih counter with sequences", rating: "4.8", installs: "24K", art: DhikrArt },
      { key: "/masjids", href: "/masjids", label: "Masjids", arabic: "مساجد", description: "Nearby masjids & iqamah times", rating: "4.7", installs: "9K", art: MasjidArt },
      { key: "/shield", href: "/shield", label: "Salah Shield", arabic: "درع", description: "Locks distracting apps while prayer is due", rating: "4.9", installs: "16K", art: ShieldArt },
    ],
  },
  {
    title: "Quran",
    apps: [
      { key: "/quran", href: "/quran", label: "AyaTrace", arabic: "قرآن", description: "Name the surah from a verse", rating: "4.9", installs: "15K", art: QuranArt, ranked: true },
      { key: "/mutashabihat", href: "/mutashabihat", label: "Mutashabih", arabic: "متشابه", description: "Train on verses that look alike", rating: "4.8", installs: "7K", art: MutashabihArt, ranked: true },
      { key: "/names", href: "/names", label: "99 Names", arabic: "أسماء الله", description: "Names of Allah, one a day", rating: "4.9", installs: "21K", art: NamesArt },
    ],
  },
  {
    title: "Study",
    apps: [
      { key: "/homework", href: "/homework", label: "Homework", arabic: "واجب", description: "Assignments, deadlines, stats", rating: "4.7", installs: "11K", art: HomeworkArt },
      { key: "/study", href: "/study", label: "Study", arabic: "دراسة", description: "Focus timer & ambient sounds", rating: "4.8", installs: "14K", art: StudyArt },
      { key: "/learn", href: "/learn", label: "Learn", arabic: "علم", description: "Prayer knowledge, step by step", rating: "4.6", installs: "6K", art: LearnArt },
      { key: "/talks", href: "/talks", label: "Talks", arabic: "دروس", description: "Lectures & khutbahs", rating: "4.8", installs: "12K", art: TalksArt },
    ],
  },
  {
    title: "Life",
    apps: [
      { key: "/subscriptions", href: "/subscriptions", label: "Money", arabic: "مصاريف", description: "Subscriptions & spending log", rating: "4.7", installs: "8K", art: SubsArt },
      { key: "/birthdays", href: "/birthdays", label: "Birthdays", arabic: "أعياد", description: "Never miss one again", rating: "4.8", installs: "10K", art: BirthdayArt },
    ],
  },
  {
    title: "Social",
    apps: [
      { key: "messages", href: "/messages", label: "Messages", arabic: "رسائل", description: "Prayer-friend chats", rating: "4.8", installs: "13K", art: MessageArt },
    ],
  },
  {
    title: "Help",
    apps: [
      { key: "/guide", href: "/guide", label: "Guide", arabic: "دليل", description: "How Waqt works", rating: "4.6", installs: "5K", art: GuideArt },
    ],
  },
];

// Tell the SW to precache (install) or drop (uninstall) a route's page.
function precacheRoute(href: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PRECACHE_ROUTES", urls: [href] });
  } catch { /* no SW — still installs, just not offline-primed */ }
}
function evictRoute(href: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "EVICT_ROUTES", urls: [href] });
  } catch { /* ignore */ }
}

export default function ToolsMenu({ variant = "icon" }: { variant?: "icon" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"apps" | "store">("apps");
  const [busy, setBusy] = useState<string | null>(null);
  const hiddenTabs = useHiddenTabs();
  const inbox = useInbox();

  const isInstalled = (app: AppDef) => !hiddenTabs.has(app.key);

  async function setInstalled(app: AppDef, install: boolean) {
    if (busy) return;
    setBusy(app.key);
    const next = new Set(hiddenTabs);
    if (install) next.delete(app.key);
    else next.add(app.key);
    try {
      const res = await fetch("/api/settings/tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenTabs: [...next] }),
      });
      if (res.ok) {
        refreshNavPrefs();
        if (install) precacheRoute(app.href);
        else evictRoute(app.href);
      }
    } finally {
      setBusy(null);
    }
  }

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

  const iconTile = (app: AppDef, size: "lg" | "sm") => {
    const Art = app.art;
    return (
      <span
        className="relative block shrink-0 rounded-2xl"
        style={{
          width: size === "lg" ? 56 : 48,
          height: size === "lg" ? 56 : 48,
          padding: size === "lg" ? 10 : 9,
          backgroundColor: "var(--color-paper-2)",
          border: "1px solid var(--color-paper-3)",
          color: "var(--color-ink-soft)",
        }}
      >
        <Art />
        {app.key === "messages" && (inbox.unreadMessages ?? 0) > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
            aria-label={`${inbox.unreadMessages} unread messages`}
          >
            {(inbox.unreadMessages ?? 0) > 99 ? "99+" : inbox.unreadMessages}
          </span>
        )}
      </span>
    );
  };

  const installedApps = CATEGORIES.flatMap((c) => c.apps).filter(isInstalled);

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
          Apps
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
          aria-label="Open apps"
        >
          <LayoutGrid className="h-[18px] w-[18px]" style={{ color: "var(--color-ink-soft)" }} />
        </button>
      )}

      {/* App drawer — portal to escape backdrop-filter containing blocks */}
      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)",
            animation: closing ? "drawer-fade-out 0.22s ease-out forwards" : "drawer-fade-in 0.2s ease-out",
          }}
          onClick={dismiss}
        >
          {/* The drawer — full screen, slides up like a launcher */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Apps"
            className="absolute inset-0 flex flex-col overflow-hidden"
            style={{
              backgroundColor: "var(--color-paper)",
              animation: closing
                ? "drawer-slide-down 0.22s ease-in forwards"
                : "drawer-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-4 pb-3 pt-3 sm:px-6"
              style={{ borderColor: "var(--color-paper-3)", paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
            >
              <div className="flex items-center gap-3">
                <p
                  className="text-xl leading-none"
                  style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}
                  aria-hidden="true"
                >
                  تطبيقات
                </p>
                {/* Segmented Apps / Store — Play Store style */}
                <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
                  {(["apps", "store"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        backgroundColor: view === v ? "var(--color-ink)" : "transparent",
                        color: view === v ? "var(--color-paper)" : "var(--color-ink-muted)",
                      }}
                    >
                      {v === "apps" ? "My apps" : "Store"}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={dismiss}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 44, minWidth: 44 }}
                aria-label="Close apps"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
              {view === "apps" ? (
                installedApps.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <LayoutGrid className="mb-3 h-8 w-8" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
                    <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No apps installed yet.</p>
                    <button
                      onClick={() => setView("store")}
                      className="mt-3 rounded-full px-4 py-2 text-xs font-semibold"
                      style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                    >
                      Browse the store
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-x-2 gap-y-5 pt-5 sm:grid-cols-6">
                    {installedApps.map((app) => (
                      <Link
                        key={app.key}
                        href={app.href}
                        prefetch
                        onClick={() => setOpen(false)}
                        className="group flex flex-col items-center gap-1.5"
                        style={{ animation: `drawer-app-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${0.025 * tileIdx++}s both` }}
                      >
                        <span className="transition-transform group-hover:-translate-y-0.5 group-hover:text-[var(--color-accent)]">
                          {iconTile(app, "lg")}
                        </span>
                        <span className="max-w-full truncate text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>
                          {app.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                )
              ) : (
                /* Store — Play-Store rows grouped by category */
                <div className="pt-3">
                  <p className="pb-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    Install an app to pin it to your drawer and save it for offline.
                  </p>
                  {CATEGORIES.map((cat) => (
                    <div key={cat.title} className="pt-4">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                        {cat.title}
                      </p>
                      <div className="flex flex-col">
                        {cat.apps.map((app) => {
                          const installed = isInstalled(app);
                          return (
                            <div
                              key={app.key}
                              className="flex items-center gap-3.5 border-b py-3 last:border-b-0"
                              style={{ borderColor: "var(--color-paper-3)" }}
                            >
                              {iconTile(app, "sm")}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{app.label}</p>
                                  <span className="text-[12px] leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-ink-muted)" }}>{app.arabic}</span>
                                  {app.ranked && (
                                    <span className="shrink-0 rounded-full border px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.08em]" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
                                      Ranked
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                                  <Star className="h-2.5 w-2.5" style={{ color: "var(--color-warmth)" }} fill="currentColor" />
                                  {app.rating} · {app.installs} installs
                                </p>
                                <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>{app.description}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {installed ? (
                                  <>
                                    <Link
                                      href={app.href}
                                      onClick={() => setOpen(false)}
                                      className="rounded-full px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
                                      style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 32 }}
                                    >
                                      Open
                                    </Link>
                                    <button
                                      onClick={() => setInstalled(app, false)}
                                      disabled={busy === app.key}
                                      className="text-[10px] font-medium disabled:opacity-50"
                                      style={{ color: "var(--color-ink-muted)" }}
                                    >
                                      {busy === app.key ? "…" : "Uninstall"}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setInstalled(app, true)}
                                    disabled={busy === app.key}
                                    className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", minHeight: 32 }}
                                  >
                                    {busy === app.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                    Install
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Animations */}
      <style>{`
        @keyframes drawer-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes drawer-fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes drawer-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes drawer-slide-down {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes drawer-app-in {
          from { opacity: 0; transform: translateY(14px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
