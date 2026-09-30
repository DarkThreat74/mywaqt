"use client";

import { useEffect, useState } from "react";
import MasjidFinder from "@/components/masjid-finder";

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

  useEffect(() => {
    const todayStr = new Date().toLocaleDateString("en-CA");
    fetch(`/api/prayer-times?date=${todayStr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPrayerTimes({
            fajr: data.fajr,
            sunrise: data.sunrise,
            dhuhr: data.dhuhr,
            asr: data.asr,
            maghrib: data.maghrib,
            isha: data.isha,
          });
        }
      })
      .catch(() => null);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <MasjidFinder prayerTimes={prayerTimes} />
    </div>
  );
}
