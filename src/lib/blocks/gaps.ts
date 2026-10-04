// Free-gap computation for study blocks.
// Everything is minutes-from-local-midnight on a single user-local date.

export interface Interval {
  start: number; // minutes
  end: number;   // minutes
}

export const DAY_START = 5 * 60;   // 5:00 — matches the day view's default start
export const DAY_END = 24 * 60;    // midnight
export const MIN_GAP = 30;         // gaps shorter than 30 min aren't claimable
export const MIN_BLOCK = 15;       // blocks shorter than 15 min aren't useful

/**
 * Merge busy intervals and return the complement within [dayStart, dayEnd].
 * `busy` should include events, existing blocks, and short prayer holds
 * (the ~15 min around each prayer time — the prayer itself, not the window).
 */
export function freeGaps(
  busy: Interval[],
  dayStart: number = DAY_START,
  dayEnd: number = DAY_END,
  minGap: number = MIN_GAP,
): Interval[] {
  const sorted = busy
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: Math.max(i.start, dayStart), end: Math.min(i.end, dayEnd) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Interval[] = [];
  let cursor = dayStart;
  for (const i of sorted) {
    if (i.start > cursor) gaps.push({ start: cursor, end: i.start });
    cursor = Math.max(cursor, i.end);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });
  return gaps.filter((g) => g.end - g.start >= minGap);
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Default block inside a gap: first 60 min (or the whole gap if shorter). */
export function defaultBlockIn(gap: Interval): Interval {
  return { start: gap.start, end: Math.min(gap.start + 60, gap.end) };
}
