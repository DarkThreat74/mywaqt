import { ImageResponse } from "next/og";
import { SITE_DOMAIN } from "@/lib/site-config";

export const alt = "Waqt — prayer-centered life tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Palette approximations of the design tokens (oklch values don't render
// reliably in OG consumers, so these are the sRGB equivalents).
const PAPER = "#f5f0e8";
const PAPER_2 = "#ece5d8";
const INK = "#1a1815";
const INK_SOFT = "#4a443c";
const ACCENT = "#2b6772";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: PAPER,
          padding: "72px 80px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ fontSize: 44, fontWeight: 600, color: INK, letterSpacing: "-0.02em" }}>
            Waqt
          </span>
          <span style={{ fontSize: 20, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.18em" }}>
            Prayer-centered life tracker
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 84, fontWeight: 600, color: INK, lineHeight: 1.08, letterSpacing: "-0.03em" }}>
            The five prayers are
          </span>
          <span style={{ fontSize: 84, fontWeight: 600, color: INK, lineHeight: 1.08, letterSpacing: "-0.03em" }}>
            the fixed anchor.
          </span>
          <span style={{ fontSize: 30, color: INK_SOFT, marginTop: 28, lineHeight: 1.4 }}>
            Check-ins, qadaa tracking, prayer friends, masjid iqamah times — offline-first. Free.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 4, backgroundColor: ACCENT, borderRadius: 2 }} />
            <span style={{ fontSize: 28, fontWeight: 600, color: ACCENT }}>{SITE_DOMAIN}</span>
          </div>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 24,
              backgroundColor: PAPER_2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${ACCENT}`,
            }}
          >
            <span style={{ fontSize: 60, fontWeight: 700, color: ACCENT }}>W</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
