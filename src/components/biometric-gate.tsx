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
 * Wraps authenticated app content with a Face ID / Touch ID gate.
 * On web, this is a pass-through — no biometric prompt is shown.
 * On native, the user must authenticate on launch and when returning
 * from background. If biometrics are unavailable (older device, not
 * enrolled), the gate is skipped so the user is not locked out.
 */
export default function BiometricGate({ children }: { children: React.ReactNode }) {
  // SSR renders isNativeApp()=false (no window) while the native client gets
  // true — initializing state from it would hydration-mismatch and flash app
  // content on the shell. Start verified and let the mount effect drop the
  // gate in; on native the app shows for one frame before locking.
  const [verified, setVerified] = useState(true);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  // Use a ref to track verified state so the appStateChange callback
  // always sees the current value, not a stale closure capture.
  const verifiedRef = useRef(verified);

  useEffect(() => {
    verifiedRef.current = verified;
  }, [verified]);

  const verify = useCallback(async () => {
    setLoading(true);
    const result = await biometricVerify("Authenticate to access Waqt");
    if (result.verified) {
      setVerified(true);
      verifiedRef.current = true;
      void hapticNotification("success");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let mounted = true;

    const timer = setTimeout(() => {
      if (!mounted) return;
      // Engage the gate now that we know we're in the native shell — inside
      // the timer so it isn't a synchronous setState-in-effect.
      setVerified(false);
      verifiedRef.current = false;
      setLoading(true);
      checkBiometricAvailability().then((result) => {
        if (!mounted) return;
        setBiometricAvailable(result.available);
        setLoading(false);
        if (!result.available) {
          // No biometrics enrolled — don't lock the user out
          setVerified(true);
          verifiedRef.current = true;
        } else {
          void verify();
        }
      });
    }, 300); // small delay so splash screen hides first

    let unsub: (() => void) | undefined;
    onAppStateChange((isActive) => {
      // Re-prompt on every return from background if previously verified
      if (isActive && verifiedRef.current) {
        setVerified(false);
        verifiedRef.current = false;
        void verify();
      }
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      void unsub?.();
    };
  }, [verify]);

  // Web: pass through immediately
  if (verified) return <>{children}</>;

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
              : "Tap below to authenticate with Face ID or Touch ID"}
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
            Authenticate
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
      </div>
    </div>
  );
}
