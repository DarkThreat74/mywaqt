export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Title skeleton */}
      <div className="mb-6 h-7 w-24 rounded-md" style={{ backgroundColor: "var(--color-paper-2)" }} />
      {/* Settings card skeleton */}
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <div className="p-4 sm:p-6 space-y-4">
          {/* Theme buttons skeleton */}
          <div className="h-4 w-16 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg border-2" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }} />
            ))}
          </div>
          {/* Location skeleton */}
          <div className="h-4 w-20 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
          <div className="h-11 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
          {/* Prayer times skeleton */}
          <div className="h-4 w-24 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
