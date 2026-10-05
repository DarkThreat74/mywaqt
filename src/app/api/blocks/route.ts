import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, inArray, sql, asc } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { isValidUUID } from "@/lib/validation";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = new Set(["planned", "worked", "released"]);
const VALID_REASONS = new Set(["tired", "ran_out", "wasnt_free", "other"]);

interface BlockBody {
  id?: string;
  date?: string;
  startMin?: number;
  endMin?: number;
  homeworkIds?: string[];
  status?: string;
  releaseReason?: string;
  sharePublic?: boolean;
  clientId?: string;
}

function validateTiming(date: unknown, startMin: unknown, endMin: unknown) {
  if (typeof date !== "string" || !DATE_RE.test(date)) return "A valid date is required";
  if (!Number.isInteger(startMin) || (startMin as number) < 0 || (startMin as number) >= 1440) return "Invalid start time";
  if (!Number.isInteger(endMin) || (endMin as number) <= 0 || (endMin as number) > 1440) return "Invalid end time";
  if ((endMin as number) - (startMin as number) < 15) return "A block must be at least 15 minutes";
  return null;
}

async function ownedHomeworkIds(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.homeworks.id })
    .from(schema.homeworks)
    .where(and(eq(schema.homeworks.userId, userId), inArray(schema.homeworks.id, ids)));
  return rows.map((r) => r.id);
}

/** Attach assignments (with homework title/due) to a set of blocks. */
async function withAssignments<T extends { id: string }>(userId: string, rows: T[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, assignments: [] as never[] }));
  const links = await db
    .select({
      blockId: schema.blockAssignments.blockId,
      homeworkId: schema.blockAssignments.homeworkId,
      done: schema.blockAssignments.done,
      title: schema.homeworks.title,
      dueDate: schema.homeworks.dueDate,
      hwStatus: schema.homeworks.status,
      estimatedMinutes: schema.homeworks.estimatedMinutes,
    })
    .from(schema.blockAssignments)
    .innerJoin(schema.homeworks, eq(schema.homeworks.id, schema.blockAssignments.homeworkId))
    .where(and(
      eq(schema.homeworks.userId, userId),
      inArray(schema.blockAssignments.blockId, rows.map((r) => r.id)),
    ))
    .orderBy(asc(schema.homeworks.dueDate));
  const byBlock = new Map<string, typeof links>();
  for (const l of links) {
    if (!byBlock.has(l.blockId)) byBlock.set(l.blockId, []);
    byBlock.get(l.blockId)!.push(l);
  }
  return rows.map((r) => ({ ...r, assignments: byBlock.get(r.id) ?? [] }));
}

// GET /api/blocks?date=YYYY-MM-DD | ?from=&to= | ?summary=1
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("blocks-read", getClientIp(request.headers), 60, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);

    // Coverage summary — planned block count per pending homework (for badges)
    if (searchParams.get("summary") === "1") {
      const rows = await db
        .select({
          homeworkId: schema.blockAssignments.homeworkId,
          planned: sql<number>`count(*) filter (where ${schema.studyBlocks.status} = 'planned')::int`,
          worked: sql<number>`count(*) filter (where ${schema.studyBlocks.status} = 'worked')::int`,
        })
        .from(schema.blockAssignments)
        .innerJoin(schema.studyBlocks, eq(schema.studyBlocks.id, schema.blockAssignments.blockId))
        .innerJoin(schema.homeworks, eq(schema.homeworks.id, schema.blockAssignments.homeworkId))
        .where(and(
          eq(schema.studyBlocks.userId, session.userId),
          eq(schema.homeworks.status, "pending"),
        ))
        .groupBy(schema.blockAssignments.homeworkId);
      const summary: Record<string, { planned: number; worked: number }> = {};
      for (const r of rows) summary[r.homeworkId] = { planned: r.planned, worked: r.worked };
      return NextResponse.json({ summary });
    }

    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const unworked = searchParams.get("unworked");

    let blocks;
    if (unworked === "1" && date && DATE_RE.test(date)) {
      // Carry-forward: planned blocks left unworked on days strictly before
      // `date`. String comparison — date columns compare lexicographically,
      // no Date/UTC conversion needed.
      blocks = await db
        .select()
        .from(schema.studyBlocks)
        .where(and(
          eq(schema.studyBlocks.userId, session.userId),
          eq(schema.studyBlocks.status, "planned"),
          lte(schema.studyBlocks.blockDate, sql`${date}::date - 1`),
        ))
        .orderBy(asc(schema.studyBlocks.blockDate), asc(schema.studyBlocks.startMin))
        .limit(50);
    } else if (date && DATE_RE.test(date)) {
      blocks = await db
        .select()
        .from(schema.studyBlocks)
        .where(and(eq(schema.studyBlocks.userId, session.userId), eq(schema.studyBlocks.blockDate, date)))
        .orderBy(asc(schema.studyBlocks.startMin));
    } else if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
      blocks = await db
        .select()
        .from(schema.studyBlocks)
        .where(and(
          eq(schema.studyBlocks.userId, session.userId),
          gte(schema.studyBlocks.blockDate, from),
          lte(schema.studyBlocks.blockDate, to),
        ))
        .orderBy(asc(schema.studyBlocks.blockDate), asc(schema.studyBlocks.startMin))
        .limit(500);
    } else {
      return NextResponse.json({ error: "date or from+to required" }, { status: 400 });
    }

    return NextResponse.json({ blocks: await withAssignments(session.userId, blocks) });
  } catch (err) {
    logError(err, { route: "blocks/GET" });
    return NextResponse.json({ error: "Failed to fetch blocks" }, { status: 500 });
  }
}

// POST /api/blocks — create a block and assign homework to it
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("blocks-post", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: BlockBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const timingErr = validateTiming(body.date, body.startMin, body.endMin);
    if (timingErr) return NextResponse.json({ error: timingErr }, { status: 400 });

    const hwIds = Array.isArray(body.homeworkIds) ? body.homeworkIds.filter(isValidUUID).slice(0, 20) : [];
    const owned = await ownedHomeworkIds(session.userId, hwIds);
    const validClientId = body.clientId && isValidUUID(body.clientId) ? body.clientId : undefined;

    const [block] = await db
      .insert(schema.studyBlocks)
      .values({
        id: validClientId,
        userId: session.userId,
        blockDate: body.date!,
        startMin: body.startMin!,
        endMin: body.endMin!,
        sharePublic: body.sharePublic !== false,
      })
      .returning();

    if (owned.length > 0) {
      await db.insert(schema.blockAssignments).values(
        owned.map((homeworkId) => ({ blockId: block.id, homeworkId })),
      );
    }

    const [withA] = await withAssignments(session.userId, [block]);
    return NextResponse.json({ block: withA });
  } catch (err) {
    logError(err, { route: "blocks/POST" });
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
}

// PATCH /api/blocks — move/resize, change assignments, mark worked/released
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("blocks-patch", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    let body: BlockBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!body.id || !isValidUUID(body.id)) {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(schema.studyBlocks)
      .where(and(eq(schema.studyBlocks.id, body.id), eq(schema.studyBlocks.userId, session.userId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const set: Record<string, unknown> = {};

    // Timing/date changes are validated against the merged result
    if (body.date !== undefined || body.startMin !== undefined || body.endMin !== undefined) {
      const date = body.date ?? existing.blockDate;
      const startMin = body.startMin ?? existing.startMin;
      const endMin = body.endMin ?? existing.endMin;
      const err = validateTiming(date, startMin, endMin);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      set.blockDate = date;
      set.startMin = startMin;
      set.endMin = endMin;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      set.status = body.status;
      set.workedAt = body.status === "worked" ? new Date() : null;
      if (body.status === "released" && body.releaseReason !== undefined) {
        if (!VALID_REASONS.has(body.releaseReason)) {
          return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
        }
        set.releaseReason = body.releaseReason;
      } else if (body.status !== "released") {
        set.releaseReason = null;
      }
    }

    if (body.sharePublic !== undefined) {
      set.sharePublic = Boolean(body.sharePublic);
    }

    if (Array.isArray(body.homeworkIds)) {
      const ids = body.homeworkIds.filter(isValidUUID).slice(0, 20);
      const owned = await ownedHomeworkIds(session.userId, ids);
      await db.delete(schema.blockAssignments).where(eq(schema.blockAssignments.blockId, existing.id));
      if (owned.length > 0) {
        await db.insert(schema.blockAssignments).values(
          owned.map((homeworkId) => ({ blockId: existing.id, homeworkId })),
        );
      }
    }

    if (Object.keys(set).length > 0) {
      await db
        .update(schema.studyBlocks)
        .set(set)
        .where(eq(schema.studyBlocks.id, existing.id));
    }

    const [updated] = await db
      .select()
      .from(schema.studyBlocks)
      .where(eq(schema.studyBlocks.id, existing.id))
      .limit(1);
    const [withA] = await withAssignments(session.userId, [updated]);
    return NextResponse.json({ block: withA });
  } catch (err) {
    logError(err, { route: "blocks/PATCH" });
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}

// DELETE /api/blocks?id=
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit("blocks-delete", getClientIp(request.headers), 30, 60000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id || !isValidUUID(id)) return NextResponse.json({ error: "Valid id is required" }, { status: 400 });

    const deleted = await db
      .delete(schema.studyBlocks)
      .where(and(eq(schema.studyBlocks.id, id), eq(schema.studyBlocks.userId, session.userId)))
      .returning({ id: schema.studyBlocks.id });

    if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "blocks/DELETE" });
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
}
