export default function CalendarMonthLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      {/* Month header skeleton */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-6 w-40 rounded-md" style={{ backgroundColor: "var(--color-paper-2)" }} />
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }} />
          <div className="h-8 w-8 rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }} />
        </div>
      </div>
      {/* Calendar grid skeleton */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square rounded" style={{ backgroundColor: "var(--color-paper-2)" }} />
        ))}
      </div>
    </div>
  );
}
