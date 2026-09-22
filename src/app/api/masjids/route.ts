import { NextRequest, NextResponse } from "next/server";
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
    out.push({
      id: `mq:${m.uuid}`,
      slug: null, // Mawaqit slugs don't resolve on islamic.app
      name: m.name ?? "Masjid",
      lat: m.latitude,
      lng: m.longitude,
      distanceKm: dist,
      city: null,
      country: null,
      address: m.localisation ?? null,
      source: "mawaqit",
      attribution: { provider: "Mawaqit", url: "https://mawaqit.net" },
      url: m.slug ? `https://mawaqit.net/en/${m.slug}` : null,
      iqamaOffsets: offsets.some((o) => o != null) ? offsets as number[] : null,
      iqamaFixed: fixed.some((f) => f != null) ? fixed : null,
      jummah: jummah.length ? jummah : null,
      hasIqama: fixed.some(Boolean) || offsets.some((o) => o != null) || jummah.length > 0,
      image: typeof m.image === "string" ? m.image : null,
      phone: m.phone ?? null,
      website: m.site ?? null,
    });
  }
  return out;
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
    const dupe = merged.some(
      (m) => haversineKm(m.lat, m.lng, o.lat, o.lng) < 0.15,
    );
    if (!dupe) merged.push(o);
  }
  merged.sort((x, y) => x.distanceKm - y.distanceKm);
  return merged;
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
    // Mawaqit first — richest data (real iqamah + photos), so dedupe keeps it
    const merged = merge(merge(mq, ia), osm);
    const slice = await enrich(merged.slice(offset, offset + limit));

    return NextResponse.json({
      mosques: slice,
      total: merged.length,
      hasMore: offset + limit < merged.length,
    });
  } catch (err) {
    logError(err, { route: "masjids/GET" });
    return NextResponse.json({ error: "Masjid lookup failed." }, { status: 502 });
  }
}
