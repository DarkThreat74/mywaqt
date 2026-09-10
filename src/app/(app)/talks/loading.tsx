export default function TalksLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2"
        style={{
          borderColor: "var(--color-paper-3)",
          borderTopColor: "var(--color-ink-muted)",
        }}
      />
    </div>
  );
}
