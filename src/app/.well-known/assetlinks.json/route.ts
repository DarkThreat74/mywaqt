import { NextResponse } from "next/server";
import { APP_BUNDLE_ID } from "@/lib/site-config";
import { env } from "@/lib/env";

export const dynamic = "force-static";

/**
 * Android App Links association file.
 * Served at /.well-known/assetlinks.json
 * Tells Android to open ${SITE_DOMAIN} links in the app instead of Chrome.
 *
 * The production fingerprint is supplied through ANDROID_APP_SIGNING_SHA256.
 * Never publish a placeholder fingerprint: it creates false confidence while
 * Android correctly rejects the association.
 */
export async function GET() {
  const fingerprints = env.androidAppSigningSha256
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(value));
  const data = fingerprints.length ? [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ] : [];

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
