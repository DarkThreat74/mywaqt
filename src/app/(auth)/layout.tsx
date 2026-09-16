import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import UnregisterServiceWorker from "@/components/sw-unregister";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <UnregisterServiceWorker />
      {/* Back button — top left, always visible on auth pages */}
      <div className="px-6 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      {/* Centered auth content */}
      <div
        className="flex flex-1 items-center justify-center px-6 py-12"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
