/**
 * Pure pack/unpack codec for prayer_log_archive payloads — no DB imports so
 * it can be unit-tested and reused anywhere. See archive.ts for the storage
 * layout documentation.
 */

export const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type ArchivedPrayerName = (typeof PRAYER_ORDER)[number];

const BIAS_MIN = 2880; // allow marks up to 2 days before the log date
const NONE = 0xffff;
const DAY_BYTES = PRAYER_ORDER.length * 6;
const MAX_DAY = 31;

const STATUS_CODE: Record<string, number> = {
  prayed: 1,
  missed: 2,
  assumed_prayed: 3,
  excused: 4,
  pending: 5,
};
const CODE_STATUS = ["", "prayed", "missed", "assumed_prayed", "excused", "pending"];

export interface ArchiveLogRow {
  date: string;
  prayerName: string;
  status: string;
  wentToMasjid: boolean | null;
  markedAt: Date | null;
  lastCheckinAt: Date | null;
  checkinStage: number | null;
}

export interface ArchiveSourceRow {
  userId: string;
  date: string;
  prayerName: string;
  status: string;
  wentToMasjid: boolean | null;
  markedAt: Date | null;
  lastCheckinAt: Date | null;
  checkinStage: number | null;
}

function encodeOffset(at: Date | null, dateStr: string): number {
  if (!at) return NONE;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayUtc = Date.UTC(y, m - 1, d);
  const off = Math.round((at.getTime() - dayUtc) / 60000) + BIAS_MIN;
  if (off < 0 || off > 0xfffb) return NONE; // outside ±2-day window — treat as absent
  return off;
}

function decodeOffset(v: number, dateStr: string): Date | null {
  if (v === NONE || v > 0xfffb) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (v - BIAS_MIN) * 60000);
}

/** Pack one user's rows for a single month into the fixed-layout blob. */
export function packMonth(rows: ArchiveSourceRow[], year: number, month: number): string {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const buf = Buffer.alloc(MAX_DAY * DAY_BYTES);
  const prayerIdx = new Map(PRAYER_ORDER.map((p, i) => [p, i]));
  for (const row of rows) {
    const day = Number(row.date.slice(8, 10));
    const pi = prayerIdx.get(row.prayerName as ArchivedPrayerName);
    const code = STATUS_CODE[row.status];
    if (!day || day > daysInMonth || pi === undefined || !code) continue;
    const o = (day - 1) * DAY_BYTES + pi * 6;
    buf[o] = code;
    buf[o + 1] = (row.wentToMasjid ? 1 : 0) | ((row.checkinStage ?? 0) << 1);
    const marked = encodeOffset(row.markedAt, row.date);
    const checkin = encodeOffset(row.lastCheckinAt, row.date);
    buf.writeUInt16LE(marked, o + 2);
    buf.writeUInt16LE(checkin, o + 4);
  }
  return buf.toString("base64");
}

/** Unpack an archive payload back into log-shaped rows (id omitted). */
export function unpackMonth(payload: string, year: number, month: number): ArchiveLogRow[] {
  const buf = Buffer.from(payload, "base64");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: ArchiveLogRow[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (let pi = 0; pi < PRAYER_ORDER.length; pi++) {
      const o = (day - 1) * DAY_BYTES + pi * 6;
      if (o + 6 > buf.length) break;
      const code = buf[o];
      if (!code) continue;
      const flags = buf[o + 1];
      out.push({
        date: dateStr,
        prayerName: PRAYER_ORDER[pi],
        status: CODE_STATUS[code] ?? "pending",
        wentToMasjid: (flags & 1) === 1,
        markedAt: decodeOffset(buf.readUInt16LE(o + 2), dateStr),
        lastCheckinAt: decodeOffset(buf.readUInt16LE(o + 4), dateStr),
        checkinStage: (flags >> 1) & 3,
      });
    }
  }
  return out;
}
