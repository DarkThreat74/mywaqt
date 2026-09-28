"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { CaptchaWidget, type CaptchaHandle } from "@/components/captcha-widget";
import { getHashedFingerprint } from "@/lib/auth/fingerprint";

type Step = "email" | "captcha" | "password" | "done";

export default function SignupForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const turnstileRef = useRef<CaptchaHandle>(null);

  // ── Honeypot fields — hidden from humans, bots fill these ──
  const [honeypotWebsite, setHoneypotWebsite] = useState("");
  const [honeypotCompany, setHoneypotCompany] = useState("");

  // ── Time-trap — record when the form rendered ──
  // Use -1 as sentinel (not 0, which triggers the server's time-trap bot check).
  // The useEffect sets the real timestamp after mount.
  const renderedAtRef = useRef<number>(-1);
  useEffect(() => { renderedAtRef.current = Date.now(); }, []);

  // ── Generate fingerprint on mount (non-blocking) ──
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null);
  useEffect(() => {
    getHashedFingerprint().then(setFingerprintHash).catch(() => {});
  }, []);

  // ── Step 1: email ──
  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Honeypot check — if filled, silently pretend success (bot trap)
    if (honeypotWebsite || honeypotCompany) {
      setStep("password");
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }

    setStep("captcha");
  }

  // ── Step 2: captcha verified → move to password ──
  function handleCaptchaVerify(token: string) {
    setCaptchaToken(token);
    setTimeout(() => setStep("password"), 600);
  }

  // ── Step 3: password + confirm → submit to server action ──
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError("Password must contain at least one letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);

    // ── Fetch with timeout — prevents the button from getting stuck ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          turnstileToken: captchaToken || undefined,
          fingerprintHash: fingerprintHash || undefined,
          // Honeypots — server checks these too
          website: honeypotWebsite,
          company: honeypotCompany,
          // Time-trap
          renderedAt: renderedAtRef.current,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Safely parse JSON — response might be empty if the server crashes
      let data: { message?: string; error?: string; ok?: boolean } = {};
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          setError(`Server returned an unexpected response (status ${res.status}).`);
          return;
        }
      }

      if (!res.ok) {
        const errorMsg = data.message || data.error || `Request failed with status ${res.status}.`;
        setError(errorMsg);
        // If Turnstile verification failed (403), reset widget and go back to captcha step
        if (res.status === 403) {
          setCaptchaToken(null);
          turnstileRef.current?.reset();
          setStep("captcha");
        }
        return;
      }

      // Verify-email-first — the account is created via the emailed link.
      setStep("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. Check your connection and try again.");
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`Connection failed: ${msg}. Check your connection and try again.`);
      }
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        <StepDot active={step === "email"} done={step !== "email"} label="Email" />
        <StepLine done={step !== "email"} />
        <StepDot active={step === "captcha"} done={step === "password" || step === "done"} label="Verify" />
        <StepLine done={step === "password" || step === "done"} />
        <StepDot active={step === "password"} done={step === "done"} label="Password" />
      </div>

      {/* ── Done: check-your-email confirmation ── */}
      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <Check className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Check your email
          </h1>
          <p className="max-w-xs text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            We sent a confirmation link to <strong style={{ color: "var(--color-ink)" }}>{email}</strong>.
            Click it to finish creating your account — it expires in 24 hours.
          </p>
          <Link href="/login" className="mt-2 text-sm font-medium" style={{ color: "var(--color-accent)" }}>
            Back to sign in
          </Link>
        </div>
      )}

      {/* ── Step 1: Email ── */}
      {step === "email" && (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Create your account
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Start with your email. You&apos;ll verify you&apos;re human, then set a password.
          </p>

          {/* Honeypot fields — invisible to humans */}
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="website">Website (leave empty)</label>
            <input
              id="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypotWebsite}
              onChange={(e) => setHoneypotWebsite(e.target.value)}
            />
            <label htmlFor="company">Company (leave empty)</label>
            <input
              id="company"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypotCompany}
              onChange={(e) => setHoneypotCompany(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            className="rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--color-ink)",
              color: "var(--color-paper)",
            }}
          >
            Continue
          </button>

          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium underline underline-offset-4" style={{ color: "var(--color-accent)" }}>
              Log in
            </Link>
          </p>
        </form>
      )}

      {/* ── Step 2: Captcha (Cloudflare Turnstile) ── */}
      {step === "captcha" && (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Verify you&apos;re human
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Quick security check to keep bots out. This usually happens automatically.
          </p>

          <div className="flex justify-center">
            <CaptchaWidget
              ref={turnstileRef}
              onVerify={handleCaptchaVerify}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
              onTimeout={() => {
                setCaptchaToken(null);
                setError("Security check timed out. Please try again.");
                turnstileRef.current?.reset();
              }}
              action="signup"
            />
          </div>

          {captchaToken && (
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-success)" }}>
              <Check className="h-4 w-4" />
              Verified — continuing...
            </p>
          )}

          <button
            onClick={() => {
              setCaptchaToken(null);
              turnstileRef.current?.reset();
              setStep("email");
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to email
          </button>
        </div>
      )}

      {/* ── Step 3: Password + Confirm ── */}
      {step === "password" && (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Set your password
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            For <span className="font-medium" style={{ color: "var(--color-ink-soft)" }}>{email}</span>
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {pending ? "Creating account..." : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setCaptchaToken(null);
              turnstileRef.current?.reset();
              setStep("captcha");
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </form>
      )}
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium"
        style={{
          backgroundColor: done ? "var(--color-accent)" : active ? "var(--color-ink)" : "var(--color-paper-3)",
          color: done || active ? "var(--color-paper)" : "var(--color-ink-muted)",
        }}
      >
        {done ? <Check className="h-3 w-3" /> : ""}
      </div>
      <span style={{ color: active ? "var(--color-ink)" : "var(--color-ink-muted)" }}>{label}</span>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div
      className="h-px flex-1"
      style={{
        backgroundColor: done ? "var(--color-accent)" : "var(--color-paper-3)",
        maxWidth: 32,
      }}
    />
  );
}
