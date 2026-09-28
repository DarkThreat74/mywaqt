import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isFeedbackEnabled, setFeedbackEnabled } from "@/lib/app-settings";
import { logError } from "@/lib/logError";
import { isValidUUID } from "@/lib/validation";

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
        uiContext: schema.feedbackReports.uiContext,
        createdAt: schema.feedbackReports.createdAt,
        userEmail: schema.users.email,
        userName: schema.users.displayName,
        userFirstName: schema.users.firstName,
      })
      .from(schema.feedbackReports)
      .innerJoin(schema.users, eq(schema.feedbackReports.userId, schema.users.id))
      .orderBy(desc(schema.feedbackReports.createdAt))
      .limit(200);

    const enabled = await isFeedbackEnabled();
    return NextResponse.json({ rows, enabled });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logError(e, { route: "admin/feedback" });
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}

// PATCH /api/admin/feedback — two actions:
//   { id, resolved } — toggle a report's resolved flag
//   { enabled }      — show/hide the in-app feedback widget for all users
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    if (!checkRateLimit("admin-feedback", getClientIp(request.headers), 30, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body = (await request.json().catch(() => null)) as
      | { id?: string; resolved?: boolean; enabled?: boolean }
      | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }
      await setFeedbackEnabled(body.enabled);
      return NextResponse.json({ ok: true, enabled: body.enabled });
    }

    // Validate the UUID — Postgres throws on malformed uuid input → 500.
    if (!body.id || !isValidUUID(body.id) || typeof body.resolved !== "boolean") {
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
