import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const TAG_RE = /^[a-z0-9-]{1,24}$/;

interface ExpenseBody {
  id?: string;
  tag?: string;
  amountCents?: number;
  amount?: number; // client sends decimal amount; converted to cents
  currency?: string;
  occurredOn?: string;
  quantity?: number | null;
  unit?: string | null;
  place?: string | null;
  detail?: string | null;
  // Compressed client-side (canvas → JPEG ≤900px q0.72) → base64, ~60-150KB.
  photo?: string | null;
  photoMime?: string | null;
  clientId?: string;
}

const PHOTO_MIMES = new Set(["image/jpeg", "image/webp", "image/png"]);
const MAX_PHOTO_B64 = 800_000; // ~600KB decoded — thumbnails shouldn't exceed this

function validateFields(body: ExpenseBody, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  if (!partial || body.tag !== undefined) {
    const tag = typeof body.tag === "string" ? body.tag.trim().toLowerCase() : "";
    if (!tag || !TAG_RE.test(tag)) errors.push("Tag must be 1–24 lowercase letters/digits");
    else out.tag = tag;
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
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    if (!currency || !CURRENCY_RE.test(currency)) errors.push("Invalid currency");
    else out.currency = currency;
  } else if (!partial) {
    out.currency = "USD";
  }
  if (!partial || body.occurredOn !== undefined) {
    const d = typeof body.occurredOn === "string" ? body.occurredOn.trim() : "";
    if (!d || !DATE_RE.test(d) || !Number.isFinite(new Date(d + "T00:00:00Z").getTime())) {
      errors.push("Valid date (YYYY-MM-DD) is required");
    } else if (d > new Date().toLocaleDateString("en-CA")) {
      errors.push("Date can't be in the future");
    } else out.occurredOn = d;
  }
  if (body.quantity !== undefined) {
    const q = body.quantity;
    if (q === null) out.quantity = null;
    else if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > 1_000_000) {
      errors.push("Quantity must be a positive number");
    } else out.quantity = q;
  }
  if (body.unit !== undefined) {
    const u = typeof body.unit === "string" ? body.unit.trim().toLowerCase() || null : null;
    if (u && u.length > 16) errors.push("Unit too long");
    else out.unit = u;
  }
  if (body.place !== undefined) {
    const p = typeof body.place === "string" ? body.place.trim() || null : null;
    if (p && p.length > 80) errors.push("Place too long");
    else out.place = p;
  }
  if (body.detail !== undefined) {
    const d = typeof body.detail === "string" ? body.detail.trim() || null : null;
    if (d && d.length > 80) errors.push("Detail too long");
    else out.detail = d;
  }
  if (body.photo !== undefined) {
    if (body.photo === null) {
      out.photoData = null;
      out.photoMime = null;
    } else if (typeof body.photo === "string") {
      const mime = typeof body.photoMime === "string" ? body.photoMime : "";
      if (!PHOTO_MIMES.has(mime)) {
        errors.push("Photo must be jpeg/webp/png");
      } else if (body.photo.length > MAX_PHOTO_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) {
        errors.push("Photo too large or invalid");
      } else {
        out.photoData = body.photo;
        out.photoMime = mime;
      }
    }
  }

  return { out, errors };
}

// GET /api/expenses — list the user's entries (optional ?tag= filter)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("expenses-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const tag = request.nextUrl.searchParams.get("tag");
    const rows = await db
      .select({
        id: schema.expenses.id,
        userId: schema.expenses.userId,
        tag: schema.expenses.tag,
        amountCents: schema.expenses.amountCents,
        currency: schema.expenses.currency,
        occurredOn: schema.expenses.occurredOn,
        quantity: schema.expenses.quantity,
        unit: schema.expenses.unit,
        place: schema.expenses.place,
        detail: schema.expenses.detail,
        // photoData stays out of the list payload — fetched per-entry via
        // /api/expenses/[id]/photo when the thumbnail is in view.
        hasPhoto: sql<boolean>`${schema.expenses.photoData} IS NOT NULL`,
        createdAt: schema.expenses.createdAt,
        updatedAt: schema.expenses.updatedAt,
      })
      .from(schema.expenses)
      .where(
        tag && TAG_RE.test(tag)
          ? and(eq(schema.expenses.userId, session.userId), eq(schema.expenses.tag, tag))
          : eq(schema.expenses.userId, session.userId),
      )
      .orderBy(desc(schema.expenses.occurredOn))
      .limit(500);

    return NextResponse.json({ expenses: rows });
  } catch (err) {
    logError(err, { route: "expenses/GET" });
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

// POST /api/expenses — log a manual entry
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("expenses-post", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: ExpenseBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, false);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }

    // Offline-created entries carry a client-generated uuid — same replay
    // dedupe as subscriptions.
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const [row] = await db
      .insert(schema.expenses)
      .values({
        id: validClientId,
        userId: session.userId,
        tag: out.tag as string,
        amountCents: out.amountCents as number,
        currency: (out.currency as string) ?? "USD",
        occurredOn: out.occurredOn as string,
        quantity: (out.quantity as number | null) ?? null,
        unit: (out.unit as string | null) ?? null,
        place: (out.place as string | null) ?? null,
        detail: (out.detail as string | null) ?? null,
        photoData: (out.photoData as string | null) ?? null,
        photoMime: (out.photoMime as string | null) ?? null,
      })
      .onConflictDoNothing({ target: schema.expenses.id })
      .returning();

    if (!row && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.expenses)
        .where(and(eq(schema.expenses.id, validClientId), eq(schema.expenses.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json({ expense: existing, deduped: true });
      return NextResponse.json({ error: "Failed to save expense" }, { status: 500 });
    }

    return NextResponse.json({ expense: row });
  } catch (err) {
    logError(err, { route: "expenses/POST" });
    return NextResponse.json({ error: "Failed to save expense" }, { status: 500 });
  }
}

// PATCH /api/expenses — update an entry the user owns
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("expenses-patch", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: ExpenseBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || typeof body.id !== "string" || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, true);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const [row] = await db
      .update(schema.expenses)
      .set({ ...out, updatedAt: new Date() })
      .where(and(eq(schema.expenses.id, body.id), eq(schema.expenses.userId, session.userId)))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ expense: row });
  } catch (err) {
    logError(err, { route: "expenses/PATCH" });
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

// DELETE /api/expenses?id= — remove an entry the user owns
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ip = getClientIp(request.headers);
    if (!checkRateLimit("expenses-delete", ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.expenses)
      .where(and(eq(schema.expenses.id, id), eq(schema.expenses.userId, session.userId)))
      .returning({ id: schema.expenses.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "expenses/DELETE" });
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
