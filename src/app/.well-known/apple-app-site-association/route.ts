import { NextResponse } from "next/server";
import { APP_BUNDLE_ID } from "@/lib/site-config";

export const dynamic = "force-static";

/**
 * Apple Universal Links association file.
 * Served at /.well-known/apple-app-site-association
 * Tells iOS to open ${SITE_DOMAIN} links in the app instead of Safari.
 */
export async function GET() {
  const data = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `TEAMID.${APP_BUNDLE_ID}`,
          paths: [
            "/prayer*",
            "/calendar*",
            "/settings*",
            "/onboarding*",
            "NOT /",
            "NOT /login",
            "NOT /signup",
            "NOT /admin*",
          ],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
