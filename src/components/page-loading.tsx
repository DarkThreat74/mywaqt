/**
 * Generic page skeleton — shown instantly on client-side navigation while the
 * RSC payload streams in. Route-level loading.tsx files render this so a tab
 * tap always gives immediate visual feedback instead of looking frozen.
 */
export default function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-7 w-24 rounded-md" style={{ backgroundColor: "var(--color-paper-2)" }} />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
            <div className="mb-3 h-5 w-40 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
            <div className="mb-2 h-3 w-full rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
            <div className="h-3 w-3/4 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
