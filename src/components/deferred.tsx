"use client";

import { useEffect, useState } from "react";

/**
 * Mounts children when the main thread is idle (requestIdleCallback, 1.5s
 * cap; setTimeout fallback for Safari). Use for global chrome that renders
 * null until triggered — popups, toasts, trays — so their hydration cost
 * doesn't sit in the user's first-tap window.
 */
export default function Deferred({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 800);
    return () => clearTimeout(id);
  }, []);
  return ready ? <>{children}</> : null;
}
