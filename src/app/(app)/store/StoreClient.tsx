"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star, LayoutGrid } from "lucide-react";
import { useHiddenTabs, refreshNavPrefs } from "@/lib/nav-prefs";
import { ALL_APPS, CATEGORIES, APP_BY_KEY, type AppDef } from "@/lib/app-registry";

/**
 * The store — its own app, not a drawer tab. Featured card up top, then
 * category shelves of rows: icon, name, one-liner, rating, and a single
 * action per app — "Add to My apps" or "Open" (with "Hide" underneath).
 */

// Ask the SW to keep the app on-device so it opens offline.
function precacheRoute(href: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PRECACHE_ROUTES", urls: [href] });
  } catch { /* ignore */ }
}
function evictRoute(href: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "EVICT_ROUTES", urls: [href] });
  } catch { /* ignore */ }
}

function IconTile({ app, size = 52 }: { app: AppDef; size?: number }) {
  const Art = app.art;
  return (
    <span
      className="block shrink-0 rounded-2xl"
      style={{
        width: size, height: size, padding: Math.round(size * 0.18),
        backgroundColor: "var(--color-paper-2)",
        border: "1px solid var(--color-paper-3)",
        color: "var(--color-ink-soft)",
      }}
    >
      <Art />
    </span>
  );
}

export default function StoreClient() {
  const hiddenTabs = useHiddenTabs();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setInstalled(key: string, installed: boolean) {
    const app = APP_BY_KEY.get(key);
    if (!app || busy) return;
    setBusy(key);
    try {
      const next = new Set(hiddenTabs);
      if (installed) next.delete(key); else next.add(key);
      const r = await fetch("/api/settings/tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenTabs: [...next] }),
      });
      if (r.ok) {
        refreshNavPrefs();
        if (installed) precacheRoute(app.href); else evictRoute(app.href);
      }
    } finally {
      setBusy(null);
    }
  }

  const featured = APP_BY_KEY.get("/shield") ?? ALL_APPS[0];

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 82%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/calendar/day"
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Store
          </h1>
          <button
            onClick={() => window.dispatchEvent(new Event("open-tools-menu"))}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            My apps
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        {/* Featured */}
        <div
          className="mt-5 flex items-center gap-4 overflow-hidden rounded-3xl border p-5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
        >
          <IconTile app={featured} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Featured
            </p>
            <p className="mt-0.5 text-lg font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {featured.label}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              {featured.description}
            </p>
          </div>
        </div>

        {/* Category shelves */}
        {CATEGORIES.map((cat) => (
          <section key={cat.title} className="mt-8">
            <h2
              className="mb-1 text-base font-bold tracking-tight"
              style={{ color: "var(--color-ink)" }}
            >
              {cat.title}
            </h2>
            <div>
              {cat.keys.map((key) => {
                const app = APP_BY_KEY.get(key);
                if (!app) return null;
                const installed = !hiddenTabs.has(key);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3.5 border-b py-3.5 last:border-b-0"
                    style={{ borderColor: "var(--color-paper-3)" }}
                  >
                    <IconTile app={app} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                        {app.label}
                        {app.ranked && (
                          <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide align-middle" style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}>
                            Game
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
                        {app.description}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        <Star className="h-2.5 w-2.5" fill="currentColor" style={{ color: "var(--color-accent)" }} />
                        {app.rating} · {app.installs} installs
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      {installed ? (
                        <>
                          <button
                            onClick={() => router.push(app.href)}
                            className="rounded-full px-4 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                            style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                          >
                            Open
                          </button>
                          <button
                            onClick={() => void setInstalled(key, false)}
                            disabled={busy === key}
                            className="text-[10px] font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                            style={{ color: "var(--color-ink-muted)" }}
                          >
                            Hide
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => void setInstalled(key, true)}
                          disabled={busy === key}
                          className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                          style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                        >
                          Add to My apps
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <p className="mt-10 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Adding an app pins it to My apps and saves it on this device for offline use.
        </p>
      </div>
    </div>
  );
}
