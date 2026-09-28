import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

// GET /api/admin/feedback — newest feedback reports, with reporter identity
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-feedback", getClientIp(request.headers), 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const rows = await db
      .select({
        id: schema.feedbackReports.id,
        page: schema.feedbackReports.page,
        pageDetail: schema.feedbackReports.pageDetail,
        message: schema.feedbackReports.message,
        theme: schema.feedbackReports.theme,
        viewport: schema.feedbackReports.viewport,
        userAgent: schema.feedbackReports.userAgent,
        resolved: schema.feedbackReports.resolved,
        createdAt: schema.feedbackReports.createdAt,
        userEmail: schema.users.email,
        userName: schema.users.displayName,
        userFirstName: schema.users.firstName,
      })
      .from(schema.feedbackReports)
      .innerJoin(schema.users, eq(schema.feedbackReports.userId, schema.users.id))
      .orderBy(desc(schema.feedbackReports.createdAt))
      .limit(200);

    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/feedback" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

// PATCH /api/admin/feedback — toggle resolved flag. Body: { id, resolved }
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-feedback", getClientIp(request.headers), 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body = (await request.json().catch(() => null)) as { id?: string; resolved?: boolean } | null;
    if (!body?.id || typeof body.resolved !== "boolean") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    await db
      .update(schema.feedbackReports)
      .set({ resolved: body.resolved })
      .where(eq(schema.feedbackReports.id, body.id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/feedback" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
