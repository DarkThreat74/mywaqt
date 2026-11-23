"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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

  // Field-level errors (aria-linked) + caps-lock hint + offline gate.
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [online, setOnline] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function checkCapsLock(e: React.KeyboardEvent) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  function validateEmailValue(v: string): string | null {
    if (!v.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return "Enter a valid email address.";
    return null;
  }

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

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    // Client-side validation — field errors are aria-linked to inputs.
    const emailVal = String(formData.get("email") || "");
    const passwordVal = String(formData.get("password") || "");
    const eErr = validateEmailValue(emailVal);
    const pErr = !passwordVal ? "Password is required." : null;
    setEmailErr(eErr);
    setPasswordErr(pErr);
    if (eErr || pErr) {
      (eErr ? emailRef : passwordRef).current?.focus();
      return;
    }

    setPending(true);

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

    const fErr = validateEmailValue(email);
    setEmailErr(fErr);
    if (fErr) {
      forgotEmailRef.current?.focus();
      setPending(false);
      return;
    }

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
            ref={forgotEmailRef}
            aria-invalid={!!emailErr}
            aria-describedby={emailErr ? "email-error" : undefined}
            onBlur={(e) => setEmailErr(e.target.value ? validateEmailValue(e.target.value) : null)}
            className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{
              borderColor: emailErr ? "var(--color-error)" : "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink)",
            }}
          />
          {emailErr && (
            <p id="email-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
              {emailErr}
            </p>
          )}
        </div>

        {!online && (
          <p role="status" className="text-sm" style={{ color: "var(--color-warmth)" }}>
            You appear to be offline — reconnect to send the reset link.
          </p>
        )}
        {error && <p role="alert" className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

        <button
          type="submit"
          disabled={pending || !online}
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
          }}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
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
          ref={emailRef}
          aria-invalid={!!emailErr}
          aria-describedby={emailErr ? "email-error" : undefined}
          onChange={() => { if (emailErr) setEmailErr(null); }}
          onBlur={(e) => setEmailErr(e.target.value ? validateEmailValue(e.target.value) : null)}
          className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: emailErr ? "var(--color-error)" : "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
          }}
        />
        {emailErr && (
          <p id="email-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
            {emailErr}
          </p>
        )}
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
            ref={passwordRef}
            aria-invalid={!!passwordErr}
            aria-describedby={[passwordErr ? "password-error" : "", capsLock ? "password-capslock" : ""].filter(Boolean).join(" ") || undefined}
            onChange={() => { if (passwordErr) setPasswordErr(null); }}
            onKeyDown={checkCapsLock}
            onKeyUp={checkCapsLock}
            className="w-full rounded-lg border px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{
              borderColor: passwordErr ? "var(--color-error)" : "var(--color-paper-3)",
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
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {passwordErr && (
          <p id="password-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
            {passwordErr}
          </p>
        )}
        {capsLock && (
          <p id="password-capslock" role="status" className="text-xs" style={{ color: "var(--color-warmth)" }}>
            Caps Lock is on.
          </p>
        )}
      </div>

      {!online && (
        <p role="status" className="text-sm" style={{ color: "var(--color-warmth)" }}>
          You appear to be offline — reconnect to sign in.
        </p>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

      <button
        type="submit"
        disabled={pending || !online}
        className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-ink)",
          color: "var(--color-paper)",
        }}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
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
