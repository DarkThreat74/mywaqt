import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Disable X-Powered-By header for security
  poweredByHeader: false,
  // Enable compression (gzip/brotli) for responses
  compress: true,
  // Optimize heavy package imports to reduce bundle size
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    // Router cache — keep visited pages warm so tab switches are instant
    // instead of re-fetching the RSC payload on every navigation.
    staleTimes: { dynamic: 30, static: 300 },
  },
  // Keep native-binary packages external so Vercel's NFT bundler emits the
  // actual binary into the serverless function instead of webpack trying to
  // bundle it (which breaks the __dirname path resolution).
  // Without this, ffmpeg-static resolves to a wrong path on Vercel and
  // the binary is missing from the deployed function.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  // Security and caching headers
  async headers() {
    return [
      {
        // Static assets are content-hashed and immutable — cache aggressively
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Public API endpoints — never edge-cached so visibility changes apply immediately
        source: "/api/public/:token*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Authenticated API routes — never cached by edge/CDN (private user data)
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
        ],
      },
      {
        // SW must always be fetched fresh from the network
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        // Baseline security headers on every response
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          // CSP: script-src keeps 'unsafe-inline' for the theme boot script +
          // RSC inline payloads, but locks every other vector — no foreign
          // script hosts, no iframes except Turnstile, no objects, no
          // form/base-uri tampering. External hosts limited to the ones the
          // client actually calls (geocoding, routing, map tiles, R2 audio).
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://tiles.openfreemap.org https://fonts.openfreemap.org",
              "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://tiles.openfreemap.org",
              "font-src 'self' data: https://fonts.openfreemap.org https://tiles.openfreemap.org",
              "connect-src 'self' https://nominatim.openstreetmap.org https://api.latlng.work https://router.project-osrm.org https://tiles.openfreemap.org https://fonts.openfreemap.org https://*.basemaps.cartocdn.com https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
              "media-src 'self' blob: https:",
              "frame-src https://challenges.cloudflare.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
