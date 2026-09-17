// Timezone helpers for wall-clock ↔ UTC-instant conversion using only Intl.
// Used for DST-safe recurrence: a recurring event must keep its *local wall
// time* (e.g. 9:00 AM in the user's timezone) even when DST shifts the UTC
// offset by an hour.

export interface WallClock {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number; // 0-23
  mi: number;
  s: number;
}

// Wall-clock fields of an instant in `tz`.
export function instantToWall(date: Date, tz: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  let h = get("hour");
  let d = get("day");
  // Some ICU builds report midnight as hour=24 with h23 — roll to next day 0:00
  if (h === 24) {
    h = 0;
    d += 1; // Date.UTC handles day overflow
  }
  return { y: get("year"), mo: get("month"), d, h, mi: get("minute"), s: get("second") };
}

// The instant whose wall clock in `tz` reads (y, mo, d, h, mi, s).
// Iterates the offset correction until it converges. For nonexistent times
// (spring-forward gap) it lands just after the gap; for ambiguous times
// (fall-back overlap) it resolves to the second occurrence — both are
// deterministic, which is all a recurrence needs.
export function wallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const desired = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const w = instantToWall(new Date(guess), tz);
    const actual = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
    const diff = actual - desired;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

// Add `days` calendar days to an instant while preserving its wall-clock time
// in `tz` — this is the DST-safe version of `date + days * 86400000`.
export function addDaysPreserveWall(instant: Date, days: number, tz: string): Date {
  const w = instantToWall(instant, tz);
  // Date.UTC normalizes day overflow across month/year boundaries
  return wallClockToUtc(w.y, w.mo, w.d + days, w.h, w.mi, w.s, tz);
}

// YYYY-MM-DD of an instant in `tz`.
export function dateStrInTimezone(instant: Date, tz: string): string {
  const w = instantToWall(instant, tz);
  // Date.UTC normalizes the h=24 day-rollover case
  return new Date(Date.UTC(w.y, w.mo - 1, w.d)).toISOString().slice(0, 10);
}
