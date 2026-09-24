import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = ["sadaqah", "zakat", "fidyah", "charity"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

function isCategory(v: string): v is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(v);
}

// GET /api/sadaqah — returns user's sadaqah logs + summary stats
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("sadaqah-read", getClientIp(request.headers), 60, 60000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "all-time";

    // Determine date filter
    let dateFilter = gte(schema.sadaqahLogs.date, "1970-01-01");
    if (range === "weekly") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(sunday.getDate() - dayOfWeek);
      dateFilter = gte(schema.sadaqahLogs.date, sunday.toISOString().split("T")[0]);
    } else if (range === "monthly") {
      const now = new Date();
      dateFilter = gte(schema.sadaqahLogs.date, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    } else if (range === "yearly") {
      dateFilter = gte(schema.sadaqahLogs.date, `${new Date().getFullYear()}-01-01`);
    }

    const logs = await db
      .select()
      .from(schema.sadaqahLogs)
      .where(and(eq(schema.sadaqahLogs.userId, session.userId), dateFilter))
      .orderBy(desc(schema.sadaqahLogs.date), desc(schema.sadaqahLogs.createdAt))
      .limit(5000);

    // Summary by category
    const summary = logs.reduce(
      (acc, log) => {
        const amount = parseFloat(log.amount);
        if (!acc[log.category]) {
          acc[log.category] = { count: 0, total: 0 };
        }
        acc[log.category].count++;
        acc[log.category].total += amount;
        return acc;
      },
      {} as Record<string, { count: number; total: number }>,
    );

    const grandTotal = Object.values(summary).reduce((sum, s) => sum + s.total, 0);

    // Fetch user's display name for the card
    const [user] = await db
      .select({ displayName: schema.users.displayName, firstName: schema.users.firstName })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    return NextResponse.json({
      logs,
      summary,
      grandTotal: Math.round(grandTotal * 100) / 100,
      currency: logs[0]?.currency || "USD",
      cardholderName: user?.displayName || user?.firstName || null,
    });
  } catch (err) {
    logError(err, { route: "sadaqah GET" });
    return NextResponse.json({ error: "Failed to load sadaqah logs." }, { status: 500 });
  }
}

// POST /api/sadaqah — create a new sadaqah log entry
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("sadaqah-create", ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { amount, currency, category, note, date } = body as {
      amount?: string | number;
      currency?: string;
      category?: string;
      note?: string;
      date?: string;
    };

    // Validate amount
    const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    if (typeof parsedAmount !== "number" || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
    }
    if (parsedAmount > 99999999) {
      return NextResponse.json({ error: "Amount is too large." }, { status: 400 });
    }

    // Validate category
    if (!category || !isCategory(category)) {
      return NextResponse.json({ error: "Category must be one of: sadaqah, zakat, fidyah, charity." }, { status: 400 });
    }

    // Validate date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Date must be in YYYY-MM-DD format." }, { status: 400 });
    }

    // Sanitize note
    const trimmedNote = note?.trim().slice(0, 500) || null;
    const trimmedCurrency = (currency || "USD").trim().slice(0, 3).toUpperCase();

    const [log] = await db
      .insert(schema.sadaqahLogs)
      .values({
        userId: session.userId,
        amount: parsedAmount.toFixed(2),
        currency: trimmedCurrency,
        category,
        note: trimmedNote,
        date,
      })
      .returning();

    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    logError(err, { route: "sadaqah POST" });
    return NextResponse.json({ error: "Failed to create sadaqah log." }, { status: 500 });
  }
}

// DELETE /api/sadaqah?id=... — delete a sadaqah log entry
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!checkRateLimit("sadaqah-delete", getClientIp(request.headers), 20, 3600000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Valid log ID is required." }, { status: 400 });
    }

    // Delete only if it belongs to the user (IDOR protection)
    const [deleted] = await db
      .delete(schema.sadaqahLogs)
      .where(and(eq(schema.sadaqahLogs.id, id), eq(schema.sadaqahLogs.userId, session.userId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { route: "sadaqah DELETE" });
    return NextResponse.json({ error: "Failed to delete sadaqah log." }, { status: 500 });
  }
}

// Avoid unused import warning
void sql;
