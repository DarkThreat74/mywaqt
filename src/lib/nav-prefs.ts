"use client";

import { useEffect, useSyncExternalStore } from "react";
import { HIDEABLE_SET } from "@/lib/nav-tabs";

// Tiny shared store for the user's hidden-tab set — mirrors the inbox pattern:
// one fetch per mount burst, a custom event re-fetches after Settings saves.
let hidden: Set<string> = new Set();
let loaded = false;
let fetching: Promise<void> | null = null;
const listeners = new Set<() => void>();

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
