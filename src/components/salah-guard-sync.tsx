"use client";

import { useCallback, useEffect } from "react";
import { getPrayerWindowStart, getPrayerWindowEnd, type PrayerKey, type PrayerTimings } from "@/lib/prayer/checkin";
import { shieldNativeAvailable, syncShieldSchedule, consumeShieldPrayer, isShieldPausedToday, SHIELD_LS_KEY } from "@/lib/salah-shield-native";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Headless schedule sync for the native Salah Guard — pushes today's +
 * tomorrow's prayer windows (absolute epoch ms) and marked state into the
 * accessibility service's SharedPreferences. Renders nothing. The overlay
 * blocks ALL apps natively; this component only feeds it data.
 */
export default function SalahGuardSync() {
  const sync = useCallback(async () => {
    if (!shieldNativeAvailable()) return;
    try {
      const { getOfflineDB } = await import("@/lib/offline/db");
      const db = getOfflineDB();
      const now = new Date();
      const today = localDateStr(now);
      const timings = (await db.prayerTimes.get(today)) as (PrayerTimings & { fajr: string }) | undefined;
      if (!timings) return;

      const paused = isShieldPausedToday();
      const enabled = !paused && (() => { try { return localStorage.getItem(SHIELD_LS_KEY) === "1"; } catch { return false; } })();
      const logs = await db.prayerLogs.where("date").equals(today).toArray();
      const marked = new Set(logs.filter((l) => l.status !== "pending").map((l) => l.prayerName));
      const windows: { name: PrayerKey; startMs: number; endMs: number; marked: boolean }[] = [];
      for (let dayOff = 0; dayOff <= 1; dayOff++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOff);
        const dayStr = localDateStr(d);
        const t = dayOff === 0
          ? timings
          : ((await db.prayerTimes.get(dayStr)) as PrayerTimings | undefined);
        if (!t) continue;
        const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        for (const p of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as PrayerKey[]) {
          windows.push({
            name: p,
            startMs: midnight + getPrayerWindowStart(p, t) * 60_000,
            endMs: midnight + getPrayerWindowEnd(p, t) * 60_000,
            marked: dayOff === 0 && marked.has(p),
          });
        }
      }
      // No blockedApps — the service blocks every non-system app by default.
      void syncShieldSchedule({ enabled, windows });

      // The overlay's "Open Waqt" launches with shield_prayer — consume it
      // once and let check-in UIs preselect that prayer.
      const launchedPrayer = await consumeShieldPrayer();
      if (launchedPrayer) {
        window.dispatchEvent(new CustomEvent("waqt:prayer-updated", { detail: { prayerName: launchedPrayer } }));
      }
    } catch {
      // Dexie empty / unavailable — guard simply stays down.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(sync, 0);
    const t = setInterval(sync, 45_000);
    const onVis = () => { if (!document.hidden) void sync(); };
    const onUpdated = () => void sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("waqt:prayer-updated", onUpdated);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("waqt:prayer-updated", onUpdated);
    };
  }, [sync]);

  return null;
}
