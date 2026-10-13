/**
 * Prayer Check-In State Machine
 * See AGENTS.md and PLAN.md Phase 4.
 *
 * Stages:
 *   0 = none (window not open or already resolved)
 *   1 = early (window just opened)
 *   2 = mid (50% elapsed)
 *   3 = closing (20 min before window ends)
 *
 * At window close: set assumed_prayed silently, no ledger charge.
 * "I will pray right now" → send urgent notification, stop further check-ins.
 */

import { MID_THRESHOLD_PCT, CLOSING_THRESHOLD_MINUTES } from "./thresholds";

export const STAGES = {
  NONE: 0,
  EARLY: 1,
  MID: 2,
  CLOSING: 3,
} as const;

// Re-export for backward compatibility
export { CLOSING_THRESHOLD_MINUTES };

export interface PrayerWindow {
  prayerName: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM" (start of next prayer, or end of day for Isha)
}

/**
 * Calculate which check-in stage is due for a prayer,
 * given the current time and the prayer's window.
 *
 * Returns the stage that should be fired NOW, or NONE if none is due.
 */
export function getCheckinStage(
  window: PrayerWindow,
  now: Date,
  currentStage: number,
): number {
  const { startTime, endTime } = window;

  // Parse prayer times as today's timestamps
  let start = parseTimeToday(startTime, now);
  let end = parseTimeToday(endTime, now);

  // Malformed window data produces NaN dates — every comparison against
  // NaN is false, which would report the window as perpetually open and
  // fire spurious check-ins. Treat it as no stage due.
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return STAGES.NONE;
  }

  // Handle windows that cross midnight (e.g., Isha ends at next day's Fajr).
  // If end < start, the window crosses midnight. Two cases:
  //   1. now >= start → we're in the evening portion; end is tomorrow → add 24h to end
  //   2. now < end   → we're in the morning portion after midnight; start was yesterday → subtract 24h from start
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (end < start) {
    if (now >= start) {
      end = new Date(end.getTime() + DAY_MS);
    } else if (now < end) {
      start = new Date(start.getTime() - DAY_MS);
    } else {
      // now is between end and start (e.g., afternoon between Fajr and Isha) — window not open
      return STAGES.NONE;
    }
  }

  if (now < start || now >= end) {
    return STAGES.NONE;
  }

  // Window is open — calculate elapsed percentage
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedPct = elapsedMs / totalMs;

  // Closing: within last 20 minutes
  const closingThreshold = new Date(end.getTime() - CLOSING_THRESHOLD_MINUTES * 60 * 1000);
  if (now >= closingThreshold) {
    return currentStage < STAGES.CLOSING ? STAGES.CLOSING : STAGES.NONE;
  }

  // Mid: 50% elapsed
  if (elapsedPct >= MID_THRESHOLD_PCT) {
    return currentStage < STAGES.MID ? STAGES.MID : STAGES.NONE;
  }

  // Early: window just opened (at EARLY_THRESHOLD_PCT)
  return currentStage < STAGES.EARLY ? STAGES.EARLY : STAGES.NONE;
}

/**
 * Check if a prayer window has closed.
 * If so, the prayer should be marked as assumed_prayed.
 *
 * @param window The prayer window (start/end times as "HH:MM")
 * @param now Current time
 * @param targetDate Optional: the date the prayer was for (YYYY-MM-DD).
 *   When provided, the window is computed relative to that date instead of today.
 *   This is critical for the cron that resolves yesterday's prayers —
 *   it must check if yesterday's window closed, not today's.
 */
export function isWindowClosed(window: PrayerWindow, now: Date, targetDate?: string): boolean {
  // If a target date is provided, parse times relative to that date
  const baseDate = targetDate ? new Date(targetDate + "T00:00:00") : now;
  const start = parseTimeToday(window.startTime, baseDate);
  let end = parseTimeToday(window.endTime, baseDate);

  // NaN window → `now >= NaN` is false forever → the prayer would stay
  // pending and never resolve. Treating unresolvable data as closed matches
  // the product rule: unmarked resolves to assumed_prayed, never a penalty.
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return true;
  }

  // Handle windows that cross midnight (e.g., Isha ends at next day's Fajr).
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (end < start) {
    // Window crosses midnight — end is on the next day
    end = new Date(end.getTime() + DAY_MS);
  }

  return now >= end;
}

/**
 * Parse "HH:MM" into minutes since midnight.
 */
function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Parse "HH:MM" into a Date for today.
 */
function parseTimeToday(timeStr: string, base: Date): Date {
  if (!timeStr || typeof timeStr !== "string") return new Date(NaN);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Get the end time for a prayer (start of next prayer).
 * Isha ends at the end of the day (23:59).
 */
export function getPrayerWindow(
  prayerName: PrayerWindow["prayerName"],
  timings: { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string },
): PrayerWindow {
  // With proper madhab selection, the AlAdhan API returns the correct Asr time.
  // No +1 hour adjustment needed.
  const startTimes: Record<PrayerWindow["prayerName"], string> = {
    fajr: timings.fajr,
    dhuhr: timings.dhuhr,
    asr: timings.asr,
    maghrib: timings.maghrib,
    isha: timings.isha,
  };

  const endTimes: Record<PrayerWindow["prayerName"], string> = {
    fajr: timings.sunrise,
    dhuhr: timings.asr, // Dhuhr ends when Asr starts
    asr: timings.maghrib,
    maghrib: timings.isha,
    // Isha ends at next day's Fajr — represented as fajr time + 24h in minutes
    isha: `${String(Math.floor((parseMinutes(timings.fajr) + 1440) / 60) % 24).padStart(2, "0")}:${String((parseMinutes(timings.fajr) + 1440) % 60).padStart(2, "0")}`,
  };

  return {
    prayerName,
    startTime: startTimes[prayerName],
    endTime: endTimes[prayerName],
  };
}
