"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

function ResetForm() {
  const { play } = useUISFX();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const renderedAtRef = useRef<number>(-1);
  useEffect(() => { renderedAtRef.current = Date.now(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must be at least 8 characters with a letter and a number.");
      setPending(false);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          token,
          password,
          confirm,
          renderedAt: renderedAtRef.current,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        play("error");
        return;
      }

      play("success");
      setDone(true);
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

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Password updated
        </h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Your password has been changed and all other sessions and trusted
          devices have been signed out. You can now log in with your new password.
        </p>
        <Link
          href="/login"
          className="rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          Back to login
        </Link>
      </div>
    );
  }

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Invalid reset link
        </h1>
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          This reset link is missing or malformed. Request a new one from the
          login page.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
        Set a new password
      </h1>
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Choose a new password for your account.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={8}
          className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink)",
          }}
        />
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          At least 8 characters, with one letter and one number.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
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
        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
      >
        {pending ? "Updating..." : "Update password"}
      </button>

      <Link
        href="/login"
        className="text-center text-sm font-medium underline underline-offset-4"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Back to login
      </Link>
    </form>
  );
}

export default function ResetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
