"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ShieldCheck,
  Mic,
  LayoutGrid,
  Users,
  Settings as SettingsIcon,
  Menu,
  X,
} from "lucide-react";

export type AdminTab = "overview" | "users" | "talks" | "settings";

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
  { key: "settings", label: "Settings", icon: SettingsIcon, description: "Platform configuration" },
];

export function AdminShell({
  children,
}: {
  children: (ctx: { tab: AdminTab; setTab: (t: AdminTab) => void }) => React.ReactNode;
}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          router.push("/admin/login");
          return null;
        }
        return r.json().catch(() => null);
      })
      .then((data) => {
        if (data) {
          // stats are passed via props from the parent, but we need to
          // confirm auth here. The parent reads stats from this fetch too.
          setAuthChecked(true);
        }
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  if (!authChecked) {
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

  const currentNav = NAV_ITEMS.find((n) => n.key === tab);

  return (
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
          onExit={() => router.push("/admin/login")}
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

      {/* ── Mobile sidebar ── */}
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
              onExit={() => router.push("/admin/login")}
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

          <div className="max-w-5xl">{children({ tab, setTab })}</div>
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
    </div>
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

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
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
          Exit to login
        </button>
      </div>
    </>
  );
}
