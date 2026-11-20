import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sirat — Halal places near you",
  description:
    "HMS and HFSAA certified halal restaurants, stores, masjids and things to do around Chicagoland. Works offline.",
  openGraph: {
    title: "Sirat — Halal places near you",
    description:
      "Certified halal food, stores and masjids around Chicagoland — works offline.",
    type: "website",
    siteName: "Sirat by Waqt",
  },
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
        className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] opacity-40 transition-opacity hover:opacity-90"
        style={{
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-paper-3)",
        }}
      >
        &larr;
      </Link>
    </div>
  );
}
