"use client";

import { useSyncExternalStore } from "react";
import { LayoutGrid } from "lucide-react";
import { useHiddenTabs } from "@/lib/nav-prefs";

/* Raised center button in the mobile nav — opens the tools sheet.
   Hideable via Settings → Navigation ("Center tools button"). */
export default function ToolsFab() {
  const hiddenTabs = useHiddenTabs();
  // false on the server, true once hydrated — the SSR'd HTML can't know the
  // user's setting, so render a spacer until the cached prefs are read.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  // Pre-hydration: a spacer keeps the nav layout stable. Once the cached
  // prefs are known, hidden means truly gone — no empty slot.
  if (!ready) return <div className="min-w-0 flex-1" aria-hidden />;
  if (hiddenTabs.has("tools-fab")) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-tools-menu"))}
      aria-label="Open tools"
      className="flex min-w-0 flex-1 flex-col items-center"
    >
      <span
        className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full border-4 shadow-lg transition-transform active:scale-95"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-paper)",
          borderColor: "var(--color-paper)",
        }}
      >
        <LayoutGrid className="h-5 w-5" />
      </span>
    </button>
  );
}
