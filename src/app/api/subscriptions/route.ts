import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const VALID_CYCLES = new Set(["monthly", "yearly"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

interface SubBody {
  id?: string;
  company?: string;
  plan?: string | null;
  amountCents?: number;
  amount?: number; // client sends decimal amount; converted to cents
  currency?: string;
  cycle?: string;
  startDate?: string;
  remindDaysBefore?: number;
  color?: string;
  cancelled?: boolean;
}

function validateFields(body: SubBody, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  if (!partial || body.company !== undefined) {
    const company = body.company?.trim();
    if (!company) errors.push("Company name is required");
    else if (company.length > 80) errors.push("Company name too long");
    else out.company = company;
  }
  if (body.plan !== undefined) {
    const plan = body.plan?.trim() || null;
    if (plan && plan.length > 80) errors.push("Plan name too long");
    else out.plan = plan;
  }
  if (!partial || body.amount !== undefined || body.amountCents !== undefined) {
    const cents =
      body.amountCents !== undefined
        ? body.amountCents
        : typeof body.amount === "number"
          ? Math.round(body.amount * 100)
          : NaN;
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000_000) {
      errors.push("Amount must be a positive number");
    } else out.amountCents = cents;
  }
  if (body.currency !== undefined) {
    const currency = body.currency?.trim().toUpperCase();
    if (!currency || !CURRENCY_RE.test(currency)) errors.push("Invalid currency");
    else out.currency = currency;
  } else if (!partial) {
    out.currency = "USD";
  }
  if (!partial || body.cycle !== undefined) {
    if (!body.cycle || !VALID_CYCLES.has(body.cycle)) errors.push("Cycle must be monthly or yearly");
    else out.cycle = body.cycle;
  }
  if (!partial || body.startDate !== undefined) {
    const startDate = body.startDate?.trim();
    if (!startDate || !DATE_RE.test(startDate) || !Number.isFinite(new Date(startDate + "T00:00:00Z").getTime())) {
      errors.push("Valid start date (YYYY-MM-DD) is required");
    } else out.startDate = startDate;
  }
  if (body.remindDaysBefore !== undefined) {
    const r = body.remindDaysBefore;
    if (!Number.isInteger(r) || r < 0 || r > 90) errors.push("Reminder days must be 0–90");
    else out.remindDaysBefore = r;
  }
  if (body.color !== undefined) {
    if (!body.color || !COLOR_RE.test(body.color)) errors.push("Invalid color");
    else out.color = body.color;
  }
  if (body.cancelled !== undefined) {
    if (typeof body.cancelled !== "boolean") errors.push("cancelled must be a boolean");
    else out.cancelledAt = body.cancelled ? new Date() : null;
  }

  return { out, errors };
}

// GET /api/subscriptions — list the user's subscriptions
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("subs-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const subs = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, session.userId))
      .orderBy(schema.subscriptions.startDate)
      .limit(200);

    return NextResponse.json({ subscriptions: subs });
  } catch (err) {
    logError(err, { route: "subscriptions/GET" });
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

// POST /api/subscriptions — create
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("subs-post", ip, 20, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: SubBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, false);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    const [sub] = await db
      .insert(schema.subscriptions)
      .values({
        userId: session.userId,
        company: out.company as string,
        plan: (out.plan as string | null) ?? null,
        amountCents: out.amountCents as number,
        currency: (out.currency as string) ?? "USD",
        cycle: out.cycle as "monthly" | "yearly",
        startDate: out.startDate as string,
        remindDaysBefore: (out.remindDaysBefore as number) ?? 3,
        color: (out.color as string) ?? "#c2410c",
      })
      .returning();

    return NextResponse.json({ subscription: sub });
  } catch (err) {
    logError(err, { route: "subscriptions/POST" });
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

// PATCH /api/subscriptions — update fields on a subscription the user owns
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("subs-patch", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: SubBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, true);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const [sub] = await db
      .update(schema.subscriptions)
      .set({ ...out, updatedAt: new Date() })
      .where(and(eq(schema.subscriptions.id, body.id), eq(schema.subscriptions.userId, session.userId)))
      .returning();

    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ subscription: sub });
  } catch (err) {
    logError(err, { route: "subscriptions/PATCH" });
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}

// DELETE /api/subscriptions?id= — remove a subscription the user owns
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("subs-delete", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.subscriptions)
      .where(and(eq(schema.subscriptions.id, id), eq(schema.subscriptions.userId, session.userId)))
      .returning({ id: schema.subscriptions.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "subscriptions/DELETE" });
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }
}
