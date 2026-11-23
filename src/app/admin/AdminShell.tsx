"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ShieldCheck,
  Mic,
  LayoutGrid,
  Users,
  Settings as SettingsIcon,
  MessageSquarePlus,
  Menu,
  X,
  AudioLines,
} from "lucide-react";
import { AudioPlayerProvider } from "@/components/audio-player-context";
import GlobalAudioPlayer from "@/components/global-audio-player";
import { applyAdminTheme, readAdminTheme, restoreAppTheme } from "@/lib/admin-theme";

export type AdminTab = "overview" | "users" | "talks" | "recite" | "feedback" | "settings";

export interface AdminStats {
  users: number;
  talks: number;
}

interface NavItem {
  key: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid, description: "Platform summary" },
  { key: "users", label: "Users", icon: Users, description: "All registered accounts" },
  { key: "talks", label: "Talks", icon: Mic, description: "Upload and manage talks" },
  { key: "recite", label: "Recite Clips", icon: AudioLines, description: "Reference recitations for the coach" },
  { key: "feedback", label: "Feedback", icon: MessageSquarePlus, description: "User bug reports and notes" },
  { key: "settings", label: "Settings", icon: SettingsIcon, description: "Platform configuration" },
];

const isTab = (v: string | null): v is AdminTab => NAV_ITEMS.some((n) => n.key === v);

export function AdminShell({
  children,
}: {
  children: (ctx: { tab: AdminTab; setTab: (t: AdminTab) => void; stats: AdminStats | null }) => React.ReactNode;
}) {
  const [tab, setTabState] = useState<AdminTab>("overview");
  const [authState, setAuthState] = useState<"checking" | "ok" | "error">("checking");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Tab state lives in the URL (?tab=) so a refresh or shared link lands on
  // the same section. history.replaceState keeps it out of the router —
  // these aren't real routes, just UI state made addressable.
  const setTab = useCallback((t: AdminTab) => {
    setTabState(t);
    window.history.replaceState(null, "", `/admin?tab=${t}`);
  }, []);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (isTab(q)) setTabState(q);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // Single auth+stats fetch — the page used to fire an identical request in
  // parallel (StrictMode doubled it again). 10s cap: a hung connection used
  // to leave "Verifying access…" spinning forever. Only 401/403 redirects to
  // login; network/server failures get a retry, not a fake sign-out.
  const check = useCallback(() => {
    setAuthState("checking");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    fetch("/api/admin/stats", { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          router.push("/admin/login");
          return;
        }
        if (!r.ok) throw new Error(`stats ${r.status}`);
        const data = await r.json(); // rejects on non-JSON — error state, not a hang
        setStats(data);
        setAuthState("ok");
      })
      .catch(() => setAuthState("error"))
      .finally(() => clearTimeout(timer));
  }, [router]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth check; same pattern as the rest of the codebase
  useEffect(() => check(), [check]);

  // "Exit to login" actually signs out — the old version just navigated and
  // left the session cookie alive, so "logging out" did nothing.
  const signOut = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => router.push("/admin/login"));
  }, [router]);

  // Mobile drawer = modal dialog: Escape closes, focus moves in on open and
  // back to the menu button on close.
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const menuBtn = menuBtnRef.current;
    drawerRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      menuBtn?.focus();
    };
  }, [sidebarOpen]);

  // Apply the admin theme while this portal is mounted — it stores its own
  // localStorage key (waqt:admin:theme) that nothing else reads. Re-apply on
  // storage changes (the Settings toggle writes it) and on OS-level flips
  // when set to "system". On unmount, hand data-theme back to the app theme.
  useEffect(() => {
    const apply = () => applyAdminTheme(readAdminTheme());
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Safari <14 and old Android WebViews only have addListener/removeListener.
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);
    window.addEventListener("storage", apply);
    window.addEventListener("waqt:admin-theme", apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
      window.removeEventListener("storage", apply);
      window.removeEventListener("waqt:admin-theme", apply);
      restoreAppTheme();
    };
  }, []);

  if (authState === "checking") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
            style={{
              borderTopColor: "var(--color-accent)",
              borderRightColor: "var(--color-accent)",
            }}
          />
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Verifying access…
          </p>
        </div>
      </div>
    );
  }

  if (authState === "error") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center px-6"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            Couldn&apos;t verify access
          </p>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            A network or server error — you weren&apos;t signed out.
          </p>
          <div className="flex gap-2">
            <button
              onClick={check}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Retry
            </button>
            <button
              onClick={() => router.push("/admin/login")}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            >
              Sign in again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === tab);

  return (
    <AudioPlayerProvider>
    <div
      className="flex min-h-dvh overflow-x-clip"
      style={{ backgroundColor: "var(--color-paper-2)" }}
    >
      {/* ── Desktop sidebar ── */}
      <aside
        className="fixed left-0 top-0 bottom-0 hidden w-60 flex-col border-r lg:flex"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <SidebarContent
          tab={tab}
          onTabChange={(t) => setTab(t)}
          onExit={signOut}
        />
      </aside>

      {/* ── Mobile top bar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b px-5 py-3 lg:hidden"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "var(--color-ink)",
              boxShadow: "0 1px 3px color-mix(in oklab, var(--color-ink) 30%, transparent)",
            }}
          >
            <ShieldCheck className="h-4 w-4" style={{ color: "var(--color-paper)" }} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
              Waqt Admin
            </span>
            <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              {currentNav?.label}
            </span>
          </div>
        </div>
        <button
          ref={menuBtnRef}
          onClick={() => setSidebarOpen(true)}
          className="flex items-center justify-center rounded-lg border transition-colors"
          style={{
            borderColor: "var(--color-paper-3)",
            color: "var(--color-ink-soft)",
            minHeight: 40,
            minWidth: 40,
          }}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </header>

      {/* ── Mobile sidebar (modal dialog) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)",
            animation: "admin-fade-in 0.2s ease-out",
          }}
          onClick={() => setSidebarOpen(false)}
        >
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin sections"
            className="absolute left-0 top-0 bottom-0 flex w-72 flex-col border-r"
            style={{
              borderColor: "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
              animation: "admin-slide-right 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                Sections
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              tab={tab}
              onTabChange={(t) => {
                setTab(t);
                setSidebarOpen(false);
              }}
              onExit={signOut}
            />
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col lg:pl-60">
        <main
          className="flex-1 px-5 pb-12 pt-16 sm:px-8 lg:px-12 lg:pt-12"
          style={{ paddingTop: "calc(4rem + env(safe-area-inset-top))" }}
        >
          {/* Section header */}
          <div className="mb-8 max-w-5xl">
            <h1
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              style={{ color: "var(--color-ink)" }}
            >
              {currentNav?.label}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {currentNav?.description}
            </p>
          </div>

          <div className="max-w-5xl">{children({ tab, setTab, stats })}</div>
        </main>
      </div>

      <style>{`
        @keyframes admin-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes admin-slide-right {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Global audio player — lets admin test talk playback */}
      <GlobalAudioPlayer />
    </div>
    </AudioPlayerProvider>
  );
}

// ─── Sidebar content (shared between desktop and mobile) ───

function SidebarContent({
  tab,
  onTabChange,
  onExit,
}: {
  tab: AdminTab;
  onTabChange: (t: AdminTab) => void;
  onExit: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            backgroundColor: "var(--color-ink)",
            boxShadow: "0 2px 6px color-mix(in oklab, var(--color-ink) 25%, transparent)",
          }}
        >
          <ShieldCheck className="h-4 w-4" style={{ color: "var(--color-paper)" }} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Waqt
          </span>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Admin Portal
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Admin sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              aria-current={active ? "page" : undefined}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                backgroundColor: active ? "var(--color-accent-faint)" : "transparent",
              }}
            >
              <Icon
                className="h-4 w-4 transition-colors"
                style={{ color: active ? "var(--color-accent)" : "var(--color-ink-muted)" }}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t px-3 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
        <button
          onClick={onExit}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );
}
