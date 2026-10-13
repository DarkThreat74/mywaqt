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
 * Wraps authenticated app content with a biometric gate.
 *
 * Rules that keep this from bricking the app:
 * - Only locks on app relaunch or a >30s background stint — NOT every
 *   foreground bounce. The system BiometricPrompt itself backgrounds the
 *   app on Android, so re-locking on every appStateChange loops forever.
 * - Auto-prompts ONCE per lock. If the prompt throws or the user cancels,
 *   it waits for a manual tap — it never retries on its own.
 * - "Skip on this device" opts out permanently — if the prompt crashes on
 *   a given device, that path is the escape hatch, not a boot loop.
 * - Web: pass-through, always.
 */

const SKIP_KEY = "waqt:biometric-skip";
const RELOCK_AFTER_MS = 30_000;

export default function BiometricGate({ children }: { children: React.ReactNode }) {
  // SSR renders isNativeApp()=false (no window) while the native client gets
  // true — initializing state from it would hydration-mismatch and flash app
  // content on the shell. Start verified and let the mount effect drop the
  // gate in; on native the app shows for one frame before locking.
  const [verified, setVerified] = useState(true);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const verifiedRef = useRef(verified);
  const backgroundedAtRef = useRef<number | null>(null);
  // One auto-prompt per lock — a thrown/cancelled prompt never re-fires itself.
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    verifiedRef.current = verified;
  }, [verified]);

  const verify = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    setLoading(true);
    const result = await biometricVerify("Authenticate to access Waqt");
    if (result.verified) {
      setVerified(true);
      verifiedRef.current = true;
      void hapticNotification("success");
    }
    setLoading(false);
  }, []);

  const lockAndPromptOnce = useCallback(() => {
    setVerified(false);
    verifiedRef.current = false;
    if (!autoPromptedRef.current) {
      autoPromptedRef.current = true;
      void verify();
    }
  }, [verify]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let mounted = true;

    const timer = setTimeout(() => {
      if (!mounted) return;
      try {
        if (localStorage.getItem(SKIP_KEY) === "1") return;
      } catch { /* storage blocked — still gate */ }
      checkBiometricAvailability().then((result) => {
        if (!mounted) return;
        setBiometricAvailable(result.available);
        if (!result.available) {
          // No biometrics enrolled — don't lock the user out
          return;
        }
        lockAndPromptOnce();
      });
    }, 600); // let splash + first paint settle before any system dialog

    let unsub: (() => void) | undefined;
    onAppStateChange((isActive) => {
      if (!isActive) {
        backgroundedAtRef.current = Date.now();
        return;
      }
      // Only re-lock after a real background stint — the biometric prompt's
      // own background/foreground pair is ~1s and must not re-trigger.
      const away = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
      backgroundedAtRef.current = null;
      if (verifiedRef.current && away > RELOCK_AFTER_MS) {
        autoPromptedRef.current = false;
        lockAndPromptOnce();
      }
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      void unsub?.();
    };
  }, [verify, lockAndPromptOnce]);

  // Web: pass through immediately
  if (verified) return <>{children}</>;

  function skipOnThisDevice() {
    try { localStorage.setItem(SKIP_KEY, "1"); } catch { /* ignore */ }
    setVerified(true);
    verifiedRef.current = true;
  }

  // Native: show biometric prompt overlay
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "#1a1815" }}
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        {/* Lock icon */}
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
            {loading ? "Authenticating…" : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {loading
              ? "Waiting for biometric authentication"
              : "Tap below to unlock with your fingerprint or face"}
          </p>
        </div>

        {!loading && biometricAvailable && (
          <button
            onClick={() => void verify()}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-paper)",
            }}
          >
            Unlock Waqt
          </button>
        )}

        {!loading && !biometricAvailable && (
          <button
            onClick={() => setVerified(true)}
            className="rounded-xl px-6 py-3 text-sm font-medium"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-paper)",
            }}
          >
            Continue
          </button>
        )}

        {!loading && (
          <button
            onClick={skipOnThisDevice}
            className="text-xs underline underline-offset-4"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Don&apos;t ask on this device
          </button>
        )}
      </div>
    </div>
  );
}
