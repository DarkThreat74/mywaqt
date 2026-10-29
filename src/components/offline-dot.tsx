"use client";

import { useEffect, useRef, useState } from "react";

const FLAG = "waqt:forced-offline";

function postForced(on: boolean) {
  const msg = { type: "FORCE_OFFLINE", on };
  navigator.serviceWorker?.controller?.postMessage(msg);
  navigator.serviceWorker?.ready?.then((r) => r.active?.postMessage(msg)).catch(() => {});
}

/**
 * Connectivity dot next to the logo: green when online, orange "Offline" when
 * offline — real or user-forced. Triple-click toggles a popup to switch
 * offline mode; it resets when the app closes (sessionStorage only).
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
    <span className="relative ml-1.5 inline-flex items-center">
      <button
        type="button"
        onClick={onTap}
        className="inline-flex items-center gap-1.5 align-middle"
        aria-label={isOff ? "Offline" : "Online"}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: isOff ? "#f97316" : "#22c55e" }}
        />
        {isOff && (
          <span className="text-[11px] font-medium" style={{ color: "#f97316" }}>
            Offline
          </span>
        )}
      </button>
      {pop && (
        <>
          <span className="fixed inset-0 z-[90]" onClick={() => setPop(false)} aria-hidden="true" />
          <span
            role="dialog"
            className="absolute left-0 top-6 z-[91] w-56 rounded-xl border p-3 text-left shadow-xl"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
          >
            {forced ? (
              <>
                <span className="block text-xs font-medium" style={{ color: "var(--color-ink)" }}>
                  Go back online?
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  Queued writes will sync.
                </span>
                <button
                  type="button"
                  onClick={() => toggle(false)}
                  className="mt-2 w-full rounded-lg py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: "var(--color-accent, #16a34a)" }}
                >
                  Go online
                </button>
              </>
            ) : offline ? (
              <span className="block text-xs" style={{ color: "var(--color-ink)" }}>
                You&apos;re offline — the app is running from cache.
              </span>
            ) : (
              <>
                <span className="block text-xs font-medium" style={{ color: "var(--color-ink)" }}>
                  Switch to offline mode?
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  No network use; writes queue until you switch back or close the app.
                </span>
                <button
                  type="button"
                  onClick={() => toggle(true)}
                  className="mt-2 w-full rounded-lg py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: "#f97316" }}
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
