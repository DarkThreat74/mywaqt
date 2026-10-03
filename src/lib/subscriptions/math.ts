// Renewal math for the subscription tracker.
// Dates are YYYY-MM-DD strings handled as local calendar days.

export type Cycle = "monthly" | "yearly";

function parseDay(s: string): Date {
  return new Date(s + "T00:00:00");
}

function toDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCycle(d: Date, cycle: Cycle): Date {
  // Preserve day-of-month, clamped to the target month's length —
  // Jan 31 monthly must land Feb 28/29, not Mar 3.
  const day = d.getDate();
  const next = new Date(d);
  next.setDate(1);
  if (cycle === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** Next renewal date on/after `from` (defaults to today). */
export function nextRenewal(startDate: string, cycle: Cycle, from: Date = new Date()): Date {
  const fromDay = parseDay(toDay(from));
  let d = parseDay(startDate);
  if (!Number.isFinite(d.getTime())) return fromDay;
  while (d < fromDay) d = addCycle(d, cycle);
  return d;
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  return Math.round((parseDay(toDay(date)).getTime() - parseDay(toDay(from)).getTime()) / 86400000);
}

/** Number of payments that have happened up to and including today. */
export function paymentsElapsed(startDate: string, cycle: Cycle, from: Date = new Date()): number {
  const fromDay = parseDay(toDay(from));
  let d = parseDay(startDate);
  if (!Number.isFinite(d.getTime())) return 0;
  if (d > fromDay) return 0; // first payment hasn't happened yet (e.g. trial start)
  let n = 0;
  while (d <= fromDay) {
    n++;
    d = addCycle(d, cycle);
  }
  return n;
}

/** Normalized monthly cost in cents. */
export function monthlyCents(amountCents: number, cycle: Cycle): number {
  return cycle === "monthly" ? amountCents : Math.round(amountCents / 12);
}

/** All renewal dates falling inside the given calendar month (year is full, month is 0-based). */
export function renewalsInMonth(
  sub: { startDate: string; cycle: Cycle },
  year: number,
  month: number,
): number[] {
  const days: number[] = [];
  let d = parseDay(sub.startDate);
  if (!Number.isFinite(d.getTime())) return days;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  // Walk forward until inside the month (bounded loop for safety)
  let guard = 0;
  while (d < monthStart && guard++ < 600) d = addCycle(d, sub.cycle);
  while (d <= monthEnd && guard++ < 1200) {
    days.push(d.getDate());
    d = addCycle(d, sub.cycle);
  }
  return days;
}

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
