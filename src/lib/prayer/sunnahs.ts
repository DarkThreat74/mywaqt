/**
 * Sunnah prayer definitions per madhab.
 *
 * Each sunnah is associated with a fard prayer and has a position (before/after).
 * The `key` is a stable identifier used in the database.
 *
 * Rules enforced by the API:
 * - "after" sunnahs cannot be logged until the associated fard is logged as "prayed"
 * - No sunnah for a prayer can be logged once the NEXT fard prayer's time has started
 * - Witr is special — it can be logged after Isha is prayed, until Fajr starts
 */

export type Madhab = "standard" | "hanafi";
export type FardPrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type SunnahPosition = "before" | "after" | "standalone";

export interface SunnahDefinition {
  key: string;
  label: string;
  rakats: number;
  position: SunnahPosition;
  associatedFard: FardPrayer;
  category: "muakkadah" | "ghayr_muakkadah" | "wajib" | "raghibah" | "nafl_muakkadah" | "nafl";
  /** The next fard prayer that locks this sunnah (e.g., Dhuhr sunnahs lock at Asr) */
  locksAt: FardPrayer | null;
}

/**
 * Sunnah definitions for the standard (Shafi'i, Maliki, Hanbali) madhab.
 * Rawatib Mu'akkadah: 10 rak'ahs
 * Non-confirmed: additional before/after prayers
 */
const STANDARD_SUNNAHS: SunnahDefinition[] = [
  {
    key: "fajr_before",
    label: "2 before Fajr",
    rakats: 2,
    position: "before",
    associatedFard: "fajr",
    category: "muakkadah",
    locksAt: "fajr",
  },
  {
    key: "dhuhr_before",
    label: "2 before Dhuhr",
    rakats: 2,
    position: "before",
    associatedFard: "dhuhr",
    category: "muakkadah",
    locksAt: "asr",
  },
  {
    key: "dhuhr_after",
    label: "2 after Dhuhr",
    rakats: 2,
    position: "after",
    associatedFard: "dhuhr",
    category: "muakkadah",
    locksAt: "asr",
  },
  {
    key: "asr_before",
    label: "4 before Asr",
    rakats: 4,
    position: "before",
    associatedFard: "asr",
    category: "ghayr_muakkadah",
    locksAt: "maghrib",
  },
  {
    key: "maghrib_after",
    label: "2 after Maghrib",
    rakats: 2,
    position: "after",
    associatedFard: "maghrib",
    category: "muakkadah",
    locksAt: "isha",
  },
  {
    key: "isha_after",
    label: "2 after Isha",
    rakats: 2,
    position: "after",
    associatedFard: "isha",
    category: "muakkadah",
    locksAt: null, // No next prayer — Isha is last; Witr follows
  },
  {
    key: "witr",
    label: "Witr (3 rak'ahs)",
    rakats: 3,
    position: "standalone",
    associatedFard: "isha",
    category: "muakkadah",
    locksAt: "fajr", // Witr can be prayed until Fajr starts
  },
  // ── Nafl prayers (voluntary) ──
  {
    key: "duha",
    label: "Duha (2 rak'ahs)",
    rakats: 2,
    position: "standalone",
    associatedFard: "fajr", // Associated with Fajr window conceptually
    category: "nafl",
    locksAt: "dhuhr", // Duha window is from ~20 min after sunrise until Dhuhr
  },
  {
    key: "awwabin",
    label: "Awwabin (6 rak'ahs)",
    rakats: 6,
    position: "after",
    associatedFard: "maghrib",
    category: "nafl",
    locksAt: "isha", // Awwabin is prayed after Maghrib, before Isha
  },
];

/**
 * Sunnah definitions for the Hanafi madhab.
 * Rawatib Mu'akkadah: 12 rak'ahs (4 before Dhuhr instead of 2)
 * Witr is wajib (3 rak'ahs minimum)
 */
const HANAFI_SUNNAHS: SunnahDefinition[] = [
  {
    key: "fajr_before",
    label: "2 before Fajr",
    rakats: 2,
    position: "before",
    associatedFard: "fajr",
    category: "muakkadah",
    locksAt: "dhuhr",
  },
  {
    key: "dhuhr_before",
    label: "4 before Dhuhr",
    rakats: 4,
    position: "before",
    associatedFard: "dhuhr",
    category: "muakkadah",
    locksAt: "asr",
  },
  {
    key: "dhuhr_after",
    label: "2 after Dhuhr",
    rakats: 2,
    position: "after",
    associatedFard: "dhuhr",
    category: "muakkadah",
    locksAt: "asr",
  },
  {
    key: "asr_before",
    label: "4 before Asr",
    rakats: 4,
    position: "before",
    associatedFard: "asr",
    category: "ghayr_muakkadah",
    locksAt: "maghrib",
  },
  {
    key: "maghrib_after",
    label: "2 after Maghrib",
    rakats: 2,
    position: "after",
    associatedFard: "maghrib",
    category: "muakkadah",
    locksAt: "isha",
  },
  {
    key: "isha_after",
    label: "2 after Isha",
    rakats: 2,
    position: "after",
    associatedFard: "isha",
    category: "muakkadah",
    locksAt: null,
  },
  {
    key: "witr",
    label: "Witr (3 rak'ahs, wajib)",
    rakats: 3,
    position: "standalone",
    associatedFard: "isha",
    category: "wajib",
    locksAt: "fajr",
  },
  // ── Nafl prayers (voluntary) ──
  {
    key: "duha",
    label: "Duha (2 rak'ahs)",
    rakats: 2,
    position: "standalone",
    associatedFard: "fajr",
    category: "nafl",
    locksAt: "dhuhr",
  },
  {
    key: "awwabin",
    label: "Awwabin (6 rak'ahs)",
    rakats: 6,
    position: "after",
    associatedFard: "maghrib",
    category: "nafl",
    locksAt: "isha",
  },
];

/**
 * Get the sunnah definitions for a given madhab.
 */
export function getSunnahsForMadhab(madhab: Madhab | string | null): SunnahDefinition[] {
  return madhab === "hanafi" ? HANAFI_SUNNAHS : STANDARD_SUNNAHS;
}

/**
 * Get sunnahs associated with a specific fard prayer.
 */
export function getSunnahsForFard(
  fard: FardPrayer,
  madhab: Madhab | string | null,
): SunnahDefinition[] {
  return getSunnahsForMadhab(madhab).filter((s) => s.associatedFard === fard);
}

/**
 * The order of fard prayers in the day.
 */
export const PRAYER_ORDER: FardPrayer[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/**
 * Get the next fard prayer after the given one.
 * Returns null for Isha (no next prayer until Fajr).
 */
export function getNextFard(prayer: FardPrayer): FardPrayer | null {
  const idx = PRAYER_ORDER.indexOf(prayer);
  if (idx < 0 || idx >= PRAYER_ORDER.length - 1) return null;
  return PRAYER_ORDER[idx + 1];
}
