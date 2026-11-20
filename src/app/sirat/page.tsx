import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sirat — Halal places near you | Waqt",
  description:
    "HMS and HFSAA certified halal restaurants, stores, masjids and things to do around Chicagoland. Works offline.",
};

export default function SiratPage() {
  return (
    <div className="fixed inset-0" style={{ backgroundColor: "var(--color-paper)" }}>
      <iframe
        src="/myapps/sirat/index.html?theme=light"
        title="Sirat — halal places map"
        className="h-full w-full border-0"
        allow="geolocation"
      />
      <Link
        href="/"
        aria-label="Back to Waqt home"
        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm"
        style={{
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-paper-3)",
        }}
      >
        &larr; Waqt
      </Link>
    </div>
  );
}
