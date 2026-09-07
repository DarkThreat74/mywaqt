import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import DayViewClient from "./DayViewClient";
import DayDateHeader from "./DayDateHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar · Waqt" };

export default async function DayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

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
  // Use a manual format to avoid locale-dependent output.
  const nowInTz = new Date().toLocaleString("en-US", { timeZone: userTimezone });
  const today = new Date(nowInTz).toISOString().split("T")[0];

  const params = await searchParams;
  const date = params.date || today;

  return (
    <div className="overflow-x-hidden">
      {/* Date header is client-side so the cached shell works across days offline */}
      <DayDateHeader date={date} />
      <DayViewClient date={date} />
    </div>
  );
}
