export default function CalendarDayLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      {/* Date header skeleton */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-32 rounded-md" style={{ backgroundColor: "var(--color-paper-2)" }} />
        <div className="h-8 w-8 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }} />
      </div>
      {/* Prayer times skeleton */}
      <div className="mb-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
        ))}
      </div>
      {/* Events skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-20 rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
        <div className="h-16 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
        <div className="h-16 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
      </div>
    </div>
  );
}
