"use client";

import { useEffect } from "react";

/**
 * Stamps the device with the logged-in user id. The offline outbox survives
 * logout intentionally (session-expiry case) — but if a DIFFERENT account
 * signs in on this device, replaying the previous user's queued writes would
 * put their data in the wrong account. On mismatch: clear the outbox.
 */
export default function UserStamp({ userId }: { userId: string }) {
  useEffect(() => {
    try {
      const prev = localStorage.getItem("waqt:uid");
      if (prev && prev !== userId) {
        navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_OUTBOX" });
        // Also drop cached pages + API responses — they were rendered for the
        // previous account and must never hydrate under this session.
        navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_USER_CACHE" });
        // Fallback if no SW controls the page yet — clear the store directly.
        const req = indexedDB.open("waqt-offline");
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains("event-outbox")) {
            db.transaction("event-outbox", "readwrite").objectStore("event-outbox").clear();
          }
          db.close();
        };
        // The Dexie DB ("waqt-offline-data": events, prayer logs, homework,
        // analytics…) also belongs to the previous account — same leak as
        // the SW caches. CLEAR_USER_CACHE doesn't reach it.
        import("@/lib/offline/db")
          .then((m) => m.clearOfflineCache())
          .catch(() => {});
      }
      localStorage.setItem("waqt:uid", userId);
    } catch { /* non-critical */ }

    // Tell the SW which account owns this session — cookies are forbidden
    // headers inside service workers, so the page-stamp match + API cache
    // gate depend on this postMessage instead.
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "SET_SESSION", uid: userId });
      navigator.serviceWorker?.ready?.then((reg) =>
        reg.active?.postMessage({ type: "SET_SESSION", uid: userId })
      ).catch(() => {});
      // Lite-Mode / metered connections: tell the SW to stop background
      // revalidation and serve cached copies as-is.
      const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      const saver = conn?.saveData === true || conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g";
      // Only latch ON — a "false" would clobber saver mode the SW detected
      // via the Save-Data request header on browsers without connection hints.
      if (saver) {
        navigator.serviceWorker?.controller?.postMessage({ type: "SET_DATA_SAVER", on: true });
        navigator.serviceWorker?.ready?.then((reg) =>
          reg.active?.postMessage({ type: "SET_DATA_SAVER", on: true })
        ).catch(() => {});
      }
    } catch { /* non-critical */ }
  }, [userId]);
  return null;
}
