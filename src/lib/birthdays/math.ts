// Birthday math — all local-calendar-day based.

export interface BDayLike {
  birthMonth: number;
  birthDay: number;
  birthYear: number | null;
}

function toDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The next occurrence of this birthday on/after `from` (defaults to today). */
export function nextBirthday(b: BDayLike, from: Date = new Date()): Date {
  const today = toDay(from);
  let candidate = new Date(today.getFullYear(), b.birthMonth - 1, b.birthDay);
  // Feb 29 birthdays observe on Feb 28 in non-leap years (candidate overflows to Mar 1)
  if (candidate.getMonth() !== b.birthMonth - 1) {
    candidate = new Date(today.getFullYear(), b.birthMonth, 0); // last day of prior month
  }
  if (candidate < today) {
    candidate = new Date(today.getFullYear() + 1, b.birthMonth - 1, b.birthDay);
    if (candidate.getMonth() !== b.birthMonth - 1) {
      candidate = new Date(today.getFullYear() + 1, b.birthMonth, 0);
    }
  }
  return candidate;
}

/** Does this birthday fall on the given calendar day? Feb 29 birthdays show
 *  on Feb 28 in non-leap years, matching nextBirthday()'s observation rule. */
export function isBirthdayOn(b: BDayLike, year: number, month: number, day: number): boolean {
  if (b.birthMonth === month && b.birthDay === day) return true;
  if (b.birthMonth === 2 && b.birthDay === 29 && month === 2 && day === 28) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return !leap;
  }
  return false;
}

export function daysUntilBirthday(b: BDayLike, from: Date = new Date()): number {
  return Math.round((nextBirthday(b, from).getTime() - toDay(from).getTime()) / 86400000);
}

/** Age the person turns on their next birthday — null when year unknown. */
export function turningAge(b: BDayLike, from: Date = new Date()): number | null {
  if (!b.birthYear) return null;
  return nextBirthday(b, from).getFullYear() - b.birthYear;
}

const ZODIAC: [number, number, string][] = [
  [1, 20, "Capricorn"], [2, 19, "Aquarius"], [3, 21, "Pisces"],
  [4, 20, "Aries"], [5, 21, "Taurus"], [6, 21, "Gemini"],
  [7, 23, "Cancer"], [8, 23, "Leo"], [9, 23, "Virgo"],
  [10, 23, "Libra"], [11, 22, "Scorpio"], [12, 22, "Sagittarius"],
];

/** Western zodiac sign from month/day. */
export function zodiac(month: number, day: number): string {
  for (const [m, d, sign] of ZODIAC) {
    if (month < m || (month === m && day < d)) return sign;
  }
  return "Capricorn";
}

/** Long-form date label — "October 14". */
export function birthdayLabel(b: BDayLike): string {
  return new Date(2000, b.birthMonth - 1, b.birthDay).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}
