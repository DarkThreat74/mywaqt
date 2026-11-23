"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Route-change focus management. The App Router swaps page content without
 * moving keyboard/AT focus — after a client navigation, focus stays on the
 * (now-unmounted or stale) link. Focusing #main-content on each pathname
 * change puts screen readers and Tab order at the top of the new page, the
 * standard SPA pattern. The first mount is skipped — that's a fresh load
 * where the browser already manages focus.
 */
export default function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
