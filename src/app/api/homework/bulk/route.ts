import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { HOMEWORK_KINDS } from "@/lib/homework/kinds";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const MAX_ITEMS = 200;

interface BulkItem {
  title?: string;
  classId?: string | null;
  dueDate?: string;
  dueTime?: string | null;
  priority?: string;
  kind?: string;
}

// POST /api/homework/bulk — import up to 200 assignments at once (syllabus
// paste / ICS import). Dedupes on (title, dueDate) against existing rows so
// re-importing the same file doesn't create doubles.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request.headers);
    if (!checkRateLimit("homework-bulk", ip, 5, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: { items?: BulkItem[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "No items to import" }, { status: 400 });
    }
    if (body.items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Maximum ${MAX_ITEMS} items per import` }, { status: 400 });
    }

    // Validate each item; collect valid rows, count skips
    const rows: Array<{
      userId: string; title: string; classId: string | null; dueDate: string;
      dueTime: string | null; priority: "low" | "medium" | "high";
      kind: (typeof HOMEWORK_KINDS)[number];
    }> = [];
    const classIds = new Set<string>();
    for (const item of body.items) {
      const title = item.title?.trim().slice(0, 300);
      if (!title) continue;
      if (!item.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) continue;
      if (item.classId) classIds.add(item.classId);
      rows.push({
        userId: session.userId,
        title,
        classId: item.classId || null,
        dueDate: item.dueDate,
        dueTime: item.dueTime && /^\d{2}:\d{2}(:\d{2})?$/.test(item.dueTime) ? item.dueTime.slice(0, 8) : null,
        priority: item.priority && VALID_PRIORITIES.has(item.priority) ? (item.priority as "low" | "medium" | "high") : "medium",
        kind: item.kind && (HOMEWORK_KINDS as readonly string[]).includes(item.kind) ? (item.kind as (typeof HOMEWORK_KINDS)[number]) : "homework",
      });
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid items found" }, { status: 400 });
    }

    // IDOR: every referenced class must belong to this user
    if (classIds.size > 0) {
      const owned = await db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(and(eq(schema.classes.userId, session.userId), inArray(schema.classes.id, Array.from(classIds))));
      const ownedIds = new Set(owned.map((c) => c.id));
      for (const row of rows) {
        if (row.classId && !ownedIds.has(row.classId)) row.classId = null; // strip bad refs rather than reject the whole import
      }
    }

    // Dedupe on (title, dueDate) — check which already exist
    const existing = await db
      .select({ title: schema.homeworks.title, dueDate: schema.homeworks.dueDate })
      .from(schema.homeworks)
      .where(eq(schema.homeworks.userId, session.userId));
    const seen = new Set(existing.map((h) => `${h.title}@@${h.dueDate}`));
    const fresh = rows.filter((r) => {
      const key = `${r.title}@@${r.dueDate}`;
      if (seen.has(key)) return false;
      seen.add(key); // also dedupe within the batch itself
      return true;
    });

    if (fresh.length === 0) {
      return NextResponse.json({ created: 0, skipped: rows.length });
    }

    await db.insert(schema.homeworks).values(fresh);
    return NextResponse.json({ created: fresh.length, skipped: rows.length - fresh.length });
  } catch (err) {
    logError(err, { route: "homework/bulk/POST" });
    return NextResponse.json({ error: "Failed to import" }, { status: 500 });
  }
}
