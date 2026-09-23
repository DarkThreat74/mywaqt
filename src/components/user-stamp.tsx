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
        // Fallback if no SW controls the page yet — clear the store directly.
        const req = indexedDB.open("waqt-offline");
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains("event-outbox")) {
            db.transaction("event-outbox", "readwrite").objectStore("event-outbox").clear();
          }
          db.close();
        };
      }
      localStorage.setItem("waqt:uid", userId);
    } catch { /* non-critical */ }
  }, [userId]);
  return null;
}
