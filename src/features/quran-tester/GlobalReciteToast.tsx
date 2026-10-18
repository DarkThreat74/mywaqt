"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscribeQt } from "./session";

/**
 * Engine error alerts for the Quran Tester, visible app-wide. The live
 * "reciting" state itself is a FloatingDock segment so it merges with the
 * study/soundscape/talks pills instead of floating on its own.
 */

let dingCtx: AudioContext | null = null;
function ding(freq = 660) {
  try {
    dingCtx ??= new AudioContext();
    const t = dingCtx.currentTime;
    const o = dingCtx.createOscillator();
    const g = dingCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(dingCtx.destination);
    o.start(t);
    o.stop(t + 0.4);
  } catch {}
}

export default function GlobalReciteToast() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeQt((ev) => {
      if (ev.type === "ui-listen" && ev.state !== "idle") setError(null); // fresh take — clear stale error
      if (ev.type === "ui-error") {
        setError(String(ev.message ?? "Engine error"));
        ding(240);
      }
    });
    return unsub;
  }, []);

  if (!error) return null;
  return (
    <div
      className="fixed z-50"
      role="alert"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom) + 10px)",
        left: 12,
        right: 12,
      }}
    >
      <div
        className="flex items-start gap-2 rounded-2xl border px-3 py-2.5 shadow-lg"
        style={{ borderColor: "#b34a3a", backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.18s ease-out" }}
      >
        <p className="flex-1 break-words text-xs font-semibold leading-snug" style={{ color: "#b34a3a" }}>
          {error}
        </p>
        <button
          onClick={() => setError(null)}
          className="flex items-center justify-center rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
          aria-label="Dismiss error"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
