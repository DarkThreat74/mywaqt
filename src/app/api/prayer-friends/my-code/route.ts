import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/prayer-friends/my-code — get the current user's prayer code (generate one if missing)
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Generates codes + writes on first call — keep it tighter than plain reads.
  if (!checkRateLimit("pf-my-code", getClientIp(request.headers), 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const [user] = await db
      .select({ prayerCode: schema.users.prayerCode })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (user?.prayerCode) {
      return NextResponse.json({ prayerCode: user.prayerCode });
    }

    // Generate a code for existing users who don't have one yet
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      // Check uniqueness
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.prayerCode, code))
        .limit(1);
      if (!existing) {
        await db
          .update(schema.users)
          .set({ prayerCode: code })
          .where(eq(schema.users.id, session.userId));
        return NextResponse.json({ prayerCode: code });
      }
    }

    return NextResponse.json({ error: "Could not generate prayer code." }, { status: 500 });
  } catch (err) {
    logError(err, { route: "prayer-friends/my-code" });
    return NextResponse.json({ error: "Failed to load prayer code." }, { status: 500 });
  }
}
