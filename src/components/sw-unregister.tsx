"use client";

import { useEffect } from "react";

/**
 * Unregisters any existing service worker on public pages.
 * The SW controls all pages with scope "/", so even though we don't
 * register it on public pages, a previously registered SW still intercepts
 * requests until it's unregistered.
 *
 * This component runs cleanup in the BACKGROUND — it does NOT block page
 * rendering. The SW itself already skips public pages (see sw.js), so
 * even if the old SW is still registered for a moment, it won't interfere
 * with navigation. This component just ensures the SW gets cleaned up.
 *
 * This component is used on: landing page, login, signup, admin login.
 */
export default function UnregisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function cleanup() {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (cancelled || registrations.length === 0) return;

        // ── Check for unsynced offline writes BEFORE wiping anything ──
        // If the user was redirected to /login by a session expiry (not an
        // explicit logout), the outbox may still hold queued writes. Deleting
        // it would permanently destroy that data.
        let hasPendingOutbox = false;
        try {
          hasPendingOutbox = await new Promise<boolean>((resolve) => {
            const req = indexedDB.open("waqt-offline");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("event-outbox")) {
                db.close();
                resolve(false);
                return;
              }
              const countReq = db.transaction("event-outbox", "readonly").objectStore("event-outbox").count();
              countReq.onsuccess = () => {
                db.close();
                resolve(countReq.result > 0);
              };
              countReq.onerror = () => { db.close(); resolve(false); };
            };
            req.onerror = () => resolve(false);
          });
        } catch {
          // Can't read — assume empty, proceed with cleanup
        }

        // Do NOT unregister the SW or wipe the static app-shell cache here.
        // The SW already passes public pages through untouched (see sw.js),
        // and unregistering it would kill offline PWA launch — e.g. a session
        // expiry that lands on /login used to leave the installed app dead
        // until the next online login. Instead, ask the live SW to clear only
        // the user-scoped caches (API responses + cached app pages), keeping
        // the static app shell + audio so offline boot still works.
        for (const r of registrations) {
          try {
            (r.active || r.waiting || r.installing)?.postMessage({ type: "CLEAR_USER_CACHE" });
          } catch {
            // SW may be gone — ignore
          }
        }
        // Fallback if no SW is active yet: delete user-scoped caches directly.
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((n) => /^waqt-v\d+-(api|pages|runtime)$/.test(n))
              .map((n) => caches.delete(n))
          );
        }

        // Clear IndexedDB databases (offline data + outbox)
        // This prevents cross-user data leakage on shared devices.
        // EXCEPT: when the outbox still holds unsynced writes, keep
        // "waqt-offline" so they can replay after the user re-authenticates.
        const dbsToDelete = hasPendingOutbox
          ? ["waqt-offline-data"] // keep the outbox DB
          : ["waqt-offline-data", "waqt-offline"];
        for (const dbName of dbsToDelete) {
          await new Promise<void>((resolve) => {
            try {
              const req = indexedDB.deleteDatabase(dbName);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            } catch {
              resolve();
            }
          });
        }

        // Clear waqt-* localStorage keys — but preserve theme preference and
        // the push-endpoint dedup key (both are user-agnostic and losing them
        // causes a theme flash + a redundant subscribe POST on next login).
        const PRESERVE_KEYS = new Set(["waqt:theme", "waqt:push-endpoint"]);
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith("waqt") && !PRESERVE_KEYS.has(key)) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // non-critical
        }
      } catch {
        // Ignore — SW cleanup is best-effort
      }
    }

    cleanup();

    return () => { cancelled = true; };
  }, []);

  return null;
}
