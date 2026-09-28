// Masjid iqamah scraping — shared by the lazy resolver in /api/masjids and
// the nightly cron sweep (/api/cron/iqamah-scrape). Single source of truth.

export interface IqamahResult {
  fixed: (string | null)[];
  offsets?: (number | null)[];
  jummah: string[];
  provider?: string;
}

export function hhmmTo24(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h !== 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Masjidal's public widget API: /api/v1/time?masjid_id=X → JSON iqama. */
export function parseMasjidal(json: unknown): { fixed: (string | null)[]; jummah: string[] } | null {
  const iq = (json as { data?: { iqama?: Record<string, string> } })?.data?.iqama;
  if (!iq) return null;
  const fixed = [iq.fajr, iq.zuhr, iq.asr, iq.maghrib, iq.isha].map((s) => (s ? hhmmTo24(s) : null));
  const jummah = [iq.jummah1, iq.jummah2, iq.jummah3]
    .map((t) => (t ? hhmmTo24(t) : null))
    .filter((t): t is string => !!t);
  return fixed.some(Boolean) ? { fixed, jummah } : null;
}

/**
 * Mohid-style widget pages embed iqamah in .prayer_iqama_div blocks.
 * Many masjid homepages iframe a Mohid/Masjidal widget — one extra hop.
 */
export function parseMohidHtml(html: string): { fixed: (string | null)[]; jummah: string[] } | null {
  const times = [...html.matchAll(/prayer_iqama_div[^>]*>\s*([\s\S]*?)</g)]
    .map((m) => m[1].trim().match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)?.[1])
    .filter((t): t is string => !!t);
  // First cell is usually "Iqamah" label / header — praytime slices [1,6]
  const five = times.length >= 6 ? times.slice(1, 6) : times.slice(0, 5);
  if (five.length < 5) return null;
  const fixed = five.map(hhmmTo24);
  const juma = [...html.matchAll(/id="jummah"[\s\S]{0,2000}?(\d{1,2}:\d{2}\s*(?:am|pm)?)/gi)]
    .map((m) => hhmmTo24(m[1])).filter((t): t is string => !!t);
  return fixed.every(Boolean) ? { fixed, jummah: juma.slice(0, 3) } : null;
}

/**
 * Mawaqit mosque pages/embeds embed `confData = {...}` with a per-day
 * `iqamaCalendar` (offsets like "+15" or fixed "HH:MM") and jumua times.
 */
export function parseMawaqitConfData(html: string, tz?: string | null): { fixed: (string | null)[]; offsets: (number | null)[]; jummah: string[] } | null {
  const m = html.match(/confData\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  let conf: Record<string, unknown>;
  try { conf = JSON.parse(m[1]); } catch { return null; }
  // ponytail: masjid-local date via its tz when known; off-by-one near
  // midnight otherwise — iqamah offsets rarely change day to day anyway.
  const now = new Date();
  let month = now.getUTCMonth();
  let day = now.getUTCDate();
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", day: "numeric" }).formatToParts(now);
      month = Number(parts.find((p) => p.type === "month")!.value) - 1;
      day = Number(parts.find((p) => p.type === "day")!.value);
    } catch { /* keep UTC */ }
  }
  const cal = conf.iqamaCalendar as Record<string, unknown[]>[] | undefined;
  const today = cal?.[month]?.[String(day)] as unknown[] | undefined;
  const fixed: (string | null)[] = [null, null, null, null, null];
  const offsets: (number | null)[] = [null, null, null, null, null];
  if (Array.isArray(today)) {
    for (let i = 0; i < 5; i++) {
      const v = today[i];
      if (typeof v === "string" && v.startsWith("+")) offsets[i] = parseInt(v.slice(1), 10);
      else if (typeof v === "string") fixed[i] = hhmmTo24(v);
    }
  }
  const jummah = [conf.jumua, conf.jumua2, conf.jumua3]
    .map((j) => (typeof j === "string" ? hhmmTo24(j) : null))
    .filter((t): t is string => !!t);
  return fixed.some(Boolean) || offsets.some((o) => o != null) || jummah.length ? { fixed, offsets, jummah } : null;
}

/** CSV schedules: header row names prayer columns, data rows are per-month/week. */
function parseCsvIqamah(body: string, tz?: string | null): { fixed: (string | null)[]; jummah: string[] } | null {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const cols = ["fajr", "dhuhr|zuhr|dhur", "asr", "maghrib", "isha"].map((n) =>
    header.findIndex((h) => new RegExp(`^${n}$`, "i").test(h)),
  );
  if (cols.filter((c) => c >= 0).length < 4) return null;
  // Pick the row for the masjid-local month + week-of-month (rows are often
  // labeled FIRST/SECOND/..._ASHURA), falling back to the first data row.
  let month = new Date().getUTCMonth() + 1;
  let week = Math.ceil(new Date().getUTCDate() / 7);
  if (tz) {
    try {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", day: "numeric" }).formatToParts(new Date());
      month = Number(p.find((x) => x.type === "month")!.value);
      week = Math.ceil(Number(p.find((x) => x.type === "day")!.value) / 7);
    } catch { /* keep UTC */ }
  }
  const monthName = ["january","february","march","april","may","june","july","august","september","october","november","december"][month - 1];
  const weekNames = ["first", "second", "third", "fourth", "fifth"];
  const monthIdx = header.findIndex((h) => /month/i.test(h));
  const seqIdx = header.findIndex((h) => /ashura|week|sequence/i.test(h));
  const dataRows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  const monthRows = monthIdx >= 0 ? dataRows.filter((r) => (r[monthIdx] ?? "").toLowerCase() === monthName) : dataRows;
  const pool = monthRows.length ? monthRows : dataRows;
  let row = pool[0];
  if (seqIdx >= 0) {
    const want = weekNames[Math.min(week, 5) - 1];
    row = pool.find((r) => (r[seqIdx] ?? "").toLowerCase().startsWith(want)) ?? pool[pool.length - 1];
  }
  const fixed = cols.map((c) => (c >= 0 ? hhmmTo24(row[c] ?? "") : null));
  const jummah = header
    .map((h, i) => (/jumua|jummah|friday/i.test(h) ? hhmmTo24(row[i] ?? "") : null))
    .filter((t): t is string => !!t);
  return fixed.filter(Boolean).length >= 4 ? { fixed, jummah } : null;
}

/**
 * Generic fallback for masjid/widget pages (thebcma, awqat.net, madinaapps,
 * CSV endpoints): find the line containing each prayer label and take its
 * LAST time — iqamah columns sit after adhan. A single time counts only
 * when the line mentions iqamah/jamaat.
 */
export function parseGenericIqamah(body: string, tz?: string | null): { fixed: (string | null)[]; jummah: string[] } | null {
  if (!body.slice(0, 400).includes("<")) return parseCsvIqamah(body, tz);
  const docSaysIqamah = /iqam|jamat|jamaah/i.test(body);
  // Strip tags to text lines — label and time may be on separate lines
  // (one <td> per line is common in widget pages).
  const lines = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const prayers = [/\bfajr\b/i, /\b(?:zuhr|dhuhr|dhur)\b/i, /\basr\b/i, /\bmaghrib\b/i, /\bisha\b/i];
  const timeRe = /(\d{1,2}):(\d{2})\s*(am|pm)?/gi;
  const fixed = prayers.map((re, pi) => {
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return null;
    // Label line + following lines until the next prayer label (max 3)
    const seg: string[] = [];
    for (let j = i; j < lines.length && seg.length < 3; j++) {
      if (j > i && prayers.some((p, pj) => pj !== pi && p.test(lines[j]))) break;
      seg.push(lines[j]);
    }
    const times = [...seg.join(" ").matchAll(timeRe)].map((m) => hhmmTo24(m[0])).filter((t): t is string => !!t);
    return times.length >= 2 ? times[times.length - 1]
      : times.length === 1 && docSaysIqamah ? times[0]
      : null;
  });
  if (fixed.filter(Boolean).length < 4) return null;
  const jummah: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/jumu|jumm?a|friday/i.test(lines[i])) continue;
    for (const m of lines.slice(i, i + 3).join(" ").matchAll(timeRe)) {
      const t = hhmmTo24(m[0]);
      if (t) jummah.push(t);
    }
  }
  return { fixed, jummah: [...new Set(jummah)].slice(0, 3) };
}

const SCRAPE_TIMEOUT = 5000;

/**
 * Full scrape cascade for one source URL — the exact same chain the lazy
 * resolver uses: Masjidal API/iframe → Mawaqit confData → Mohid iframe →
 * generic labeled-times (also handles CSV endpoints). Returns the parsed
 * result + provider label, or null when nothing parseable was found.
 */
export async function scrapeIqamah(url: string, tz?: string | null): Promise<IqamahResult | null> {
  const opts = { signal: AbortSignal.timeout(SCRAPE_TIMEOUT) };
  try {
    if (url.includes("masjidal.com")) {
      // API URL → JSON iqama. A widget/page URL → HTML; fall through to the
      // generic cascade instead of giving up.
      const res = await fetch(url, opts);
      const body = res.ok ? await res.text().catch(() => "") : "";
      let json: unknown = null;
      try { json = JSON.parse(body); } catch { /* HTML page, not the API */ }
      const p = parseMasjidal(json);
      if (p) return { ...p, provider: "Masjidal" };
      if (body) {
        const g = parseGenericIqamah(body, tz);
        if (g) return { ...g, provider: "Masjidal" };
      }
      return null;
    }

    const res = await fetch(url, { ...opts, headers: { "User-Agent": "Waqt/1.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length > 2_000_000) return null; // absurd page — don't parse megabytes

    if (url.includes("mawaqit.net")) {
      const p = parseMawaqitConfData(html, tz);
      return p ? { ...p, provider: "Mawaqit" } : null;
    }

    const masjidalEmbed = html.match(/masjidal\.com\/[^"' ]*masjid_id=([A-Za-z0-9]+)/);
    if (masjidalEmbed) {
      const r2 = await fetch(`https://masjidal.com/api/v1/time?masjid_id=${masjidalEmbed[1]}`, opts).catch(() => null);
      const p = r2?.ok ? parseMasjidal(await r2.json().catch(() => null)) : null;
      if (p) return { ...p, provider: "Masjidal" };
    }

    const mawaqitEmbed = html.match(/(?:src|href)=["'](https?:\/\/mawaqit\.net\/[^"']*)["']/i);
    if (mawaqitEmbed) {
      const r2 = await fetch(mawaqitEmbed[1], { ...opts, headers: { "User-Agent": "Waqt/1.0" } })
        .then((r) => (r.ok ? r.text() : null)).catch(() => null);
      if (r2) {
        const p = parseMawaqitConfData(r2, tz);
        if (p) return { ...p, provider: "Mawaqit" };
      }
    }

    // Mohid widget iframe embedded in the masjid's homepage — follow it once.
    // "mohid" must be in the HOST — a path match (e.g. /mohid on an arbitrary
    // or link-local host) would be an SSRF vector.
    const mohidEmbed = html.match(/(?:src|href)=["'](https?:\/\/[^/"']*mohid[^/"']*\/[^"']*)["']/i);
    const targetHtml = mohidEmbed
      ? await fetch(mohidEmbed[1], { ...opts, headers: { "User-Agent": "Waqt/1.0" } })
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null)
      : html;
    if (targetHtml) {
      const p = parseMohidHtml(targetHtml);
      if (p) return { ...p, provider: "Masjid site" };
      const g = parseGenericIqamah(targetHtml, tz);
      if (g) return { ...g, provider: "Masjid site" };
    }
    const g = parseGenericIqamah(html, tz);
    return g ? { ...g, provider: "Masjid site" } : null;
  } catch {
    return null; // best-effort — caller decides whether to keep the old cache
  }
}
