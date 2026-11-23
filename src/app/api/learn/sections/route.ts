import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { learnSections } from "@/lib/content/learn";

export const dynamic = "force-dynamic";

// GET /api/learn/sections — the curated learn library. Content is static
// human-curated data, so responses carry a long s-maxage; auth is still
// checked per request (hence force-dynamic — the cache header helps
// shared/client caches, not bypass of the session check on the edge).
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by both user ID and IP (defense in depth), same pattern as
  // /api/learn/search.
  const ip = getClientIp(request.headers);
  if (!checkRateLimit("learn-sections", `${session.userId}:${ip}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  return NextResponse.json(learnSections, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
