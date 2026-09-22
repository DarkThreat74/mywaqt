/**
 * Local cache for prayer settings (timezone, calculation method, madhab).
 * Stored in localStorage so the app never needs a network round-trip
 * to know the user's timezone — critical for instant offline rendering.
 */

const SETTINGS_KEY = "waqt-prayer-settings";

export interface CachedPrayerSettings {
  timezone: string;
  calculationMethod: number;
  madhab: string | null;
  latitude: string;
  longitude: string;
}

export function getCachedPrayerSettings(): CachedPrayerSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPrayerSettings;
  } catch {
    return null;
  }
}

export function setCachedPrayerSettings(settings: CachedPrayerSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage might be full or disabled — non-critical
  }
}

export function clearCachedPrayerSettings(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // non-critical
  }
}

/* ── Hayd periods ─────────────────────────────────────────────────────────
 * Cached so the UI knows which days are excused while fully offline.
 * Sensitive data: keyed to nothing identifying, cleared on logout with the
 * rest of the settings cache.
 */
const HAYD_KEY = "waqt-hayd-periods";

export interface CachedHaydPeriod {
  id: string;
  startDate: string;
  endDate: string | null;
}

export function getCachedHaydPeriods(): CachedHaydPeriod[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HAYD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedHaydPeriods(periods: CachedHaydPeriod[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HAYD_KEY, JSON.stringify(periods));
  } catch {
    // non-critical
  }
}

/** Client-side hayd check — same semantics as the server helper. */
export function isHaydDate(date: string, periods = getCachedHaydPeriods()): boolean {
  return periods.some((p) => date >= p.startDate && (p.endDate === null || date <= p.endDate));
}
