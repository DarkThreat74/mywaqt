// Lifetime prayer view — pure aggregation, no I/O.
// Builds a baligh→today grid of ~28-day cells: backfill era shows deterministically
// distributed qada slots (filled as real prayers are logged), tracked era shows
// actual prayed/missed counts.

export const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];
export type OwedMap = Record<PrayerKey, number>;

export interface LifetimeInput {
  userId: string;
  balighDate: string; // YYYY-MM-DD
  initialOwed: Partial<OwedMap>;
  owedNow?: Partial<OwedMap>;
  prayedByPrayer?: Partial<Record<string, number>>;
  qadaLoggedByPrayer?: Partial<Record<string, number>>;
  prayedByDate: Record<string, number>;
  missedByDate?: Record<string, number>;
  today?: string;
}

export type CellState = "future" | "tracked" | "owed" | "filled" | "neutral";

export interface PrayerSlot { owed: number; filled: number }

export interface LifetimeCell {
  index: number;
  start: string;
  end: string;
  year: number;
  state: CellState;
  intensity: number;
  pct: number | null;
  days: number;
  trackedDays: number;
  prayed: number;
  missed: number;
  owed: number;
  filled: number;
  neutralDays: number;
  byPrayer: Partial<Record<PrayerKey, PrayerSlot>>;
}

export interface LifetimeResult {
  cells: LifetimeCell[];
  years: { year: number; cells: LifetimeCell[] }[];
  totals: {
    days: number;
    totalPrayed: number;
    owedRemaining: number;
    madeUp: number;
    owedSlots: number;
    pctPrayed: number | null;
    trackingStart: string | null;
  };
}

const DAY_MS = 86400000;
const WINDOW = 28;

function toDayIndex(dateStr: string, epoch: number): number {
  return Math.round((Date.parse(dateStr + "T00:00:00Z") - epoch) / DAY_MS);
}
function fromDayIndex(idx: number, epoch: number): string {
  return new Date(epoch + idx * DAY_MS).toISOString().slice(0, 10);
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLifetime(input: LifetimeInput): LifetimeResult {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const epoch = Date.parse(input.balighDate + "T00:00:00Z");
  const todayIdx = toDayIndex(today, epoch);
  const totalDays = Math.max(0, todayIdx + 1);

  const logDates = [...Object.keys(input.prayedByDate), ...Object.keys(input.missedByDate ?? {})].sort();
  const trackingStartIdx = logDates.length ? Math.max(0, toDayIndex(logDates[0], epoch)) : totalDays;
  const backfillDays = Math.max(0, trackingStartIdx);

  const owed0 = (k: PrayerKey) => Math.max(0, Math.floor(input.initialOwed?.[k] ?? 0));
  const filledByPrayer: Record<PrayerKey, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const missedByPrayer: Record<PrayerKey, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const slots = new Map<number, Partial<Record<PrayerKey, PrayerSlot>>>();
  const bump = (d: number, p: PrayerKey, key: "owed" | "filled") => {
    const day = slots.get(d) ?? {};
    const cur = day[p] ?? { owed: 0, filled: 0 };
    cur[key] += 1;
    day[p] = cur;
    slots.set(d, day);
  };

  for (const p of PRAYER_KEYS) {
    const initial = owed0(p);
    if (initial <= 0 || backfillDays <= 0) continue;
    const prayed = Math.max(0, Math.floor(input.prayedByPrayer?.[p] ?? 0));
    const qada = Math.max(0, Math.floor(input.qadaLoggedByPrayer?.[p] ?? 0));
    const filled = Math.min(initial, prayed + qada);
    const missed = initial - filled;
    filledByPrayer[p] = filled;
    missedByPrayer[p] = missed;
    const rand = mulberry32(hashSeed(`${input.userId}|${p}`));
    const days: number[] = [];
    for (let i = 0; i < initial; i++) days.push(Math.floor(rand() * backfillDays));
    days.sort((a, b) => a - b);
    for (let i = 0; i < days.length; i++) bump(days[i], p, i < filled ? "filled" : "owed");
  }

  const cellCount = Math.ceil(totalDays / WINDOW);
  const cells: LifetimeCell[] = [];
  for (let i = 0; i < cellCount; i++) {
    const startIdx = i * WINDOW;
    const endIdx = Math.min(startIdx + WINDOW - 1, todayIdx);
    const start = fromDayIndex(startIdx, epoch);
    const end = fromDayIndex(endIdx, epoch);
    const cell: LifetimeCell = {
      index: i, start, end,
      year: parseInt(start.slice(0, 4), 10),
      state: "neutral", intensity: 0, pct: null,
      days: endIdx - startIdx + 1, trackedDays: 0,
      prayed: 0, missed: 0, owed: 0, filled: 0, neutralDays: 0,
      byPrayer: {},
    };
    for (let d = startIdx; d <= endIdx; d++) {
      const date = fromDayIndex(d, epoch);
      cell.prayed += input.prayedByDate[date] ?? 0;
      cell.missed += input.missedByDate?.[date] ?? 0;
      if (d >= trackingStartIdx) cell.trackedDays++;
      const daySlots = slots.get(d);
      if (daySlots) {
        for (const p of PRAYER_KEYS) {
          const sl = daySlots[p];
          if (!sl) continue;
          const agg = cell.byPrayer[p] ?? { owed: 0, filled: 0 };
          agg.owed += sl.owed; agg.filled += sl.filled;
          cell.byPrayer[p] = agg;
          cell.owed += sl.owed; cell.filled += sl.filled;
        }
      } else if (d < trackingStartIdx) {
        cell.neutralDays++;
      }
    }
    const backfillWindowDays = cell.days - cell.trackedDays;
    if (cell.trackedDays > 0) {
      cell.state = "tracked";
      cell.pct = cell.trackedDays * 5 > 0 ? Math.min(1, cell.prayed / (cell.trackedDays * 5)) : 0;
    } else if (cell.owed > 0) {
      cell.state = "owed";
      cell.intensity = Math.min(1, cell.owed / Math.max(1, backfillWindowDays));
    } else if (cell.filled > 0) {
      cell.state = "filled";
    }
    cells.push(cell);
  }

  const yearsMap = new Map<number, LifetimeCell[]>();
  for (const c of cells) {
    const arr = yearsMap.get(c.year) ?? [];
    arr.push(c);
    yearsMap.set(c.year, arr);
  }
  const years = [...yearsMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, cs]) => ({ year, cells: cs }));

  const owedNowMap = input.owedNow ?? {};
  const owedRemaining = PRAYER_KEYS.reduce((sum, p) => sum + Math.max(0, Math.floor(owedNowMap[p] ?? owed0(p) - filledByPrayer[p])), 0);
  const madeUp = PRAYER_KEYS.reduce((sum, p) => sum + filledByPrayer[p], 0);
  const owedSlots = PRAYER_KEYS.reduce((sum, p) => sum + missedByPrayer[p], 0);
  const totalPrayed = Object.entries(input.prayedByDate)
    .reduce((sum, [d, n]) => sum + (d >= input.balighDate ? n : 0), 0);

  return {
    cells,
    years,
    totals: {
      days: totalDays,
      totalPrayed,
      owedRemaining,
      madeUp,
      owedSlots,
      pctPrayed: totalPrayed + owedRemaining > 0 ? totalPrayed / (totalPrayed + owedRemaining) : null,
      trackingStart: logDates.find((d) => d >= input.balighDate) ?? null,
    },
  };
}
