"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  isNativeApp,
  checkBiometricAvailability,
  biometricVerify,
  onAppStateChange,
  hapticNotification,
} from "@/lib/native-bridge";

/**
 * Opt-in biometric app lock (Settings → Trusted devices → App lock).
 *
 * Hard rules learned the hard way:
 * - OFF unless the user explicitly enables it. The flag lives in
 *   localStorage ("waqt:app-lock") — absent = pass-through, always.
 * - NEVER auto-fire BiometricPrompt. The system dialog invoked while the
 *   host activity is still resuming can crash the app natively — the
 *   prompt only fires from the "Unlock" button tap, when the activity is
 *   guaranteed interactive.
 * - Re-locks only after a real >30s background stint — the prompt's own
 *   background/foreground bounce must not re-trigger it.
 * - "Turn off app lock" is always reachable on the lock screen — if the
 *   prompt breaks on a device, that's the exit, not a boot loop.
 * - Web / no biometrics enrolled / storage blocked: pass-through.
 */

export const APP_LOCK_KEY = "waqt:app-lock";
const RELOCK_AFTER_MS = 30_000;

export function isAppLockEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(APP_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(true);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const verifiedRef = useRef(verified);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    verifiedRef.current = verified;
  }, [verified]);

  const unlock = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    setLoading(true);
    // A prompt that dies with its activity can leave the plugin promise
    // pending forever — 30s of silence = treat as cancelled, buttons return.
    const result = await Promise.race([
      biometricVerify("Unlock Waqt"),
      new Promise<{ verified: boolean; reason: string }>((r) =>
        setTimeout(() => r({ verified: false, reason: "Timed out" }), 30_000)),
    ]);
    if (result.verified) {
      setVerified(true);
      verifiedRef.current = true;
      void hapticNotification("success");
    }
    setLoading(false);
  }, []);

  const lock = useCallback(() => {
    setVerified(false);
    verifiedRef.current = false;
  }, []);

  useEffect(() => {
    if (!isNativeApp() || !isAppLockEnabled()) return;
    let mounted = true;

    const timer = setTimeout(() => {
      if (!mounted) return;
      checkBiometricAvailability().then((result) => {
        if (!mounted) return;
        setAvailable(result.available);
        setEnabled(true);
        if (result.available) lock();
      });
    }, 600); // let splash + first paint settle before showing the gate

    let unsub: (() => void) | undefined;
    onAppStateChange((isActive) => {
      if (!isActive) {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const away = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
      backgroundedAtRef.current = null;
      if (verifiedRef.current && enabled && away > RELOCK_AFTER_MS) lock();
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      void unsub?.();
    };
  }, [lock, enabled]);

  if (verified) return <>{children}</>;

  function turnOff() {
    try { localStorage.removeItem(APP_LOCK_KEY); } catch { /* ignore */ }
    setVerified(true);
    verifiedRef.current = true;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "#1a1815" }}
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 15%, transparent)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--color-accent)" }}
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--color-paper)" }}>
            {loading ? "Authenticating…" : "Waqt is locked"}
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {loading ? "Waiting for biometric authentication" : "Tap below to unlock with your fingerprint or face"}
          </p>
        </div>

        {!loading && available && (
          <button
            onClick={() => void unlock()}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Unlock Waqt
          </button>
        )}

        {!loading && !available && (
          <button
            onClick={() => setVerified(true)}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Continue
          </button>
        )}

        {/* Always reachable — the documented exit, never behind !loading. */}
        <button
          onClick={turnOff}
          className="text-xs underline underline-offset-4"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Turn off app lock
        </button>
      </div>
    </div>
  );
}
