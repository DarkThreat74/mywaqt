"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { getHashedFingerprint } from "@/lib/auth/fingerprint";
import { useUISFX } from "@/components/uisfx-provider";

type Mode = "login" | "forgot" | "forgot-done";

export default function LoginForm() {
  const { play } = useUISFX();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);


  // Device fingerprint — sent with login so the server can label this
  // device in the trusted-devices list (never an auth factor).
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Time-trap timestamp — set on mount so bots that submit instantly are caught.
  // -1 = not mounted yet (treated as valid to avoid false positives).
  const renderedAtRef = useRef<number>(-1);
  useEffect(() => { renderedAtRef.current = Date.now(); }, []);

  // ── Generate fingerprint on mount (non-blocking) ──
  useEffect(() => {
    getHashedFingerprint()
      .then(setFingerprintHash)
      .catch(() => {});
  }, []);

  // ── Check if this device is trusted for the entered email ──
  // ── Trusted-device passwordless login intentionally removed — the
  //    server requires a password on every login, so that UI only ever
  //    produced a guaranteed first-attempt 401. ──
  // ── Login submit (password mode) ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    // AbortController timeout — prevents the button from getting stuck if server is slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          fingerprintHash: fingerprintHash || undefined,
          renderedAt: renderedAtRef.current,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: { error?: string; ok?: boolean; trustedDevice?: boolean } = {};
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { /* empty body */ }
      }

      if (!res.ok) {
        setError(data.error || "Invalid email or password.");
        play("error");
        return;
      }

      play("success");
      // HARD NAVIGATION — full page load guarantees the browser sends
      // the new session cookie and avoids client-side routing issues.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/calendar/day";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. Check your connection and try again.");
      } else {
        setError("Network error. Check your connection and try again.");
      }
      play("error");
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  // ── Forgot password: request a reset link ──
  // The response is generic by design — it never reveals whether the email
  // belongs to an account (enumeration oracle).
  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email, renderedAt: renderedAtRef.current }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      // Always show the "email sent" screen — we never say whether the
      // account exists.
      setMode("forgot-done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. Check your connection and try again.");
      } else {
        setError("Network error. Check your connection and try again.");
      }
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  // ── Render ──
  if (mode === "forgot-done") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Check your email
        </h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          If an account exists for that email, a reset link is on its way.
          The link expires in 30 minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className="rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
          }}
        >
          Back to login
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={handleRequestReset} className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Forgot password
        </h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{
              borderColor: "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink)",
            }}
          />
        </div>

        {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
          }}
        >
          {pending ? "Sending..." : "Send reset link"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className="text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Back to login
        </button>
      </form>
    );
  }

  // ── Default: login form — always email + password. The trusted-device
  // passwordless branch was removed: the server requires a password on
  // every login, so that UI only ever produced a guaranteed first-attempt
  // 401 ("wrong password, then it works"). ──
  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
        Welcome back
      </h1>
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Log in to continue your prayer tracking.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{
              borderColor: "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink)",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-ink)",
          color: "var(--color-paper)",
        }}
      >
        {pending ? "Logging in..." : "Log in"}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("forgot");
            setError(null);
          }}
          className="font-medium underline underline-offset-4"
          style={{ color: "var(--color-accent)" }}
        >
          Forgot password?
        </button>
        <p style={{ color: "var(--color-ink-muted)" }}>
          No account?{" "}
          <Link href="/signup" className="font-medium underline underline-offset-4" style={{ color: "var(--color-accent)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}
