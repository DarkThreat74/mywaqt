import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Shared layout for legal/info pages (privacy, terms, cookie, data-deletion, support).
 * Mobile-first: sticky back-button header, comfortable reading width, safe-area aware.
 */
export default function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Sticky header with back button ── */}
      <header
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        }}
      >
        <Link
          href="/"
          aria-label="Back to home"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink)" }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="truncate text-base font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          {title}
        </span>
      </header>

      {/* ── Article body ── */}
      <article
        className="mx-auto max-w-2xl px-5 py-8 sm:px-6 sm:py-12"
        style={{ color: "var(--color-ink)" }}
      >
        <h1 className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {updatedAt && (
          <p className="mb-8 text-sm" style={{ color: "var(--color-ink-muted)" }}>
            Last updated: {updatedAt}
          </p>
        )}
        {children}
      </article>
    </div>
  );
}
