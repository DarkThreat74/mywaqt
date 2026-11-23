"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
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
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const turnstileRef = useRef<CaptchaHandle>(null);

  // Field-level errors (aria-linked), show/hide + caps-lock hints, offline gate.
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [online, setOnline] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

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

  function validatePassword(v: string): string | null {
    if (v.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(v)) return "Password must contain at least one letter.";
    if (!/[0-9]/.test(v)) return "Password must contain at least one number.";
    return null;
  }

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

    const eErr = !email.trim()
      ? "Email is required."
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Enter a valid email address."
        : null;
    setEmailErr(eErr);
    if (eErr) {
      emailRef.current?.focus();
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

    const pErr = validatePassword(password);
    const cErr = !pErr && password !== confirmPassword ? "Passwords do not match." : null;
    setPasswordErr(pErr);
    setConfirmErr(cErr);
    if (pErr || cErr) {
      (pErr ? passwordRef : confirmRef).current?.focus();
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

      // The server message covers both modes: verify-email-first (check your
      // inbox) or instant-create (sign in to continue).
      setDoneMessage(data.message || null);
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
            Almost done
          </h1>
          <p className="max-w-xs text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            {doneMessage || <>We sent a confirmation link to <strong style={{ color: "var(--color-ink)" }}>{email}</strong>. Click it to finish creating your account — it expires in 24 hours.</>}
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
              ref={emailRef}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }}
              onBlur={(e) => setEmailErr(e.target.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim()) ? "Enter a valid email address." : null)}
              aria-invalid={!!emailErr}
              aria-describedby={emailErr ? "email-error" : undefined}
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

          {error && <p role="alert" className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}

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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                autoFocus
                ref={passwordRef}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (passwordErr) setPasswordErr(null); }}
                onBlur={(e) => setPasswordErr(e.target.value ? validatePassword(e.target.value) : null)}
                onKeyDown={checkCapsLock}
                onKeyUp={checkCapsLock}
                aria-invalid={!!passwordErr}
                aria-describedby={["password-hint", passwordErr ? "password-error" : "", capsLock ? "password-capslock" : ""].filter(Boolean).join(" ")}
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
            <p id="password-hint" className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              At least 8 characters, with one letter and one number.
            </p>
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              ref={confirmRef}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); if (confirmErr) setConfirmErr(null); }}
              onBlur={(e) => setConfirmErr(e.target.value && e.target.value !== password ? "Passwords do not match." : null)}
              aria-invalid={!!confirmErr}
              aria-describedby={confirmErr ? "confirm-error" : undefined}
              className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                borderColor: confirmErr ? "var(--color-error)" : "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink)",
              }}
            />
            {confirmErr && (
              <p id="confirm-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
                {confirmErr}
              </p>
            )}
          </div>

          {!online && (
            <p role="status" className="text-sm" style={{ color: "var(--color-warmth)" }}>
              You appear to be offline — reconnect to create your account.
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
