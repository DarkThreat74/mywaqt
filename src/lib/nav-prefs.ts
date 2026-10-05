"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HIDEABLE_SET } from "@/lib/nav-tabs";

// Tiny shared store for the user's hidden-tab set — mirrors the inbox pattern:
// one fetch per mount burst, a custom event re-fetches after Settings saves.
const CACHE_KEY = "waqt-nav-tabs";

let hidden: Set<string> = new Set();
let loaded = false;
let fetching: Promise<void> | null = null;
const listeners = new Set<() => void>();

// Seed synchronously from the localStorage cache so hidden items never
// flash visible while the API fetch is in flight.
try {
  const raw = localStorage.getItem(CACHE_KEY);
  const arr = raw ? (JSON.parse(raw) as string[]) : null;
  if (Array.isArray(arr)) {
    hidden = new Set(arr.filter((k) => HIDEABLE_SET.has(k)));
    loaded = true;
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
      hidden = new Set(Array.isArray(d?.hiddenTabs) ? d.hiddenTabs.filter((k: string) => HIDEABLE_SET.has(k)) : []);
      loaded = true;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify([...hidden])); } catch { /* ignore */ }
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
