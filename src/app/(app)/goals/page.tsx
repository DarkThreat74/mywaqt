import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq, desc } from "drizzle-orm";
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

  const [goals, homework, classes, habits, habitLogs, notes] = await Promise.all([
    safeQuery(db.select().from(schema.goals).where(eq(schema.goals.userId, session.userId)).orderBy(schema.goals.sortOrder, schema.goals.createdAt)),
    safeQuery(db.select().from(schema.homeworks).where(eq(schema.homeworks.userId, session.userId)).orderBy(schema.homeworks.dueDate)),
    safeQuery(db.select().from(schema.classes).where(eq(schema.classes.userId, session.userId)).orderBy(schema.classes.sortOrder, schema.classes.createdAt)),
    safeQuery(db.select().from(schema.habits).where(eq(schema.habits.userId, session.userId)).orderBy(schema.habits.sortOrder, schema.habits.createdAt)),
    safeQuery(db.select().from(schema.habitLogs).where(eq(schema.habitLogs.userId, session.userId))),
    safeQuery(db.select().from(schema.notes).where(eq(schema.notes.userId, session.userId)).orderBy(desc(schema.notes.updatedAt))),
  ]);

  // Client-side filter for habit logs by date (date column is text YYYY-MM-DD)
  const recentHabitLogs = habitLogs.filter((l) => l.date >= habitLogCutoff);

  return (
    <GoalsPageClient
      initialGoals={goals as Goal[]}
      initialHomework={homework as Homework[]}
      initialClasses={classes as Class[]}
      initialHabits={habits as Habit[]}
      initialHabitLogs={recentHabitLogs as HabitLog[]}
      initialNotes={notes as Note[]}
    />
  );
}
