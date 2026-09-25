import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

const PRIVATE_PATHS = [
  "/api/",
  "/admin/",
  "/settings",
  "/onboarding",
  "/calendar",
  "/prayer",
  "/goals",
  "/learn",
];

// AI/search crawlers that index or answer from public pages. Waqt's landing
// and legal pages are public by design — the app shell stays disallowed.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Bingbot",
  "Applebot-Extended",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: "/",
        disallow: PRIVATE_PATHS,
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
