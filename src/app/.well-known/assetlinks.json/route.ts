import { NextResponse } from "next/server";
import { APP_BUNDLE_ID } from "@/lib/site-config";

export const dynamic = "force-static";

/**
 * Android App Links association file.
 * Served at /.well-known/assetlinks.json
 * Tells Android to open ${SITE_DOMAIN} links in the app instead of Chrome.
 *
 * NOTE: Replace YOUR:SHA256:FINGERPRINT with your actual signing key's
 * SHA256 fingerprint before publishing.
 */
export async function GET() {
  const data = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: ["YOUR:SHA256:FINGERPRINT"],
      },
    },
  ];

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
