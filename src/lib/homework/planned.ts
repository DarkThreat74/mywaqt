import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Keeps a homework's "planned study session" in sync with a linked events row.
 * The event is what makes the session render on the calendar and fire the
 * normal 15-min event reminder — one pipeline, no duplicate machinery.
 *
 * Completed/deleted homework, or homework with no planned start, gets its
 * event removed. Returns the event id that should be stored on the homework
 * (or null when there is none).
 */
export async function syncPlannedEvent(
  userId: string,
  hw: {
    id: string;
    title: string;
    status: string;
    plannedStartAt?: string | null;
    plannedEndAt?: string | null;
    plannedEventId?: string | null;
    classColor?: string | null;
  },
): Promise<string | null> {
  const wantsEvent = hw.status !== "completed" && !!hw.plannedStartAt;

  if (!wantsEvent) {
    if (hw.plannedEventId) {
      await db
        .delete(schema.events)
        .where(and(eq(schema.events.id, hw.plannedEventId), eq(schema.events.userId, userId)));
    }
    return null;
  }

  const startAt = new Date(hw.plannedStartAt!);
  if (isNaN(startAt.getTime())) return hw.plannedEventId ?? null;
  const endAt = hw.plannedEndAt ? new Date(hw.plannedEndAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
  const title = `Study: ${hw.title}`;

  if (hw.plannedEventId) {
    await db
      .update(schema.events)
      .set({ title, startAt, endAt, color: hw.classColor ?? null })
      .where(and(eq(schema.events.id, hw.plannedEventId), eq(schema.events.userId, userId)));
    return hw.plannedEventId;
  }

  const [row] = await db
    .insert(schema.events)
    .values({
      userId,
      title,
      startAt,
      endAt,
      type: "block",
      color: hw.classColor ?? null,
      createdVia: "homework",
    })
    .returning({ id: schema.events.id });
  return row?.id ?? null;
}
