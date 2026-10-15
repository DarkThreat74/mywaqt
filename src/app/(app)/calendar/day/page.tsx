import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { todayInTimezone } from "@/lib/prayer/checkin";
import DayShell from "./DayShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar · Waqt" };

export default async function DayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/api/auth/logout");

  // Get user's timezone so we compute "today" in their local time, not server UTC.
  // Wrap in try/catch — if the DB query fails (Neon cold start, timeout, etc.)
  // we fall back to UTC rather than crashing the entire page.
  let userTimezone = "UTC";
  try {
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    if (settings?.timezone) {
      // Validate the timezone is usable — invalid timezones throw
      try {
        new Date().toLocaleString("en-US", { timeZone: settings.timezone });
        userTimezone = settings.timezone;
      } catch {
        // Invalid timezone in DB — fall back to UTC
      }
    }
  } catch {
    // DB error — fall back to UTC, the client will correct via local time
  }

  // Compute today's date in the user's timezone.
  const today = todayInTimezone(userTimezone);

  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && !isNaN(new Date(params.date + "T00:00:00Z").getTime())
    ? params.date
    : today;

  // DayShell owns client-side date state — prev/next day swaps are instant
  // (refetch only) instead of a full SSR navigation per day.
  return <DayShell date={date} />;
}
