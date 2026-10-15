"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HIDEABLE_SET } from "@/lib/nav-tabs";

// Tiny shared store for the user's hidden-tab set — mirrors the inbox pattern:
// one fetch per mount burst, a custom event re-fetches after Settings saves.
// Scoped to the signed-in account — a second user on this device must not
// see (or overwrite) the first user's hidden-tab cache.
function cacheKey(): string {
  try {
    const uid = localStorage.getItem("waqt:uid");
    return uid ? `waqt-nav-tabs:${uid}` : "waqt-nav-tabs";
  } catch {
    return "waqt-nav-tabs";
  }
}

let hidden: Set<string> = new Set();
let loaded = false;
let fetching: Promise<void> | null = null;
const listeners = new Set<() => void>();

// Seed synchronously from the localStorage cache so hidden items never
// flash visible while the API fetch is in flight. No cache = fresh
// install → everything hidden; My apps starts as just the Store tile
// and the user adds apps deliberately, like a real launcher.
try {
  const raw = localStorage.getItem(cacheKey());
  const arr = raw ? (JSON.parse(raw) as string[]) : null;
  if (Array.isArray(arr)) {
    hidden = new Set(arr.filter((k) => HIDEABLE_SET.has(k)));
    loaded = true;
  } else {
    // Default for the first paint — but loaded stays false so the API
    // fetch still runs and can override with the real prefs.
    hidden = new Set(HIDEABLE_SET);
  }
} catch { /* private mode / SSR */ }

function emit() {
  for (const l of listeners) l();
}

async function load(force = false) {
  if (fetching) return fetching;
  if (loaded && !force) return Promise.resolve();
  fetching = fetch("/api/settings/tabs")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      // null/undefined = never chose → default is everything hidden (just
      // the Store). An explicit [] means the user showed every app.
      hidden = Array.isArray(d?.hiddenTabs)
        ? new Set(d.hiddenTabs.filter((k: string) => HIDEABLE_SET.has(k)))
        : new Set(HIDEABLE_SET);
      loaded = true;
      try { localStorage.setItem(cacheKey(), JSON.stringify([...hidden])); } catch { /* ignore */ }
      emit();
    })
    .catch(() => {})
    .finally(() => {
      fetching = null;
    });
  return fetching;
}

// Called by the Settings UI after a successful save so nav updates instantly.
export function refreshNavPrefs() {
  void load(true);
}

export function useHiddenTabs(): Set<string> {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => hidden,
    () => hidden,
  );
}
