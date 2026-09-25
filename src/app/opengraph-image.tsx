import { ImageResponse } from "next/og";

export const alt = "Waqt — a prayer-centered life tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          backgroundColor: "#faf7f0",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#2d6a72",
            marginBottom: 40,
          }}
        >
          Prayer-centered life tracker
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 110,
            fontWeight: 600,
            color: "#2b2823",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Waqt
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 42,
            color: "#5c574d",
            lineHeight: 1.35,
            marginTop: 32,
            maxWidth: 900,
          }}
        >
          The five prayers are the fixed anchor. Everything else fits around
          them.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 56,
          }}
        >
          <div
            style={{
              width: 64,
              height: 4,
              backgroundColor: "#9a6b4a",
            }}
          />
          <div style={{ fontSize: 26, color: "#8a8577" }}>
            Free · Works offline · iOS, Android &amp; web
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
