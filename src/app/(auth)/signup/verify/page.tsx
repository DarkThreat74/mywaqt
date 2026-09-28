"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";

// Landing target for the emailed signup-confirmation link. Consumes the
// token, the server creates the account + session, then we drop the user
// into the app (onboarding guard redirects new users as needed).
function VerifyInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = searchParams.get("token");
      if (!token) {
        if (!cancelled) {
          setError("This confirmation link is missing its token.");
          setState("error");
        }
        return;
      }
      try {
        const res = await fetch("/api/auth/signup/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setState("done");
          // Hard nav so the new session cookie is picked up fresh
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          setTimeout(() => { window.location.href = "/calendar/day"; }, 900);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "This confirmation link is invalid or has expired.");
          setState("error");
        }
      } catch {
        if (!cancelled) {
          setError("Connection failed. Check your connection and try the link again.");
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      {state === "working" && (
        <>
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
            style={{ borderTopColor: "var(--color-accent)", borderRightColor: "var(--color-accent)" }}
          />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Confirming your account…
          </p>
        </>
      )}
      {state === "done" && (
        <>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-accent-faint)" }}
          >
            <Check className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
            You&apos;re in
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Account confirmed — taking you to your calendar…
          </p>
        </>
      )}
      {state === "error" && (
        <>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-paper-2)" }}
          >
            <AlertTriangle className="h-6 w-6" style={{ color: "var(--color-warmth)" }} />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
            Link expired
          </h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>{error}</p>
          <Link
            href="/signup"
            className="mt-2 rounded-lg px-4 py-2.5 text-sm font-medium"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            Sign up again
          </Link>
        </>
      )}
    </div>
  );
}

export default function SignupVerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
