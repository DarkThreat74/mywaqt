import type { Metadata } from "next";

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

// Sirat's own "← Waqt" button (public/myapps/sirat/index.html) breaks out of
// the iframe via top.location — no wrapper back link here, two back buttons
// stacked in the same corner was the bug.
export default function SiratPage() {
  return (
    <div className="fixed inset-0" style={{ backgroundColor: "var(--color-paper)" }}>
      <iframe
        src="/myapps/sirat/index.html?theme=light"
        title="Sirat — halal places map"
        className="h-full w-full border-0"
        allow="geolocation"
      />
    </div>
  );
}
