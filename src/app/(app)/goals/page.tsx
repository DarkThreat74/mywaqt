import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq, desc, asc, gte, and } from "drizzle-orm";
import GoalsPageClient from "./GoalsPageClient";
import type { Goal, Homework, Class, Habit, HabitLog, Note } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals · Waqt" };

export default async function GoalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Only fetch habit logs from the last 90 days to keep the payload small
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const habitLogCutoff = ninetyDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch all data for the unified goals page in parallel.
  // Each query is individually try-caught so a single Neon cold-start
  // or connection hiccup degrades gracefully instead of crashing the
  // entire Server Component render (React error #441).
  const safeQuery = async <T,>(p: Promise<T[]>): Promise<T[]> => {
    try { return await p; } catch { return []; }
  };

  const [goals, homework, classes, habits, habitLogs, notes, subtasks] = await Promise.all([
    safeQuery(db.select().from(schema.goals).where(eq(schema.goals.userId, session.userId)).orderBy(schema.goals.sortOrder, schema.goals.createdAt).limit(500)),
    safeQuery(db.select().from(schema.homeworks).where(eq(schema.homeworks.userId, session.userId)).orderBy(schema.homeworks.dueDate).limit(500)),
    safeQuery(db.select().from(schema.classes).where(eq(schema.classes.userId, session.userId)).orderBy(schema.classes.sortOrder, schema.classes.createdAt).limit(200)),
    safeQuery(db.select().from(schema.habits).where(eq(schema.habits.userId, session.userId)).orderBy(schema.habits.sortOrder, schema.habits.createdAt).limit(200)),
    safeQuery(db.select().from(schema.habitLogs).where(and(eq(schema.habitLogs.userId, session.userId), gte(schema.habitLogs.date, habitLogCutoff))).limit(5000)),
    safeQuery(db.select().from(schema.notes).where(eq(schema.notes.userId, session.userId)).orderBy(desc(schema.notes.updatedAt)).limit(500)),
    safeQuery(db.select().from(schema.homeworkSubtasks).where(eq(schema.homeworkSubtasks.userId, session.userId)).orderBy(asc(schema.homeworkSubtasks.sortOrder), asc(schema.homeworkSubtasks.createdAt)).limit(2000)),
  ]);

  // Attach checklist steps to their homework (one grouped pass, no N+1)
  const subtasksByHw = new Map<string, typeof subtasks>();
  for (const st of subtasks) {
    if (!subtasksByHw.has(st.homeworkId)) subtasksByHw.set(st.homeworkId, []);
    subtasksByHw.get(st.homeworkId)!.push(st);
  }
  const homeworkWithSubs = homework.map((h) => ({ ...h, subtasks: subtasksByHw.get(h.id) ?? [] }));

  // habitLogs already filtered by date in SQL (last 90 days)

  return (
    <GoalsPageClient
      initialGoals={goals as Goal[]}
      initialHomework={homeworkWithSubs as Homework[]}
      initialClasses={classes as Class[]}
      initialHabits={habits as Habit[]}
      initialHabitLogs={habitLogs as HabitLog[]}
      initialNotes={notes as Note[]}
    />
  );
}
