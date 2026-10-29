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
    staleTimes: { dynamic: 1800, static: 1800 },
  },
  // Keep native-binary packages external so Vercel's NFT bundler emits the
  // actual binary into the serverless function instead of webpack trying to
  // bundle it (which breaks the __dirname path resolution).
  // Without this, ffmpeg-static resolves to a wrong path on Vercel and
  // the binary is missing from the deployed function.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg", "onnxruntime-node"],
  // The tracer misses onnxruntime-node's native .node/.so binaries — force them
  // into the clip-processing function (pnpm symlink + real path both covered).
  outputFileTracingIncludes: {
    "/api/admin/recite-clips/process": [
      "./node_modules/onnxruntime-node/bin/**/*",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/**/*",
    ],
  },
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
        // Cross-origin isolation scoped to the Quran Tester only — enables
        // SharedArrayBuffer so the WASM recognizer can run multi-threaded.
        // Everything it loads is same-origin (/qt/*, /data/*, fonts), so
        // require-corp is safe here; app-wide COEP would break Turnstile/tiles.
        source: "/quran-tester",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
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
          // Satisfies COEP: require-corp for every same-origin subresource
          // (mushaf fonts via FontFace are no-cors loads — without this the
          // scoped isolation on /quran-tester would break glyph loading).
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
          // CSP: script-src keeps 'unsafe-inline' for the theme boot script +
          // RSC inline payloads, but locks every other vector — no foreign
          // script hosts, no iframes except Turnstile, no objects, no
          // form/base-uri tampering. External hosts limited to the ones the
          // client actually calls (geocoding, routing, map tiles, R2 audio).
          {
            // NOTE: public/sw.js has a CURRENT_CSP copy used to repair stale
            // cached worker-script responses — the SW only stamps it when the
            // response lacks 'wasm-unsafe-eval', so changes here always win.
            // If this policy ever removes wasm-unsafe-eval, update the guard
            // there too. Changing headers alone does NOT update Vercel edge
            // cache entries for unchanged hashed files — purge Caches in the
            // Vercel dashboard after CSP changes.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://tiles.openfreemap.org https://fonts.openfreemap.org",
              "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://tiles.openfreemap.org",
              "font-src 'self' data: https://fonts.openfreemap.org https://tiles.openfreemap.org",
              "connect-src 'self' https://nominatim.openstreetmap.org https://api.latlng.work https://router.project-osrm.org https://tiles.openfreemap.org https://fonts.openfreemap.org https://*.basemaps.cartocdn.com https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com",
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
