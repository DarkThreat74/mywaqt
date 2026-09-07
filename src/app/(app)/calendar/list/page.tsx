import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import ListViewClient from "./ListViewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "List · Waqt" };

export default async function ListPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Get user's timezone — wrap in try/catch to survive DB errors
  let userTimezone = "UTC";
  try {
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    if (settings?.timezone) {
      try {
        new Date().toLocaleString("en-US", { timeZone: settings.timezone });
        userTimezone = settings.timezone;
      } catch {
        // Invalid timezone — fall back to UTC
      }
    }
  } catch {
    // DB error — fall back to UTC
  }

  const nowInTz = new Date().toLocaleString("en-US", { timeZone: userTimezone });
  const today = new Date(nowInTz).toISOString().split("T")[0];

  return <ListViewClient today={today} />;
}
