import { getSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Waqt" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Parallelize independent queries (user + prayer settings).
  // Wrapped in try/catch so Neon cold-starts or connection issues
  // don't crash the Server Component (React error #441).
  const safeQuery = async <T,>(p: Promise<T[]>): Promise<T[]> => {
    try { return await p; } catch { return []; }
  };

  const [userRow, prayerSettingsRow] = await Promise.all([
    safeQuery(
      db
        .select({ displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1),
    ),
    safeQuery(
      db
        .select()
        .from(schema.prayerSettings)
        .where(eq(schema.prayerSettings.userId, session.userId))
        .limit(1),
    ),
  ]);

  const [user] = userRow;
  const [prayerSettings] = prayerSettingsRow;

  // Fetch today's prayer times if settings exist (depends on prayerSettings for timezone)
  let todayPrayerTimes: {
    fajr: string; sunrise: string; dhuhr: string;
    asr: string; maghrib: string; isha: string;
  } | null = null;

  if (prayerSettings) {
    // Validate timezone before using it — invalid timezones throw RangeError
    let tz = "UTC";
    if (prayerSettings.timezone) {
      try {
        new Date().toLocaleString("en-US", { timeZone: prayerSettings.timezone });
        tz = prayerSettings.timezone;
      } catch {
        // Invalid timezone in DB — fall back to UTC
      }
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

    const [todayTimes] = await safeQuery(
      db
        .select()
        .from(schema.prayerTimesCache)
        .where(
          and(
            eq(schema.prayerTimesCache.userId, session.userId),
            eq(schema.prayerTimesCache.date, today),
          ),
        )
        .limit(1),
    );

    if (todayTimes) {
      // Format times: "04:50:00" → "4:50 AM"
      const fmt = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        const hour = h % 12 || 12;
        const period = h < 12 ? "AM" : "PM";
        return `${hour}:${String(m).padStart(2, "0")} ${period}`;
      };
      todayPrayerTimes = {
        fajr: fmt(todayTimes.fajr),
        sunrise: fmt(todayTimes.sunrise),
        dhuhr: fmt(todayTimes.dhuhr),
        asr: fmt(todayTimes.asr),
        maghrib: fmt(todayTimes.maghrib),
        isha: fmt(todayTimes.isha),
      };
    }
  }

  return (
    <SettingsClient
      displayName={user?.displayName || null}
      prayerSettings={prayerSettings || null}
      todayPrayerTimes={todayPrayerTimes}
    />
  );
}
