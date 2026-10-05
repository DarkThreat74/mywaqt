/** Human relative time for a future date — "in 3y 9m", "in 6mo", "in 12d". */
export function relativeTarget(dateStr: string): string | null {
  const target = new Date(dateStr + "T00:00:00").getTime();
  if (!Number.isFinite(target)) return null;
  const days = Math.round((target - Date.now()) / 86400000);
  if (days < 0) return "date passed";
  if (days < 14) return days === 0 ? "today" : `in ${days}d`;
  if (days < 60) return `in ${Math.round(days / 7)}w`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `in ${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `in ${years}y` : `in ${years}y ${rem}m`;
}
