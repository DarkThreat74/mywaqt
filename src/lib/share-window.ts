// Public share visibility window — UTC day boundaries relative to today.
// pastDays 0 means "nothing before today". futureDays N means "through the end
// of today + N days".

export function shareWindowUtc(futureDays: number, pastDays: number): { min: Date; max: Date } {
  const DAY = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const min = new Date(todayStart.getTime() - pastDays * DAY);
  const max = new Date(todayStart.getTime() + (futureDays + 1) * DAY - 1);
  return { min, max };
}

// Clamp a YYYY-MM-DD date string to the shared window's date bounds.
// Returns the clamped date, or null when the date is outside the window.
export function clampDateStr(
  dateStr: string,
  window: { min: Date; max: Date },
): string | null {
  const minDate = window.min.toISOString().slice(0, 10);
  const maxDate = window.max.toISOString().slice(0, 10);
  if (dateStr < minDate || dateStr > maxDate) return null;
  return dateStr;
}
