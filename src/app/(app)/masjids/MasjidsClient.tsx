"use client";

import { useEffect, useState } from "react";
import MasjidFinder from "@/components/masjid-finder";
import { sanitizeTimings } from "@/lib/prayer/checkin";

interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export default function MasjidsClient() {
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString("en-CA");
    fetch(`/api/prayer-times?date=${todayStr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const safe = sanitizeTimings(data);
        if (safe) setPrayerTimes(safe);
        // Staleness stamp: iqamah offsets derive from these times, so the UI
        // must say which date/place they actually describe.
        if (data?.date) {
          const d = new Date(`${data.date}T12:00:00`);
          const dateLabel = isNaN(d.getTime())
            ? data.date
            : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const tzLabel = typeof data.timezone === "string"
            ? data.timezone.split("/").pop()?.replace(/_/g, " ")
            : null;
          setAsOf(tzLabel ? `${dateLabel} · ${tzLabel}` : dateLabel);
        }
      })
      .catch(() => null);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <MasjidFinder prayerTimes={prayerTimes} prayerTimesAsOf={asOf} />
    </div>
  );
}
