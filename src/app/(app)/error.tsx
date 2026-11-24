"use client";
import { useEffect } from "react";
import { logError } from "@/lib/logError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { boundary: "(app)" });
  }, [error]);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      style={{ color: "var(--color-ink)" }}
    >
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-ink-soft)" }}>
        Your data is safe. Please try again.
      </p>
      {error?.message && (
        <p
          className="mt-3 max-w-sm break-words rounded-lg px-3 py-2 font-mono text-[11px]"
          style={{ color: "var(--color-ink-muted)", backgroundColor: "var(--color-paper-2)" }}
        >
          {error.message}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-medium"
        style={{
          background: "var(--color-accent)",
          color: "var(--color-paper)",
          minHeight: 44,
        }}
      >
        Try again
      </button>
    </div>
  );
}
