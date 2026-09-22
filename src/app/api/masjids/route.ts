import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getClientIp, checkRateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

const UPSTREAM = "https://api.islamic.app/v1/masajid";
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

/**
 * GET /api/masjids?lat=..&lng=..   — proximity search (islamic.app directory)
 * GET /api/masjids?slug=..         — single mosque profile with iqamah config
 *
 * Normalized response keeps upstream attribution (required for
 * Mawaqit-sourced entries).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  if (!checkRateLimit("masjids", ip, 30, 60 * 1000)) {
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
        iqamaOffsets: Array.isArray(m.iqama_offsets_minutes) ? m.iqama_offsets_minutes : null,
        iqamaFixed: Array.isArray(m.iqama_fixed) ? m.iqama_fixed : null,
        jummah: m.jummah ?? null,
        jummah2: m.jummah2 ?? null,
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
    const res = await fetch(`${UPSTREAM}/near?lat=${lat}&lng=${lng}&radius=25&limit=20`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ error: "Directory unavailable." }, { status: 502 });
    const json = await res.json();
    const mosques = (json?.data?.mosques ?? []).map((m: Record<string, unknown>) => ({
      slug: m.slug,
      name: m.name,
      city: m.city ?? null,
      country: m.country ?? null,
      distanceKm: m.distance_km ?? null,
      source: m.source ?? "self",
      attribution: m.attribution ?? null,
    }));
    return NextResponse.json({ mosques });
  } catch (err) {
    logError(err, { route: "masjids/GET" });
    return NextResponse.json({ error: "Masjid lookup failed." }, { status: 502 });
  }
}
