import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const VALID_REMIND = new Set([0, 1, 2, 3, 7, 14, 30]);
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface BDayBody {
  id?: string;
  name?: string;
  birthMonth?: number;
  birthDay?: number;
  birthYear?: number | null;
  remindDays?: number[];
  categoryId?: string | null;
  clientId?: string;
}

/** Returns the category id if it's a valid uuid owned by the user, else null. */
async function ownedCategoryId(userId: string, categoryId: unknown): Promise<string | null> {
  if (categoryId === null || categoryId === undefined) return null;
  if (typeof categoryId !== "string" || !isValidUUID(categoryId)) return null;
  const [row] = await db
    .select({ id: schema.birthdayCategories.id })
    .from(schema.birthdayCategories)
    .where(and(eq(schema.birthdayCategories.id, categoryId), eq(schema.birthdayCategories.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

function validateFields(body: BDayBody, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  if (!partial || body.name !== undefined) {
    const name = body.name?.trim();
    if (!name) errors.push("Name is required");
    else if (name.length > 100) errors.push("Name too long");
    else out.name = name;
  }
  if (!partial || body.birthMonth !== undefined) {
    if (!Number.isInteger(body.birthMonth) || body.birthMonth! < 1 || body.birthMonth! > 12) {
      errors.push("Month must be 1–12");
    } else out.birthMonth = body.birthMonth;
  }
  if (!partial || body.birthDay !== undefined) {
    const m = body.birthMonth ?? 1;
    if (!Number.isInteger(body.birthDay) || body.birthDay! < 1 || body.birthDay! > DAYS_IN_MONTH[m - 1]) {
      errors.push("Day must be valid for the month");
    } else out.birthDay = body.birthDay;
  }
  if (body.birthYear !== undefined) {
    const y = body.birthYear;
    if (y === null) out.birthYear = null;
    else if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) {
      errors.push("Year must be 1900–now or empty");
    } else out.birthYear = y;
  }
  if (body.remindDays !== undefined) {
    if (!Array.isArray(body.remindDays) || body.remindDays.length === 0 ||
        body.remindDays.length > 7 || !body.remindDays.every((d) => Number.isInteger(d) && VALID_REMIND.has(d))) {
      errors.push("Invalid reminder days");
    } else out.remindDays = [...new Set(body.remindDays)].sort((a, b) => a - b);
  }

  return { out, errors };
}

// GET /api/birthdays — list the user's birthdays
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bdays-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const [list, categories] = await Promise.all([
      db
        .select()
        .from(schema.birthdays)
        .where(eq(schema.birthdays.userId, session.userId))
        .limit(500),
      db
        .select()
        .from(schema.birthdayCategories)
        .where(eq(schema.birthdayCategories.userId, session.userId))
        .limit(100),
    ]);

    return NextResponse.json({ birthdays: list, categories });
  } catch (err) {
    logError(err, { route: "birthdays/GET" });
    return NextResponse.json({ error: "Failed to fetch birthdays" }, { status: 500 });
  }
}

// POST /api/birthdays — create
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bdays-post", getClientIp(request.headers), 20, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: BDayBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, false);
    if (errors.length > 0) return NextResponse.json({ error: errors[0] }, { status: 400 });

    // Offline-created rows carry a client uuid — same contract as events/goals.
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const [row] = await db
      .insert(schema.birthdays)
      .values({
        id: validClientId,
        userId: session.userId,
        name: out.name as string,
        birthMonth: out.birthMonth as number,
        birthDay: out.birthDay as number,
        birthYear: (out.birthYear as number | null) ?? null,
        remindDays: (out.remindDays as number[]) ?? [0, 1],
        categoryId: await ownedCategoryId(session.userId, body.categoryId),
      })
      .onConflictDoNothing({ target: schema.birthdays.id })
      .returning();

    // Retried offline replay — row exists; return it instead of 500ing.
    if (!row && validClientId) {
      const [existing] = await db
        .select()
        .from(schema.birthdays)
        .where(and(eq(schema.birthdays.id, validClientId), eq(schema.birthdays.userId, session.userId)))
        .limit(1);
      if (existing) return NextResponse.json({ birthday: existing, deduped: true });
      return NextResponse.json({ error: "Failed to create birthday" }, { status: 500 });
    }

    return NextResponse.json({ birthday: row });
  } catch (err) {
    logError(err, { route: "birthdays/POST" });
    return NextResponse.json({ error: "Failed to create birthday" }, { status: 500 });
  }
}

// PATCH /api/birthdays — update
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bdays-patch", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: BDayBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const { out, errors } = validateFields(body, true);
    if (errors.length > 0) return NextResponse.json({ error: errors[0] }, { status: 400 });
    if (body.categoryId !== undefined) {
      // Explicit null clears the category; unowned/invalid ids become null only
      // if they're null — an unknown uuid is rejected, not silently cleared.
      if (body.categoryId === null) out.categoryId = null;
      else {
        const owned = await ownedCategoryId(session.userId, body.categoryId);
        if (!owned) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
        out.categoryId = owned;
      }
    }
    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // If month or day is changing, validate the merged pair against the
    // existing row — patching birthDay alone must respect the stored month.
    if (out.birthMonth !== undefined || out.birthDay !== undefined) {
      const [existing] = await db
        .select({
          birthMonth: schema.birthdays.birthMonth,
          birthDay: schema.birthdays.birthDay,
          birthYear: schema.birthdays.birthYear,
        })
        .from(schema.birthdays)
        .where(and(eq(schema.birthdays.id, body.id), eq(schema.birthdays.userId, session.userId)))
        .limit(1);
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const m = (out.birthMonth as number | undefined) ?? existing.birthMonth;
      const d = (out.birthDay as number | undefined) ?? existing.birthDay;
      const y = out.birthYear !== undefined ? (out.birthYear as number | null) : existing.birthYear;
      const maxD = m === 2 && typeof y === "number"
        ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28)
        : DAYS_IN_MONTH[m - 1];
      if (d > maxD) {
        return NextResponse.json({ error: "Day must be valid for the month" }, { status: 400 });
      }
    }

    const [row] = await db
      .update(schema.birthdays)
      .set({ ...out, updatedAt: new Date() })
      .where(and(eq(schema.birthdays.id, body.id), eq(schema.birthdays.userId, session.userId)))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ birthday: row });
  } catch (err) {
    logError(err, { route: "birthdays/PATCH" });
    return NextResponse.json({ error: "Failed to update birthday" }, { status: 500 });
  }
}

// DELETE /api/birthdays?id= — remove
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("bdays-delete", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.birthdays)
      .where(and(eq(schema.birthdays.id, id), eq(schema.birthdays.userId, session.userId)))
      .returning({ id: schema.birthdays.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "birthdays/DELETE" });
    return NextResponse.json({ error: "Failed to delete birthday" }, { status: 500 });
  }
}
