import Link from "next/link";
import { Target } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found — Waqt",
  description: "The page you're looking for doesn't exist.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

export default function NotFound() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: "var(--color-paper-2)" }}
    >
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
        }}
      >
        <Target className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
      </div>
      <h1
        className="mb-2 text-lg font-semibold"
        style={{ color: "var(--color-ink)" }}
      >
        Page not found
      </h1>
      <p
        className="mb-6 max-w-sm text-sm leading-relaxed"
        style={{ color: "var(--color-ink-muted)" }}
      >
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* /calendar/day routes signed-in users back into the app; for
            signed-out visitors the (app) layout redirects through login. */}
        <Link
          href="/calendar/day"
          className="rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
          }}
        >
          Open the app
        </Link>
        <Link
          href="/"
          className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{
            borderColor: "var(--color-paper-3)",
            color: "var(--color-ink-soft)",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
