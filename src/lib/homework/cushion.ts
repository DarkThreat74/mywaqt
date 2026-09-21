/**
 * Study cushion — Shovel-style "is there enough time before the deadline?"
 * Compares a homework's remaining estimated effort against the user's free
 * waking hours (08:00–22:00, minus calendar events) between now and the due
 * date. Returns the shortfall in minutes, or null when there's enough time
 * or not enough data to say.
 */
export function computeCushion(args: {
  estimatedMinutes: number | null;
  plannedMinutes: number; // future study sessions already scheduled for this hw
  now: Date;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string | null; // HH:MM[:SS]
  busy: Array<{ startAt: Date; endAt: Date }>;
}): number | null {
  const { estimatedMinutes, plannedMinutes, now, dueDate, dueTime, busy } = args;
  if (!estimatedMinutes) return null;

  const DAY_START = 8; // 08:00
  const DAY_END = 22; // 22:00

  // Deadline instant — due date at the due time, else end of day
  const deadline = new Date(`${dueDate}T${(dueTime ?? "23:59").slice(0, 5)}:00`);
  if (isNaN(deadline.getTime()) || deadline.getTime() <= now.getTime()) {
    // Already due — needed work that isn't done is all shortfall
    const remaining = estimatedMinutes - plannedMinutes;
    return remaining > 0 ? remaining : null;
  }

  // Free minutes per day: waking window minus busy overlap
  let freeMin = 0;
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const lastDay = new Date(deadline);
  lastDay.setHours(0, 0, 0, 0);

  while (day.getTime() <= lastDay.getTime()) {
    const winStart = new Date(day); winStart.setHours(DAY_START, 0, 0, 0);
    const winEnd = new Date(day); winEnd.setHours(DAY_END, 0, 0, 0);
    const start = new Date(Math.max(winStart.getTime(), now.getTime()));
    const end = new Date(Math.min(winEnd.getTime(), deadline.getTime()));
    if (end.getTime() > start.getTime()) {
      let dayFree = (end.getTime() - start.getTime()) / 60000;
      for (const ev of busy) {
        const ovStart = Math.max(ev.startAt.getTime(), start.getTime());
        const ovEnd = Math.min(ev.endAt.getTime(), end.getTime());
        if (ovEnd > ovStart) dayFree -= (ovEnd - ovStart) / 60000;
      }
      freeMin += Math.max(0, dayFree);
    }
    day.setDate(day.getDate() + 1);
  }

  const remaining = estimatedMinutes - plannedMinutes;
  if (remaining <= 0) return null; // already fully planned
  const shortfall = remaining - freeMin;
  return shortfall > 0 ? Math.round(shortfall) : null;
}
