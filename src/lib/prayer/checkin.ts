/**
 * Prayer check-in logic — smart masjid question windows.
 *
 * The "Did you pray in the masjid?" question only shows during specific windows
 * per prayer. Outside those windows, the question is hidden.
 *
 * Rules (from user spec):
 * - Dhuhr:  show masjid question from 12:00 PM to 3:00 PM
 * - Maghrib: show masjid question for 40 minutes after maghrib time
 * - Asr:    show masjid question as long as it's NOT in the last 30 minutes of Asr
 * - Isha:   show masjid question for the first 2 hours after Isha starts
 * - Fajr:   show masjid question as long as it's NOT in the last 30 minutes of Fajr
 *
 * After the prayer window has ended, the masjid question is ALWAYS asked
 * when the user confirms they forgot to log (late log flow).
 */

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface PrayerTimings {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

/**
 * Parse "HH:MM" or "HH:MM:SS" into minutes since midnight.
 */
export function parseMinutes(time: string): number {
  const cleaned = time.split(" ")[0].trim();
  const [h, m] = cleaned.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Parse a time string into "HH:MM" format (stripping seconds and timezone).
 */
export function parseTime(time: string): string {
  const cleaned = time.split(" ")[0].trim();
  const parts = cleaned.split(":");
  return `${parts[0]}:${parts[1]}`;
}

/**
 * Get the current time in minutes since midnight for a given timezone.
 */
export function getCurrentMinutesInTimezone(timezone: string): number {
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: timezone, hour12: false });
  const parts = localStr.match(/(\d+):(\d+):(\d+)/);
  if (!parts) return now.getHours() * 60 + now.getMinutes();
  return parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

/**
 * Get the end time (in minutes since midnight) for a prayer's window.
 *
 * Windows:
 * - Fajr → Sunrise
 * - Dhuhr → Asr
 * - Asr  → Maghrib
 * - Maghrib → Isha
 * - Isha → Fajr (next day) — can extend past midnight
 *
 * For Isha, the end time may be > 1440 (next day's Fajr in minutes from today's midnight).
 */
export function getPrayerWindowEnd(prayer: PrayerKey, timings: PrayerTimings): number {
  switch (prayer) {
    case "fajr":
      return parseMinutes(timings.sunrise);
    case "dhuhr":
      return parseMinutes(timings.asr);
    case "asr":
      return parseMinutes(timings.maghrib);
    case "maghrib":
      return parseMinutes(timings.isha);
    case "isha":
      // Isha ends at next day's Fajr — add 1440 (24h) to represent next day
      return parseMinutes(timings.fajr) + 1440;
    default:
      return 0;
  }
}

/**
 * Get the start time (in minutes since midnight) for a prayer's window.
 */
export function getPrayerWindowStart(prayer: PrayerKey, timings: PrayerTimings): number {
  return parseMinutes(timings[prayer]);
}

/**
 * Check if a prayer's window is currently open (can still be logged).
 * Returns true if the current time is within the prayer window.
 *
 * For Isha, the window extends to next day's Fajr, so we handle two cases:
 * - Before midnight: currentMinutes >= ishaStart
 * - After midnight: currentMinutes <= fajrStart (treated as still within Isha)
 */
export function isPrayerWindowOpen(
  prayer: PrayerKey,
  currentMinutes: number,
  timings: PrayerTimings,
): boolean {
  return getPrayerWindowState(prayer, currentMinutes, timings) === "open";
}

/**
 * Get the state of a prayer's window relative to the current time.
 * Returns "before" (not started yet), "open" (within window), or "ended" (window closed).
 */
export function getPrayerWindowState(
  prayer: PrayerKey,
  currentMinutes: number,
  timings: PrayerTimings,
): "before" | "open" | "ended" {
  const start = getPrayerWindowStart(prayer, timings);
  const end = getPrayerWindowEnd(prayer, timings);

  if (prayer === "isha") {
    // Isha window: from isha start today to fajr start tomorrow (crosses midnight)
    const ishaStart = parseMinutes(timings.isha);
    const fajrStart = parseMinutes(timings.fajr);
    if (currentMinutes >= ishaStart) {
      // After Isha start tonight — within window
      return "open";
    }
    // Before Isha start — could be afternoon (before) or after midnight (still in yesterday's Isha)
    if (currentMinutes < fajrStart) {
      // Before Fajr and before Isha start — must be after midnight, still in yesterday's Isha window
      return "open";
    }
    // After Fajr but before Isha start — afternoon/evening, Isha hasn't started yet
    return "before";
  }

  if (currentMinutes < start) return "before";
  if (currentMinutes > end) return "ended";
  return "open";
}

/**
 * Determine whether the "Did you pray in the masjid?" question should be shown
 * for the given prayer, based on the current time and prayer timings.
 *
 * All times are "HH:MM" in the user's local timezone.
 */
export function shouldShowMasjidQuestion(
  prayer: PrayerKey,
  currentMinutes: number,
  timings: PrayerTimings,
): boolean {
  switch (prayer) {
    case "fajr": {
      // Show as long as NOT in the last 30 minutes of Fajr (Fajr ends at sunrise)
      const fajrEnd = parseMinutes(timings.sunrise);
      const last30 = fajrEnd - 30;
      return currentMinutes < last30;
    }
    case "dhuhr": {
      // Show from 12:00 PM (720 min) to 3:00 PM (1080 min)
      return currentMinutes >= 720 && currentMinutes <= 1080;
    }
    case "asr": {
      // Show as long as NOT in the last 30 minutes of Asr (Asr ends at maghrib)
      const asrEnd = parseMinutes(timings.maghrib);
      const last30 = asrEnd - 30;
      return currentMinutes < last30;
    }
    case "maghrib": {
      // Show for 40 minutes after maghrib time
      const maghribStart = parseMinutes(timings.maghrib);
      const windowEnd = maghribStart + 40;
      return currentMinutes >= maghribStart && currentMinutes <= windowEnd;
    }
    case "isha": {
      // Show masjid question only in the first 2 hours after Isha starts.
      // After that (even within the Isha window until Fajr), don't ask.
      const ishaStart = parseMinutes(timings.isha);
      const twoHours = 120;
      const masjidWindowEnd = ishaStart + twoHours;
      if (currentMinutes >= ishaStart && currentMinutes <= masjidWindowEnd) {
        // Within the first 2 hours of tonight's Isha — show masjid question
        return true;
      }
      // After midnight but before Fajr — still in Isha's prayer window,
      // but past the 2-hour masjid question window — don't ask
      return false;
    }
    default:
      return false;
  }
}

/**
 * Get the display Asr time. With proper madhab selection (school=0/1),
 * the AlAdhan API already returns the correct Asr time, so no adjustment is needed.
 * Returns "HH:MM" format.
 */
export function getDisplayAsrTime(apiAsrTime: string): string {
  return parseTime(apiAsrTime);
}

/**
 * Check if a prayer time falls in the "Makruh" (disliked) window.
 * Makruh times for prayer:
 * - Sunrise to ~15 min after (about when the sun is rising)
 * - Noon (when sun is at zenith, ~5 min before dhuhr to dhuhr)
 * - Sunset (maghrib time to ~5 min after, when sun is setting)
 *
 * For our purposes, we'll consider a prayer as prayed in Makruh time if:
 * - The prayer was marked during the last 10 minutes before the next prayer
 *   (i.e., prayed right at the closing of the window)
 *
 * Actually, the standard Makruh times are:
 * 1. When the sun is rising (sunrise to ~15 min after)
 * 2. When the sun is at its zenith (noon, ~5 min before dhuhr)
 * 3. When the sun is setting (maghrib time, ~5 min after)
 *
 * But since we're tracking when the user MARKED the prayer (not when they actually prayed),
 * we'll use a simpler heuristic: if the prayer was marked within the last 20 minutes
 * of the prayer window, it's considered "close to Makruh" / prayed late.
 */
export function isPrayedInMakruhTime(
  prayer: PrayerKey,
  markedMinutes: number,
  timings: PrayerTimings,
): boolean {
  switch (prayer) {
    case "fajr": {
      // Makruh: prayed at or after sunrise (too late)
      const sunrise = parseMinutes(timings.sunrise);
      return markedMinutes >= sunrise;
    }
    case "dhuhr": {
      // Makruh: prayed in the last 10 min before Asr
      const asr = parseMinutes(timings.asr);
      return markedMinutes >= asr - 10;
    }
    case "asr": {
      // Makruh: prayed in the last portion before maghrib (sunset)
      const maghrib = parseMinutes(timings.maghrib);
      return markedMinutes >= maghrib - 10;
    }
    case "maghrib": {
      // Makruh: prayed more than a few minutes after maghrib (during sunset)
      const maghrib = parseMinutes(timings.maghrib);
      return markedMinutes >= maghrib + 5 && markedMinutes <= maghrib + 15;
    }
    case "isha": {
      // Not typically Makruh — Isha can be prayed until fajr
      return false;
    }
    default:
      return false;
  }
}

/**
 * Calculate the current streak (consecutive days where all 5 prayers were prayed/assumed_prayed).
 *
 * Per the "benefit of the doubt" principle: a partial day (e.g., 2/5 logged) does NOT
 * break the streak — the unmarked prayers are assumed prayed. The streak only breaks
 * when a past day has ZERO prayers logged (the user was completely inactive).
 *
 * @param prayerLogsByDate - Map of "YYYY-MM-DD" -> array of prayer logs for that day
 * @param todayStr - Today's date string "YYYY-MM-DD"
 * @returns The streak count (0 if today not complete, counts back from yesterday)
 */
export function calculateStreak(
  prayerLogsByDate: Map<string, Array<{ status: string }>>,
  todayStr: string,
): number {
  let streak = 0;

  // Start from today and go backwards
  const today = new Date(todayStr + "T00:00:00");

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;

    const logs = prayerLogsByDate.get(dateStr) || [];
    // Count prayers that are prayed or assumed_prayed (benefit of the doubt)
    const prayedCount = logs.filter(
      (l) => l.status === "prayed" || l.status === "assumed_prayed",
    ).length;

    if (prayedCount === 5) {
      streak++;
    } else if (prayedCount > 0) {
      // Partial day — benefit of the doubt: assume the rest were prayed.
      // Count it as a complete day for streak purposes.
      streak++;
    } else if (i > 0) {
      // No logs for a past day — user was completely inactive, streak breaks
      break;
    }
    // If i === 0 and no logs, skip today (streak can still continue from yesterday)
  }

  return streak;
}

/**
 * Calculate the best (longest) streak of consecutive complete days.
 * Uses the same "benefit of the doubt" principle as calculateStreak:
 * a partial day counts as complete (unmarked prayers assumed prayed).
 * Scans the full log history backwards from today.
 */
export function calculateBestStreak(
  prayerLogsByDate: Map<string, Array<{ status: string }>>,
  todayStr: string,
): number {
  let best = 0;
  let current = 0;

  // Walk backwards from today, checking each date for a complete day
  const today = new Date(todayStr + "T00:00:00");
  for (let i = 0; i < 3650; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;

    const logs = prayerLogsByDate.get(dateStr) || [];
    const prayedCount = logs.filter(
      (l) => l.status === "prayed" || l.status === "assumed_prayed",
    ).length;

    if (prayedCount >= 1) {
      // Any activity (even partial) counts as a complete day (benefit of the doubt)
      current++;
      if (current > best) best = current;
    } else {
      // Skip today if no logs yet (don't break the streak)
      if (i === 0 && prayedCount === 0) continue;
      current = 0;
    }
  }

  return best;
}
