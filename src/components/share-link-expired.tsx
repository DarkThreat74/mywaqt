import Link from "next/link";

/**
 * Shown when a public calendar share link is no longer valid — either the
 * owner regenerated the code (old link deactivated) or sharing is disabled.
 * Replaces generic 404s with a clear, actionable message.
 */
export default function ShareLinkExpired() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <svg
          className="h-8 w-8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
        </svg>
      </div>
      <h1
        className="mb-2 text-xl font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        This link is no longer available
      </h1>
      <p
        className="mb-8 text-sm leading-relaxed"
        style={{ color: "var(--color-ink-muted)" }}
      >
        The owner may have regenerated their share code or disabled sharing.
        Ask them for the new link.
      </p>
      <Link
        href="/"
        className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-paper)",
        }}
      >
        Go to Waqt
      </Link>
    </div>
  );
}
