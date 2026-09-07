"use client";

import { LogOut } from "lucide-react";

/**
 * Logout button — client component (uses navigator.serviceWorker, fetch, window).
 * Must live in its own file with "use client" at the top; a "use client"
 * directive inside a function body of a Server Component file is invalid and
 * causes React error #441 ("Event handlers cannot be passed to Client Component props").
 */
export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      // Unsubscribe push before logout
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch { /* non-critical */ }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* non-critical */ }
    // Full page reload on logout clears all client state — intentional
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };
  return (
    <button
      onClick={handleLogout}
      className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
      style={{ color: "var(--color-ink-soft)" }}
    >
      <LogOut className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
      Log out
    </button>
  );
}
