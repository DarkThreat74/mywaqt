"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Persistent sync-status pill — shows pending offline writes, sync progress,
 * and failures. Mounted once in the app layout so it survives navigation.
 * State comes from the service worker's outbox (OUTBOX_COUNT broadcasts +
 * GET_OUTBOX_COUNT polls), never from optimistic local state.
 */
export default function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const requestCount = () => {
      navigator.serviceWorker.ready
        .then((r) => r.active?.postMessage({ type: "GET_OUTBOX_COUNT" }))
        .catch(() => {});
    };
    const requestSync = () => {
      navigator.serviceWorker.ready
        .then((r) => r.active?.postMessage({ type: "SYNC_OUTBOX" }))
        .catch(() => {});
    };

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "OUTBOX_COUNT") {
        setPending(typeof d.count === "number" ? d.count : 0);
      } else if (d.type === "EVENT_QUEUED_OFFLINE") {
        setPending((p) => p + 1);
      } else if (d.type === "EVENT_SYNCED") {
        setFailed(0);
        setSyncing(false);
      } else if (d.type === "EVENT_SYNC_FAILED") {
        setFailed((f) => f + 1);
        setSyncing(false);
      }
    };

    const onOnline = () => {
      setOnline(true);
      setSyncing(true);
      requestSync();
      // Sync may take a moment — poll the real count after
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        requestCount();
        setSyncing(false);
      }, 3000);
    };
    const onOffline = () => setOnline(false);
    const onShow = () => requestCount();

    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onShow);
    requestCount();

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onShow);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  if (pending === 0 && failed === 0) return null;

  const retry = () => {
    setSyncing(true);
    navigator.serviceWorker.ready
      .then((r) => {
        r.active?.postMessage({ type: "SYNC_OUTBOX" });
        r.active?.postMessage({ type: "GET_OUTBOX_COUNT" });
      })
      .catch(() => setSyncing(false));
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setSyncing(false);
      navigator.serviceWorker.ready
        .then((r) => r.active?.postMessage({ type: "GET_OUTBOX_COUNT" }))
        .catch(() => {});
    }, 3000);
  };

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 z-50 -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
      role="status"
      aria-live="polite"
    >
      <button
        onClick={retry}
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition-opacity hover:opacity-90"
        style={{
          borderColor: failed > 0 ? "var(--color-error)" : "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
          color: failed > 0 ? "var(--color-error)" : "var(--color-ink-soft)",
        }}
      >
        {failed > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : online ? (
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        ) : (
          <CloudOff className="h-3.5 w-3.5" />
        )}
        <span>
          {failed > 0
            ? `${failed} change${failed === 1 ? "" : "s"} failed — tap to retry`
            : online
              ? syncing
                ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…`
                : `${pending} change${pending === 1 ? "" : "s"} waiting to sync`
              : `${pending} change${pending === 1 ? "" : "s"} saved offline`}
        </span>
      </button>
    </div>
  );
}
