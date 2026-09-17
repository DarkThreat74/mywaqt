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
        ],
      },
    ];
  },
};

export default nextConfig;
