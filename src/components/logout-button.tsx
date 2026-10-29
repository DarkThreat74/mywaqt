"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

/**
 * Logout button — client component (uses navigator.serviceWorker, fetch, window).
 * Must live in its own file with "use client" at the top; a "use client"
 * directive inside a function body of a Server Component file is invalid and
 * causes React error #441 ("Event handlers cannot be passed to Client Component props").
 */
export default function LogoutButton() {
  // Two-tap confirm — first tap arms it, second signs out. Auto-disarms.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const handleLogout = async () => {
    if (!confirming) { setConfirming(true); return; }
    try {
      // Unsubscribe push before logout
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch { /* non-critical */ }
    try {
      // Wipe cached user data BEFORE logout — the SW caches private API
      // responses + stamped page HTML, and serves them while fresh without
      // checking auth. On a shared device that data must not survive logout.
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.active?.postMessage({ type: "CLEAR_USER_CACHE" });
      // Offline IndexedDB (events, prayer logs, outbox) — same leak vector.
      // Dexie's singleton holds a connection that blocks deleteDatabase, so
      // close it first and await the deletion — a fire-and-forget request
      // silently survives into the next session.
      try {
        const { getOfflineDB } = await import("@/lib/offline/db");
        getOfflineDB().close();
      } catch { /* never opened on this page — fine */ }
      try {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("waqt-offline-data");
          req.onsuccess = req.onblocked = req.onerror = () => resolve();
        });
      } catch { /* ignore */ }
      // Quran tester DB — mistakes, coverage, position are user data too;
      // without this they leak into the next account on this device.
      try {
        const { closeMistakesDB } = await import("@/features/quran-tester/mistakes");
        closeMistakesDB();
      } catch { /* never opened — fine */ }
      try {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("quran-tester");
          req.onsuccess = req.onblocked = req.onerror = () => resolve();
        });
      } catch { /* ignore */ }
      // LocalStorage app keys (settings cache, session store, seen flags).
      try {
        Object.keys(localStorage)
          // waqt:funfact:* is exempt — content indices + an on/off toggle,
          // no private data; wiping it reset the cards preference every logout.
          .filter((k) => ((k.startsWith("waqt-") || k.startsWith("waqt:")) && !k.startsWith("waqt:funfact:")) || k === "quran-best-streak" || k.startsWith("qt:"))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* non-critical */ }
    // Full page reload on logout clears all client state — intentional
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };
  return (
    <button
      onClick={handleLogout}
      className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
      style={{ color: "var(--color-ink-soft)" }}
    >
      <LogOut className="h-4 w-4" style={{ color: confirming ? "var(--color-error)" : "var(--color-ink-muted)" }} />
      {confirming ? "Tap again to sign out" : "Log out"}
    </button>
  );
}
