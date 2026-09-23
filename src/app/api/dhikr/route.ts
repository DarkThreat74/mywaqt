import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/**
 * GET /api/dhikr
 * Returns all dhikr sequences ordered by sequenceOrder.
 * These are human-curated from authenticated sources — never AI-generated.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("dhikr", getClientIp(request.headers), 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const sequences = await db
      .select()
      .from(schema.dhikrSequences)
      .orderBy(schema.dhikrSequences.sequenceOrder);

    return NextResponse.json({ sequences });
  } catch (err) {
    logError(err, { route: "dhikr GET" });
    return NextResponse.json(
      { error: "Failed to load dhikr sequences." },
      { status: 500 },
    );
  }
}
