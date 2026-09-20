"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AddFriendPage() {
  return (
    <Suspense fallback={<Shell state="loading" />}>
      <AddFriendInner />
    </Suspense>
  );
}

function AddFriendInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "already" | "error">(token ? "loading" : "error");
  const [error, setError] = useState(token ? "" : "This invite link is missing its token.");
  const router = useRouter();

  useEffect(() => {
    if (!token) return;

    fetch("/api/prayer-friends/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          // Not logged in — stash the token; a PendingInvite component inside
          // the app layout completes the accept after login/signup.
          localStorage.setItem("pendingPrayerInvite", token);
          router.push("/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState(data.alreadyFriends ? "already" : "ok");
        } else {
          setError(data.error || "This invite link could not be used.");
          setState("error");
        }
      })
      .catch(() => {
        setError("Network error — check your connection and try again.");
        setState("error");
      });
  }, [token, router]);

  return <Shell state={state} error={error} />;
}

function Shell({ state, error }: { state: "loading" | "ok" | "already" | "error"; error?: string }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-6"
      style={{ backgroundColor: "var(--color-paper)" }}
    >
      <div className="w-full max-w-sm text-center">
        <p className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Waqt
        </p>
        {state === "loading" && (
          <p className="mt-6 text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Adding you as prayer buddies…
          </p>
        )}
        {state === "ok" && (
          <>
            <h1 className="mt-6 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
              You&apos;re prayer buddies now
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              You can now see each other&apos;s shared stats and cheer each other on.
            </p>
            <Link
              href="/prayer?tab=friends"
              className="mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Open Prayer
            </Link>
          </>
        )}
        {state === "already" && (
          <>
            <h1 className="mt-6 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
              Already buddies
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              You&apos;re already prayer buddies with this person.
            </p>
            <Link
              href="/prayer?tab=friends"
              className="mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Open Prayer
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="mt-6 text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
              Invite unavailable
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {error}
            </p>
            <Link
              href="/prayer?tab=friends"
              className="mt-6 inline-block text-sm font-medium underline"
              style={{ color: "var(--color-accent)" }}
            >
              Go to Prayer
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
