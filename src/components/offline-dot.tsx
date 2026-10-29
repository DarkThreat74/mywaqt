"use client";

import { useEffect, useRef, useState } from "react";

const FLAG = "waqt:forced-offline";

function postForced(on: boolean) {
  const msg = { type: "FORCE_OFFLINE", on };
  navigator.serviceWorker?.controller?.postMessage(msg);
  navigator.serviceWorker?.ready?.then((r) => r.active?.postMessage(msg)).catch(() => {});
}

/**
 * Connectivity state beside the logo: a faint muted dot online, an orange
 * "Offline" label when offline (real or forced). Triple-click opens a
 * centered dialog to toggle forced offline — resets when the app closes.
 */
export default function OfflineDot() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [forced, setForced] = useState(() => sessionStorage.getItem(FLAG) === "1");
  const [pop, setPop] = useState(false);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    // Re-post the flag on mount — a restarted SW loses its in-memory copy.
    if (sessionStorage.getItem(FLAG) === "1") postForced(true);
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const onTap = () => {
    taps.current = [...taps.current.filter((t) => Date.now() - t < 800), Date.now()];
    if (taps.current.length >= 3) {
      taps.current = [];
      setPop(true);
    }
  };

  const toggle = (on: boolean) => {
    setForced(on);
    setPop(false);
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
    postForced(on);
  };

  const isOff = offline || forced;
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={onTap}
        className="inline-flex items-center gap-1.5 align-middle"
        aria-label={isOff ? "Offline" : "Online"}
      >
        {isOff ? (
          <>
            {/* Warm amber, not traffic-light orange — a quiet signal, not a badge */}
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-warmth)" }} />
            <span
              className="text-[10px] font-medium tracking-[0.08em] uppercase"
              style={{ color: "var(--color-ink-muted)" }}
            >
              offline
            </span>
          </>
        ) : (
          // Online is a hollow ring — present but silent, nothing to notice.
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ border: "1.5px solid var(--color-ink-muted)", opacity: 0.45 }}
          />
        )}
      </button>
      {pop && (
        <>
          <span className="fixed inset-0 z-[90]" onClick={() => setPop(false)} aria-hidden="true" />
          <span
            role="dialog"
            className="fixed left-1/2 top-24 z-[91] w-64 -translate-x-1/2 rounded-xl border p-4 text-left shadow-xl"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            {forced ? (
              <>
                <span className="block text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  Go back online?
                </span>
                <span className="mt-1 block text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  Queued writes will sync.
                </span>
                <button
                  type="button"
                  onClick={() => toggle(false)}
                  className="mt-3 w-full rounded-lg border py-2 text-xs font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                >
                  Go online
                </button>
              </>
            ) : offline ? (
              <span className="block text-sm" style={{ color: "var(--color-ink)" }}>
                You&apos;re offline — the app is running from cache.
              </span>
            ) : (
              <>
                <span className="block text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                  Switch to offline mode?
                </span>
                <span className="mt-1 block text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  No network use; writes queue until you switch back or close the app.
                </span>
                <button
                  type="button"
                  onClick={() => toggle(true)}
                  className="mt-3 w-full rounded-lg border py-2 text-xs font-semibold transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                >
                  Go offline
                </button>
              </>
            )}
          </span>
        </>
      )}
    </span>
  );
}
