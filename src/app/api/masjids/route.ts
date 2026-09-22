import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UPSTREAM = "https://api.islamic.app/v1/masajid";
const MAWAQIT = "https://mawaqit.net/api/2.0/mosque/search";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

interface MasjidEntry {
  id: string;
  slug: string | null;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  city: string | null;
  country: string | null;
  address: string | null;
  source: string;
  attribution: unknown;
  url: string | null;
  iqamaOffsets: number[] | null;
  iqamaFixed: (string | null)[] | null;
  jummah: string | string[] | null;
  hasIqama: boolean;
  image: string | null;
  phone: string | null;
  website: string | null;
  /** praytime-registry endpoint to fetch live iqamah from (server-only). */
  fetchUrl?: string | null;
  /** masjid-local timezone from the registry — used for Mawaqit day lookup. */
  masjidTz?: string | null;
  /** server-only: registry external_id for iqamah-cache write-back. */
  srcId?: string;
  /** server-only: cached iqamah result + when it was last resolved. */
  iqamahCache?: { fixed: (string | null)[]; offsets?: (number | null)[]; jummah: string[]; provider?: string } | null;
  iqamahCheckedAt?: Date | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** islamic.app directory — real iqamah/jumu'ah data where mosques registered. */
async function fromIslamicApp(lat: number, lng: number, radiusKm: number): Promise<MasjidEntry[]> {
  const res = await fetch(`${UPSTREAM}/near?lat=${lat}&lng=${lng}&radius=${radiusKm}&limit=100`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const mosques: Record<string, unknown>[] = json?.data?.mosques ?? [];
  return mosques.map((m) => ({
    id: `ia:${m.slug}`,
    slug: (m.slug as string) ?? null,
    name: (m.name as string) ?? "Masjid",
    lat: m.lat as number,
    lng: m.lng as number,
    distanceKm: (m.distance_km as number) ?? haversineKm(lat, lng, m.lat as number, m.lng as number),
    city: (m.city as string) ?? null,
    country: (m.country as string) ?? null,
    address: null,
    source: (m.source as string) ?? "self",
    attribution: m.attribution ?? null,
    url: (m.url as string) ?? null,
    iqamaOffsets: null,
    iqamaFixed: null,
    jummah: null,
    hasIqama: true, // detail fetch needed for actual times
    image: null,
    phone: null,
    website: null,
  }));
}

/**
 * Mawaqit — the largest open mosque network (8000+, strong US coverage).
 * Public search endpoint, no auth. Returns today's adhan times, iqamah as
 * fixed "HH:MM" or "+N" offsets, up to 3 Jumu'ah times, photo, address.
 * Attribution is a condition of showing Mawaqit-sourced times.
 */
async function fromMawaqit(lat: number, lng: number, radiusKm: number): Promise<MasjidEntry[]> {
  const res = await fetch(`${MAWAQIT}?lat=${lat}&lon=${lng}`, {
    headers: { "User-Agent": "Waqt/1.0 (masjid finder)" },
    next: { revalidate: 21600 }, // 6h — matches their iqama feed refresh hint
  });
  if (!res.ok) return [];
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  const out: MasjidEntry[] = [];
  for (const m of json) {
    if (m?.latitude == null || m?.longitude == null) continue;
    const dist = haversineKm(lat, lng, m.latitude, m.longitude);
    if (dist > radiusKm) continue;
    out.push(mawaqitEntry(m, dist));
  }
  return out;
}

function mawaqitEntry(m: Record<string, unknown>, dist: number): MasjidEntry {
    // iqama entries are "HH:MM" (fixed) or "+N" (minutes after adhan)
    const iq: unknown[] = Array.isArray(m.iqama) ? m.iqama : [];
    const fixed: (string | null)[] = [];
    const offsets: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const v = iq[i];
      if (typeof v === "string" && v.startsWith("+")) {
        fixed.push(null);
        offsets.push(parseInt(v.slice(1), 10));
      } else if (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v)) {
        fixed.push(v);
        offsets.push(null);
      } else {
        fixed.push(null);
        offsets.push(null);
      }
    }
    const jummah = [m.jumua, m.jumua2, m.jumua3].filter(
      (j): j is string => typeof j === "string" && !!j,
    );
    return {
      id: `mq:${m.uuid}`,
      slug: null, // Mawaqit slugs don't resolve on islamic.app
      name: (m.name as string) ?? "Masjid",
      lat: m.latitude as number,
      lng: m.longitude as number,
      distanceKm: dist,
      city: null,
      country: null,
      address: (m.localisation as string) ?? null,
      source: "mawaqit",
      attribution: { provider: "Mawaqit", url: "https://mawaqit.net" },
      url: m.slug ? `https://mawaqit.net/en/${m.slug}` : null,
      iqamaOffsets: offsets.some((o) => o != null) ? offsets as number[] : null,
      iqamaFixed: fixed.some((f) => f != null) ? fixed : null,
      jummah: jummah.length ? jummah : null,
      hasIqama: fixed.some(Boolean) || offsets.some((o) => o != null) || jummah.length > 0,
      image: typeof m.image === "string" ? m.image : null,
      phone: (m.phone as string) ?? null,
      website: (m.site as string) ?? null,
    };
}

/** OpenStreetMap via Overpass — broad coverage, names + coords, no iqamah. */
async function fromOverpass(lat: number, lng: number, radiusM: number): Promise<MasjidEntry[]> {
  const q = `[out:json][timeout:10];
(
  node(around:${radiusM},${lat},${lng})[amenity=place_of_worship][religion=muslim];
  way(around:${radiusM},${lat},${lng})[amenity=place_of_worship][religion=muslim];
);
out center tags;`;
  // Overpass 406s requests without a User-Agent. Try the primary endpoint,
  // then a public mirror — both are free, no key.
  let res: Response | null = null;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      res = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Waqt/1.0 (masjid finder; +https://mywaqt.app)",
        },
        body: `data=${encodeURIComponent(q)}`,
        next: { revalidate: 86400 },
      });
      if (res.ok) break;
    } catch {
      res = null;
    }
  }
  if (!res || !res.ok) return [];
  const json = await res.json();
  const out: MasjidEntry[] = [];
  for (const el of json?.elements ?? []) {
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (elLat == null || elLng == null) continue;
    const name = el.tags?.name || el.tags?.["name:en"] || "Masjid";
    out.push({
      id: `osm:${el.type}/${el.id}`,
      slug: null,
      name,
      lat: elLat,
      lng: elLng,
      distanceKm: haversineKm(lat, lng, elLat, elLng),
      city: el.tags?.["addr:city"] ?? null,
      country: null,
      address: el.tags?.["addr:street"]
        ? `${el.tags["addr:housenumber"] ?? ""} ${el.tags["addr:street"]}`.trim()
        : null,
      source: "osm",
      attribution: null,
      url: null,
      iqamaOffsets: null,
      iqamaFixed: null,
      jummah: null,
      hasIqama: false,
      image: null,
      phone: null,
      website: null,
    });
  }
  return out;
}

/**
 * Dedupe: an islamic.app entry and an OSM entry within ~150m with similar
 * names are the same mosque — keep the islamic.app one (it has iqamah).
 */
function merge(a: MasjidEntry[], b: MasjidEntry[]): MasjidEntry[] {
  const merged = [...a];
  for (const o of b) {
    const i = merged.findIndex(
      (m) => haversineKm(m.lat, m.lng, o.lat, o.lng) < 0.15,
    );
    if (i < 0) { merged.push(o); continue; }
    // Same mosque in two sources: keep the one that can actually produce
    // iqamah — a Mawaqit/OSM pin must not hide a registry iqamah endpoint.
    const existing = merged[i];
    const oRich = o.hasIqama || !!o.fetchUrl;
    const eRich = existing.hasIqama || !!existing.fetchUrl;
    if (oRich && !eRich) merged[i] = o;
    else if (oRich && eRich && !existing.fetchUrl && o.fetchUrl) {
      // Enrich the kept entry with the other's fetch endpoint instead of
      // swapping — keeps Mawaqit's photo/name while gaining live iqamah.
      existing.fetchUrl = o.fetchUrl;
      existing.srcId = o.srcId ?? existing.srcId;
      existing.iqamahCache = o.iqamahCache ?? existing.iqamahCache;
      existing.iqamahCheckedAt = o.iqamahCheckedAt ?? existing.iqamahCheckedAt;
      if (!existing.masjidTz) existing.masjidTz = o.masjidTz;
    }
  }
  merged.sort((x, y) => x.distanceKm - y.distanceKm);
  return merged;
}

// ─── praytime registry: live iqamah from masjid platforms ───

interface SourceRow {
  externalId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  website: string | null;
  fetchUrl: string | null;
  platform: string | null;
  timezone: string | null;
  iqamahCache: { fixed: (string | null)[]; offsets?: (number | null)[]; jummah: string[]; provider?: string } | null;
  iqamahCheckedAt: Date | null;
}

/** Masjidal's public widget API: /api/v1/time?masjid_id=X → JSON iqama. */
function parseMasjidal(json: unknown): { fixed: (string | null)[]; jummah: string[] } | null {
  const iq = (json as { data?: { iqama?: Record<string, string> } })?.data?.iqama;
  if (!iq) return null;
  const to24 = (s?: string) => {
    if (!s) return null;
    const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    if (m[3]?.toLowerCase() === "pm" && h !== 12) h += 12;
    if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  const fixed = [iq.fajr, iq.zuhr, iq.asr, iq.maghrib, iq.isha].map(to24);
  const jummah = [iq.jummah1, iq.jummah2, iq.jummah3].map(to24).filter((t): t is string => !!t);
  return fixed.some(Boolean) ? { fixed, jummah } : null;
}

/**
 * Mohid-style widget pages embed iqamah in .prayer_iqama_div blocks.
 * Many masjid homepages iframe a Mohid/Masjidal widget — one extra hop.
 */
function parseMohidHtml(html: string): { fixed: (string | null)[]; jummah: string[] } | null {
  const times = [...html.matchAll(/prayer_iqama_div[^>]*>\s*([\s\S]*?)</g)]
    .map((m) => m[1].trim().match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i)?.[1])
    .filter((t): t is string => !!t);
  // First cell is usually "Iqamah" label / header — praytime slices [1,6]
  const five = times.length >= 6 ? times.slice(1, 6) : times.slice(0, 5);
  if (five.length < 5) return null;
  const to24 = (s: string) => {
    const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    if (m[3]?.toLowerCase() === "pm" && h !== 12) h += 12;
    if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  const fixed = five.map(to24);
  const juma = [...html.matchAll(/id="jummah"[\s\S]{0,2000}?(\d{1,2}:\d{2}\s*(?:am|pm)?)/gi)]
    .map((m) => to24(m[1])).filter((t): t is string => !!t);
  return fixed.every(Boolean) ? { fixed, jummah: juma.slice(0, 3) } : null;
}

function hhmmTo24(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h !== 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Mawaqit mosque pages/embeds embed `confData = {...}` with a per-day
 * `iqamaCalendar` (offsets like "+15" or fixed "HH:MM") and jumua times.
 */
function parseMawaqitConfData(html: string, tz?: string | null): { fixed: (string | null)[]; offsets: (number | null)[]; jummah: string[] } | null {
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

/**
 * Generic fallback for masjid/widget pages (thebcma, awqat.net, madinaapps,
 * CSV endpoints): find the line containing each prayer label and take its
 * LAST time — iqamah columns sit after adhan. A single time counts only
 * when the line mentions iqamah/jamaat.
 */
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

function parseGenericIqamah(body: string, tz?: string | null): { fixed: (string | null)[]; jummah: string[] } | null {
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
  const prayers = [/\bfajr\b/i, /\b(?:zuhr|dhuhr|dhur)\b/i, /\basr\b/i, /\bmaghrib\b/i, /\bisha/i];
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

const IQAMAH_CACHE_MS = 12 * 60 * 60 * 1000; // re-resolve at most twice a day
const UPSTREAM_TIMEOUT = 6000; // a slow masjid homepage must not stall the list

/** Apply a previously cached iqamah result without any network call. */
function applyCachedIqamah(e: MasjidEntry): boolean {
  const c = e.iqamahCache;
  if (!c) return false;
  if (c.fixed?.some(Boolean)) e.iqamaFixed = c.fixed;
  if (c.offsets?.some((o) => o != null)) e.iqamaOffsets = c.offsets as number[];
  if (c.jummah?.length) e.jummah = c.jummah;
  e.hasIqama = !!(c.fixed?.some(Boolean) || c.offsets?.some((o) => o != null) || c.jummah?.length);
  if (c.provider) e.attribution = { provider: c.provider };
  return e.hasIqama;
}

/** Resolve one registry source's live iqamah, with a DB cache + timeouts. */
async function fetchLiveIqamah(e: MasjidEntry): Promise<void> {
  const url = e.fetchUrl;
  if (!url) return;
  // Fresh cache → no network at all. A cached null means "checked recently,
  // nothing published" — don't refetch it on every request either.
  if (e.iqamahCheckedAt && Date.now() - e.iqamahCheckedAt.getTime() < IQAMAH_CACHE_MS) {
    applyCachedIqamah(e);
    return;
  }
  const apply = (p: { fixed: (string | null)[]; offsets?: (number | null)[]; jummah: string[] } | null, provider: string) => {
    if (!p) return;
    if (p.fixed.some(Boolean)) e.iqamaFixed = p.fixed;
    if (p.offsets?.some((o) => o != null)) e.iqamaOffsets = p.offsets as number[];
    if (p.jummah.length) e.jummah = p.jummah;
    e.hasIqama = p.fixed.some(Boolean) || !!p.offsets?.some((o) => o != null) || p.jummah.length > 0;
    e.attribution = { provider };
  };
  const opts = { next: { revalidate: 21600 }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) };
  try {
    if (url.includes("masjidal.com")) {
      const res = await fetch(url, opts);
      apply(res.ok ? parseMasjidal(await res.json().catch(() => null)) : null, "Masjidal");
    } else {
      // Widget page / homepage: fetch HTML, then try in order —
      // Masjidal iframe → Mawaqit page/embed confData → Mohid iframe →
      // generic labeled-times parse (also handles CSV endpoints).
      const res = await fetch(url, { ...opts, headers: { "User-Agent": "Waqt/1.0" } });
      if (!res.ok) return;
      const html = await res.text();

      if (url.includes("mawaqit.net")) {
        apply(parseMawaqitConfData(html, e.masjidTz), "Mawaqit");
      } else {
        const masjidalEmbed = html.match(/masjidal\.com\/[^"' ]*masjid_id=([A-Za-z0-9]+)/);
        if (masjidalEmbed) {
          const r2 = await fetch(`https://masjidal.com/api/v1/time?masjid_id=${masjidalEmbed[1]}`, opts).catch(() => null);
          apply(r2?.ok ? parseMasjidal(await r2.json().catch(() => null)) : null, "Masjidal");
        }
        if (!e.hasIqama) {
          const mawaqitEmbed = html.match(/(?:src|href)=["'](https?:\/\/mawaqit\.net\/[^"']*)["']/i);
          if (mawaqitEmbed) {
            const r2 = await fetch(mawaqitEmbed[1], { ...opts, headers: { "User-Agent": "Waqt/1.0" } })
              .then((r) => (r.ok ? r.text() : null)).catch(() => null);
            if (r2) apply(parseMawaqitConfData(r2, e.masjidTz), "Mawaqit");
          }
        }
        if (!e.hasIqama) {
          // Mohid widget iframe embedded in the masjid's homepage — follow it once
          const mohidEmbed = html.match(/(?:src|href)=["'](https?:\/\/[^"']*mohid[^"']*)["']/i);
          const targetHtml = mohidEmbed
            ? await fetch(mohidEmbed[1], { ...opts, headers: { "User-Agent": "Waqt/1.0" } })
                .then((r) => (r.ok ? r.text() : null))
                .catch(() => null)
            : html;
          if (targetHtml) {
            apply(parseMohidHtml(targetHtml), "Masjid site");
            if (!e.hasIqama) apply(parseGenericIqamah(targetHtml, e.masjidTz), "Masjid site");
          }
          if (!e.hasIqama) apply(parseGenericIqamah(html, e.masjidTz), "Masjid site");
        }
      }
    }
  } catch { /* best-effort — entry just shows adhan */ }
  // Write the resolution back so the next request for this masjid is instant.
  if (e.srcId) {
    const cache = e.hasIqama
      ? {
          fixed: e.iqamaFixed ?? [null, null, null, null, null],
          offsets: e.iqamaOffsets ?? undefined,
          jummah: Array.isArray(e.jummah) ? e.jummah : e.jummah ? [e.jummah] : [],
          provider: (e.attribution as { provider?: string } | null)?.provider,
        }
      : null;
    // Must be awaited — a detached write can be killed when the serverless
    // function freezes after the response.
    await db.update(schema.masjidSources)
      .set({ iqamahCache: cache, iqamahCheckedAt: new Date() })
      .where(eq(schema.masjidSources.externalId, e.srcId))
      .catch(() => {});
  }
}

/** Fetch iqamah/jumu'ah details for the islamic.app entries in a slice. */
async function enrich(entries: MasjidEntry[]): Promise<MasjidEntry[]> {
  let budget = 15; // cap upstream detail fetches per request
  return Promise.all(
    entries.map(async (m) => {
      if (!m.slug || budget-- <= 0) return m;
      try {
        const res = await fetch(`${UPSTREAM}/${m.slug}`, { next: { revalidate: 3600 } });
        if (!res.ok) return { ...m, hasIqama: false };
        const json = await res.json();
        const d = json?.data;
        if (!d) return { ...m, hasIqama: false };
        return {
          ...m,
          name: d.name ?? m.name,
          address: d.address ?? m.address,
          iqamaOffsets: Array.isArray(d.iqama_offsets_minutes) ? d.iqama_offsets_minutes : null,
          iqamaFixed: Array.isArray(d.iqama_fixed) ? d.iqama_fixed : null,
          jummah: [d.jummah, d.jummah2].filter(Boolean),
          source: d.source ?? m.source,
          attribution: d.attribution ?? null,
          hasIqama:
            (Array.isArray(d.iqama_offsets_minutes) && d.iqama_offsets_minutes.some((x: number | null) => x != null)) ||
            (Array.isArray(d.iqama_fixed) && d.iqama_fixed.some((x: string | null) => x != null)) ||
            !!d.jummah,
        };
      } catch {
        return { ...m, hasIqama: false };
      }
    }),
  );
}

/**
 * GET /api/masjids?lat=..&lng=..&radius=16&offset=0&limit=5
 *   — merged directory (islamic.app + OSM), sorted by distance, paginated.
 * GET /api/masjids?slug=..
 *   — single mosque profile with iqamah config (settings picker).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("masjids", ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  try {
    if (slug) {
      if (!SLUG_RE.test(slug)) {
        return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
      }
      const res = await fetch(`${UPSTREAM}/${slug}`, { next: { revalidate: 3600 } });
      if (!res.ok) return NextResponse.json({ error: "Masjid not found." }, { status: 404 });
      const json = await res.json();
      const m = json?.data;
      if (!m) return NextResponse.json({ error: "Masjid not found." }, { status: 404 });
      return NextResponse.json({
        slug: m.slug,
        name: m.name,
        city: m.city ?? null,
        country: m.country ?? null,
        lat: m.lat ?? null,
        lng: m.lng ?? null,
        iqamaOffsets: Array.isArray(m.iqama_offsets_minutes) ? m.iqama_offsets_minutes : null,
        iqamaFixed: Array.isArray(m.iqama_fixed) ? m.iqama_fixed : null,
        jummah: [m.jummah, m.jummah2].filter(Boolean),
        source: m.source ?? "self",
        attribution: m.attribution ?? null,
        url: m.url ?? null,
      });
    }

    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const q = searchParams.get("q")?.trim();

    // Name search across every source we have: praytime registry (819 US/CA),
    // community submissions, and Mawaqit's word search. Sorted by distance
    // when the client passes coords.
    if (q) {
      if (q.length > 100) return NextResponse.json({ error: "Query too long." }, { status: 400 });
      const hasCoords = !isNaN(lat) && !isNaN(lng);
      const dist = (la: number, ln: number) => (hasCoords ? haversineKm(lat, lng, la, ln) : 0);
      const pattern = `%${q}%`;

      const [srcs, subs, mqRes] = await Promise.all([
        db.select().from(schema.masjidSources)
          .where(sql`name ilike ${pattern} or address ilike ${pattern}`)
          .limit(30).catch(() => [] as SourceRow[]),
        db.select().from(schema.masjidIqamah)
          .where(sql`masjid_name ilike ${pattern}`)
          .limit(20).catch(() => []),
        fetch(`${MAWAQIT}?word=${encodeURIComponent(q)}`, {
          headers: { "User-Agent": "Waqt/1.0 (masjid finder)" },
          next: { revalidate: 21600 },
        }).then(async (r) => (r.ok ? ((await r.json().catch(() => [])) as Record<string, unknown>[]) : []))
          .catch(() => [] as Record<string, unknown>[]),
      ]);

      const entries: MasjidEntry[] = [
        ...(srcs as SourceRow[]).map((s) => ({
          id: `pt:${s.externalId}`, slug: null, name: s.name, lat: s.lat, lng: s.lng,
          distanceKm: dist(s.lat, s.lng), city: null, country: null, address: s.address,
          source: "registry", attribution: null, url: s.website,
          iqamaOffsets: null, iqamaFixed: null, jummah: null, hasIqama: false,
          image: null, phone: null, website: s.website, fetchUrl: s.fetchUrl, masjidTz: s.timezone,
          srcId: s.externalId, iqamahCache: s.iqamahCache, iqamahCheckedAt: s.iqamahCheckedAt,
        })),
        ...subs.map((s) => ({
          id: s.masjidId, slug: null, name: s.masjidName, lat: s.lat, lng: s.lng,
          distanceKm: dist(s.lat, s.lng), city: null, country: null, address: null,
          source: "community", attribution: { provider: "Community" }, url: null,
          iqamaOffsets: null, iqamaFixed: [s.fajr, s.dhuhr, s.asr, s.maghrib, s.isha],
          jummah: Array.isArray(s.jummah) && s.jummah.length ? s.jummah : null,
          hasIqama: true, image: null, phone: null, website: null,
        })),
        ...(Array.isArray(mqRes) ? mqRes : [])
          .filter((m) => m?.latitude != null && m?.longitude != null)
          .map((m) => mawaqitEntry(m, dist(m.latitude as number, m.longitude as number))),
      ];

      // Dedupe + sort by distance, then enrich iqamah for registry entries
      const seen = new Set<string>();
      const unique = entries.filter((e) => {
        const k = `${e.name.toLowerCase()}|${e.lat.toFixed(3)}|${e.lng.toFixed(3)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (hasCoords) unique.sort((a, b) => a.distanceKm - b.distanceKm);
      const slice = unique.slice(0, 30);
      // Warm iqamah cache applies instantly; only cold entries hit the network.
      for (const m of slice) {
        if (m.fetchUrl && !m.hasIqama && m.iqamahCheckedAt &&
            Date.now() - m.iqamahCheckedAt.getTime() < IQAMAH_CACHE_MS) {
          applyCachedIqamah(m);
        }
      }
      await Promise.all(slice.filter((m) => m.fetchUrl && !m.hasIqama).slice(0, 10).map((m) => fetchLiveIqamah(m)));
      const out = slice.map((m) => {
        const copy: Record<string, unknown> = { ...m };
        delete copy.fetchUrl;
        delete copy.masjidTz;
        delete copy.srcId;
        delete copy.iqamahCache;
        delete copy.iqamahCheckedAt;
        return copy;
      });
      return NextResponse.json({ mosques: out, total: unique.length, hasMore: false });
    }

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "Valid lat/lng required." }, { status: 400 });
    }

    // radius in km (default 10mi ≈ 16km), offset/limit for "show more"
    const radiusKm = Math.min(Math.max(parseFloat(searchParams.get("radius") ?? "16") || 16, 1), 80);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0") || 0, 0);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5") || 5, 1), 50);

    const [mq, ia, osm] = await Promise.all([
      fromMawaqit(lat, lng, radiusKm).catch(() => []),
      fromIslamicApp(lat, lng, radiusKm).catch(() => []),
      fromOverpass(lat, lng, Math.round(radiusKm * 1000)).catch(() => []),
    ]);
    // praytime registry (US/CA masjids + their iqamah-publishing endpoints)
    // — merged in before dedupe so OSM-only mosques gain iqamah sources.
    const deg = radiusKm / 111; // ~km per degree latitude
    const sources = await db
      .select()
      .from(schema.masjidSources)
      .where(sql`lat BETWEEN ${lat - deg} AND ${lat + deg} AND lng BETWEEN ${lng - deg * 1.4} AND ${lng + deg * 1.4}`)
      .catch(() => [] as SourceRow[]);
    const registry: MasjidEntry[] = (sources as SourceRow[])
      .filter((s) => haversineKm(lat, lng, s.lat, s.lng) <= radiusKm)
      .map((s) => ({
        id: `pt:${s.externalId}`,
        slug: null,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        distanceKm: haversineKm(lat, lng, s.lat, s.lng),
        city: null,
        country: null,
        address: s.address,
        source: "registry",
        attribution: null,
        url: s.website,
        iqamaOffsets: null,
        iqamaFixed: null,
        jummah: null,
        hasIqama: false,
        image: null,
        phone: null,
        website: s.website,
        fetchUrl: s.fetchUrl,
        masjidTz: s.timezone,
        srcId: s.externalId,
        iqamahCache: s.iqamahCache,
        iqamahCheckedAt: s.iqamahCheckedAt,
      }));
    // Mawaqit first — richest data (real iqamah + photos). Registry before
    // OSM so dedupe keeps the entry that carries an iqamah endpoint.
    const merged = merge(merge(merge(mq, ia), registry), osm);

    // Overlay community-submitted iqamah (our own crowdsourced table) onto
    // any masjids missing it — this is how the US coverage gap gets filled.
    const ids = merged.map((m) => m.id);
    if (ids.length) {
      const subs = await db
        .select()
        .from(schema.masjidIqamah)
        .where(inArray(schema.masjidIqamah.masjidId, ids))
        .catch(() => []);
      const byId = new Map(subs.map((s) => [s.masjidId, s]));
      for (const m of merged) {
        const s = byId.get(m.id);
        if (!s || m.hasIqama) continue;
        m.iqamaFixed = [s.fajr, s.dhuhr, s.asr, s.maghrib, s.isha];
        m.jummah = Array.isArray(s.jummah) && s.jummah.length ? s.jummah : m.jummah;
        m.hasIqama = true;
        m.attribution = { provider: "Community" };
      }
    }

    const slice = await enrich(merged.slice(offset, offset + limit));

    // Fetch live iqamah from masjid endpoints (masjidal JSON / mohid widget
    // pages / masjidal embeds) — capped, parallel, cached in masjid_sources.
    for (const m of slice) {
      if (m.fetchUrl && !m.hasIqama && m.iqamahCheckedAt &&
          Date.now() - m.iqamahCheckedAt.getTime() < IQAMAH_CACHE_MS) {
        applyCachedIqamah(m);
      }
    }
    await Promise.all(
      slice
        .filter((m) => m.fetchUrl && !m.hasIqama)
        .slice(0, 15)
        .map((m) => fetchLiveIqamah(m)),
    );

    // Strip internal fetch endpoints before responding
    const out = slice.map((m) => {
      const copy: Record<string, unknown> = { ...m };
      delete copy.fetchUrl;
      delete copy.srcId;
      delete copy.iqamahCache;
      delete copy.iqamahCheckedAt;
      delete copy.masjidTz;
      return copy;
    });
    return NextResponse.json({
      mosques: out,
      total: merged.length,
      hasMore: offset + limit < merged.length,
    });
  } catch (err) {
    logError(err, { route: "masjids/GET" });
    return NextResponse.json({ error: "Masjid lookup failed." }, { status: 502 });
  }
}

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * POST /api/masjids — submit iqamah times for a masjid (crowdsourced).
 * Body: { masjidId, name, lat, lng, fajr?, dhuhr?, asr?, maghrib?, isha?, jummah?[] }
 * One canonical record per masjid; a new submission overwrites the old.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("masjids-iqamah", ip, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const masjidId = typeof b.masjidId === "string" && b.masjidId.length <= 200 ? b.masjidId : null;
  const name = typeof b.name === "string" && b.name.trim().length > 0 && b.name.length <= 200 ? b.name.trim() : null;
  const lat = typeof b.lat === "number" && b.lat >= -90 && b.lat <= 90 ? b.lat : null;
  const lng = typeof b.lng === "number" && b.lng >= -180 && b.lng <= 180 ? b.lng : null;
  if (!masjidId || !name || lat == null || lng == null) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  const times = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
  const vals: Record<(typeof times)[number], string | null> = { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null };
  for (const t of times) {
    const v = b[t];
    if (v == null) continue;
    if (typeof v !== "string" || !HHMM_RE.test(v)) {
      return NextResponse.json({ error: `Invalid ${t} time (use HH:MM).` }, { status: 400 });
    }
    vals[t] = v;
  }
  const jummah = Array.isArray(b.jummah)
    ? (b.jummah as unknown[]).filter((j): j is string => typeof j === "string" && HHMM_RE.test(j)).slice(0, 3)
    : null;
  if (!Object.values(vals).some(Boolean) && !jummah?.length) {
    return NextResponse.json({ error: "Submit at least one time." }, { status: 400 });
  }

  try {
    await db
      .insert(schema.masjidIqamah)
      .values({
        masjidId,
        masjidName: name,
        lat,
        lng,
        ...vals,
        jummah,
        submittedBy: session.userId,
      })
      .onConflictDoUpdate({
        target: schema.masjidIqamah.masjidId,
        set: {
          masjidName: name,
          lat,
          lng,
          ...vals,
          jummah,
          submittedBy: session.userId,
          updatedAt: new Date(),
        },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError(err, { route: "masjids/POST" });
    return NextResponse.json({ error: "Couldn't save iqamah." }, { status: 500 });
  }
}
