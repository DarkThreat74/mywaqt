"use client";

import { useEffect } from "react";

/**
 * Pulls server-stored UI prefs once per app load and stamps them into
 * localStorage — the boot script + popup read localStorage, so the DB is
 * the roaming source of truth and storage is just the device cache.
 * Server value wins; absent keys keep whatever the device already has.
 */
export default function PrefsSync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prefs?: { theme?: string; funfactDisabled?: boolean } } | null) => {
        if (cancelled || !data?.prefs) return;
        const { theme, funfactDisabled } = data.prefs;
        try {
          if (theme === "light" || theme === "dark" || theme === "system") {
            localStorage.setItem("waqt:theme", theme);
            const dark =
              theme === "dark" ||
              (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
          }
          if (typeof funfactDisabled === "boolean") {
            if (funfactDisabled) localStorage.setItem("waqt:funfact:disabled", "1");
            else localStorage.removeItem("waqt:funfact:disabled");
            window.dispatchEvent(new Event("waqt:funfact:toggle")); // hides a card already on screen
          }
        } catch { /* storage blocked — prefs still saved server-side */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return null;
}
