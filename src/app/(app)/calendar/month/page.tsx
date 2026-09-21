import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { todayInTimezone } from "@/lib/prayer/checkin";
import MonthViewClient from "./MonthViewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Month · Waqt" };

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // "This month" must be computed in the user's timezone — server UTC can be
  // a month ahead/behind near a boundary. Fall back to UTC on any failure.
  let userTimezone = "UTC";
  try {
    const [settings] = await db
      .select({ timezone: schema.prayerSettings.timezone })
      .from(schema.prayerSettings)
      .where(eq(schema.prayerSettings.userId, session.userId))
      .limit(1);
    if (settings?.timezone) userTimezone = settings.timezone;
  } catch { /* fall back to UTC */ }

  const [nowY, nowM] = todayInTimezone(userTimezone).split("-").map(Number);

  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : nowY;
  const month = params.month ? parseInt(params.month, 10) : nowM;
  const valid = Number.isInteger(year) && year >= 1970 && year <= 2100
    && Number.isInteger(month) && month >= 1 && month <= 12;

  return <MonthViewClient year={valid ? year : nowY} month={valid ? month : nowM} />;
}
