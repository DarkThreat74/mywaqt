import { NextRequest, NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const [userRow] = await db.select({ value: count() }).from(schema.users);
    const [talksRow] = await db.select({ value: count() }).from(schema.talks);

    return NextResponse.json({
      users: userRow?.value ?? 0,
      talks: talksRow?.value ?? 0,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/stats" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
