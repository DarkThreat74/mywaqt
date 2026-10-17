"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { subscribeQt, qtState, stopQt, type QtListen } from "./session";

/**
 * Global recitation pill — visible on every app page while a Quran Tester
 * session is live. Green pulse while listening, amber flash on a suspected
 * mistake, red flash + soft ding on a confirmed-looking correction.
 * Hidden on /quran-tester itself (the in-page bar already covers it).
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
  const pathname = usePathname();
  const [listen, setListen] = useState<QtListen>(() => qtState());
  const [flash, setFlash] = useState<"none" | "suspect" | "error">("none");
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const unsub = subscribeQt((ev) => {
      if (ev.type === "ui-listen") setListen(ev.state as QtListen);
      if (ev.type === "correction" || ev.type === "correction_note") {
        setFlash("suspect");
        ding(520);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlash("none"), 2400);
      }
      if (ev.type === "ui-error") {
        setFlash("error");
        ding(240);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlash("none"), 2400);
      }
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (pathname.startsWith("/quran-tester") || listen === "idle") return null;

  const border = flash === "error" ? "#b34a3a" : flash === "suspect" ? "#c9a227" : "var(--color-accent)";
  return (
    <div
      className="fixed z-50 transition-colors duration-200"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom) + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5 shadow-lg"
        style={{
          borderColor: border,
          backgroundColor: "var(--color-paper)",
          animation: "drawer-app-in 0.18s ease-out",
        }}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: border }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: border }} />
        </span>
        <Link href="/quran-tester" className="text-xs font-bold" style={{ color: "var(--color-ink)" }}>
          {flash === "suspect" ? "Possible mistake — tap to review" : flash === "error" ? "Engine error" : "Listening — Quran Tester"}
        </Link>
        <button
          onClick={() => void stopQt()}
          className="flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)" }}
          aria-label="Stop reciting"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
