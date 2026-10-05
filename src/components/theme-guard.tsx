"use client";

import { useEffect } from "react";

/**
 * Re-applies the stored theme on every visibility restore / bfcache
 * pageshow. The inline script in layout.tsx only runs on first paint —
 * iOS tab suspension, bfcache restores, or any attribute reset can drop
 * data-theme and leave the OS media query (dark) in charge.
 */
export default function ThemeGuard() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let t: string | null = null;
      try { t = localStorage.getItem("waqt:theme"); } catch { /* private mode */ }
      const dark = t === "dark" || (t !== "light" && mq.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    window.addEventListener("pageshow", apply);
    mq.addEventListener("change", apply); // system mode follows the OS live
    return () => {
      document.removeEventListener("visibilitychange", apply);
      window.removeEventListener("pageshow", apply);
      mq.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
