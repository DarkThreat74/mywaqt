"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, List, Map as MapIcon, Loader2, Copy, Check, Navigation, LocateFixed, Search, X } from "lucide-react";
import { getCachedPrayerSettings, setCachedPrayerSettings } from "@/lib/offline/settings-cache";
import { invalidateApiCache } from "@/lib/sw-helpers";
import "maplibre-gl/dist/maplibre-gl.css";

// Matches the dashboard's PrayerTimes shape; values may carry a "(TZ)" suffix.
interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

interface Masjid {
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
  attribution: { provider?: string; url?: string } | null;
  url: string | null;
  iqamaOffsets: (number | null)[] | null;
  iqamaFixed: (string | null)[] | null;
  jummah: string[] | null;
  hasIqama: boolean;
  image: string | null;
  phone: string | null;
  website: string | null;
}

// Only Fajr/Dhuhr/Asr/Isha have distinct iqamah times — Maghrib iqamah is
// effectively the adhan (sunset) time, so we render that directly.
const IQAMA_PRAYERS = ["fajr", "dhuhr", "asr", "isha"] as const;

const MI_PER_KM = 0.621371;
function fmtDist(km: number): string {
  const mi = km * MI_PER_KM;
  if (mi < 0.1) return `${Math.max(1, Math.round(km * 3280.84))} ft`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}
const PAGE = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MASJID_CACHE_KEY = "waqt-masjids";

interface MasjidCache {
  v: number; // bump when the response shape/sources change — stale caches refetch
  lat: number;
  lng: number;
  cachedAt: number;
  mosques: Masjid[];
}

const MASJID_CACHE_V = 2;

function readMasjidCache(lat: number, lng: number): Masjid[] | null {
  try {
    const raw = localStorage.getItem(MASJID_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MasjidCache;
    // Fresh + same location (within ~2km) + non-empty + current version → use it
    if (c.v !== MASJID_CACHE_V) return null;
    if (!Array.isArray(c.mosques) || c.mosques.length === 0) return null;
    if (Date.now() - c.cachedAt > WEEK_MS) return null;
    if (Math.abs(c.lat - lat) > 0.02 || Math.abs(c.lng - lng) > 0.02) return null;
    return c.mosques;
  } catch {
    return null;
  }
}

function writeMasjidCache(lat: number, lng: number, mosques: Masjid[]) {
  try {
    localStorage.setItem(MASJID_CACHE_KEY, JSON.stringify({ v: MASJID_CACHE_V, lat, lng, cachedAt: Date.now(), mosques }));
  } catch { /* full/blocked — non-critical */ }
}

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(" ")[0].split(":").map(Number);
  const t = (h * 60 + m + delta + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function fmt12(hhmm: string | null | undefined): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(" ")[0].split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "—";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function iqamahTimes(m: Masjid, adhan: PrayerTimes | null): (string | null)[] {
  // iqama_offsets/iqama_fixed are [Fajr, Dhuhr, Asr, Maghrib, Isha] upstream —
  // we render indices 0,1,2,4 (Maghrib shows the adhan/sunset time instead).
  const IDX = [0, 1, 2, 4];
  return IQAMA_PRAYERS.map((p, i) => {
    const fixed = m.iqamaFixed?.[IDX[i]];
    if (fixed) return fixed;
    const off = m.iqamaOffsets?.[IDX[i]];
    if (off != null && adhan?.[p]) return addMinutes(adhan[p], off);
    return null;
  });
}

/** Sideways iqamah table: Fajr · Dhuhr · Asr · Maghrib(=sunset) · Isha */
function IqamahTable({ m, prayerTimes }: { m: Masjid; prayerTimes: PrayerTimes | null }) {
  const iq = iqamahTimes(m, prayerTimes); // [F, D, A, I]
  const cells: [string, string | null][] = [
    ["Fajr", iq[0]],
    ["Dhuhr", iq[1]],
    ["Asr", iq[2]],
    ["Maghrib", prayerTimes?.maghrib ?? null],
    ["Isha", iq[3]],
  ];
  return (
    <table
      className="w-full table-fixed rounded-lg text-center"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-paper-2) 60%, transparent)" }}
    >
      <thead>
        <tr>
          {cells.map(([label]) => (
            <th
              key={label}
              className="truncate px-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-ink-muted)" }}
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cells.map(([label, t]) => (
            <td
              key={label}
              className="whitespace-nowrap px-0.5 pb-2 pt-0.5 text-[11px] font-semibold tabular-nums"
              style={{ color: "var(--color-ink)" }}
            >
              {fmt12(t)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export default function MasjidFinder({ prayerTimes }: { prayerTimes: PrayerTimes | null }) {
  const loc = getCachedPrayerSettings();
  const [mode, setMode] = useState<"list" | "map">("list");
  const [all, setAll] = useState<Masjid[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(32); // ~20mi default
  const [selected, setSelected] = useState<Masjid | null>(null);
  const [locating, setLocating] = useState(false);
  const [, setLocTick] = useState(0); // bump to re-read cached coords
  const [driveInfo, setDriveInfo] = useState<{ km: number; min: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingIqamah, setEditingIqamah] = useState<string | null>(null);
  const [iqamahForm, setIqamahForm] = useState<Record<string, string>>({});
  const [savingIqamah, setSavingIqamah] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Masjid[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrInput, setAddrInput] = useState("");
  const [addrBusy, setAddrBusy] = useState(false);

  // Shared by geolocation + typed-address paths: persist coords + tz,
  // seed local caches, refetch masjids for the new spot.
  async function applyLocation(la: number, ln: number) {
    let timezone = loc?.timezone ?? "UTC";
    try {
      const tzRes = await fetch(`https://api.latlng.work/v1/timezone?lat=${la}&lng=${ln}`);
      if (tzRes.ok) {
        const d = await tzRes.json();
        if (d.timezone) timezone = d.timezone;
      }
    } catch { /* keep current tz */ }
    fetch("/api/onboarding/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: String(la),
        longitude: String(ln),
        timezone,
        calculationMethod: loc?.calculationMethod,
        madhab: loc?.madhab,
      }),
    }).catch(() => {});
    const s = getCachedPrayerSettings();
    setCachedPrayerSettings({
      timezone,
      calculationMethod: s?.calculationMethod ?? 2,
      madhab: s?.madhab ?? null,
      latitude: String(la),
      longitude: String(ln),
    });
    invalidateApiCache("/api/prayer-times");
    try { localStorage.removeItem(MASJID_CACHE_KEY); } catch { /* ignore */ }
    setRadiusKm(32);
    setShown(PAGE);
    setLocTick((t) => t + 1);
    void refresh(32, la, ln);
  }

  async function searchAddress() {
    const q = addrInput.trim();
    if (!q || addrBusy) return;
    setAddrBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { Accept: "application/json", "User-Agent": "Waqt/1.0" } },
      );
      const results = res.ok ? await res.json().catch(() => []) : [];
      const hit = Array.isArray(results) ? results[0] : null;
      if (!hit) {
        setError("Couldn't find that address. Try a ZIP or city.");
        return;
      }
      setAddrOpen(false);
      setAddrInput("");
      await applyLocation(parseFloat(hit.lat), parseFloat(hit.lon));
    } catch {
      setError("Address lookup failed. Try again.");
    } finally {
      setAddrBusy(false);
    }
  }

  async function submitIqamah(m: Masjid) {
    const vals = ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => iqamahForm[k] || null);
    const jummah = ["j1", "j2", "j3"].map((k) => iqamahForm[k]).filter(Boolean) as string[];
    if (!vals.some(Boolean) && !jummah.length) return;
    setSavingIqamah(true);
    try {
      const res = await fetch("/api/masjids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masjidId: m.id, name: m.name, lat: m.lat, lng: m.lng,
          fajr: vals[0], dhuhr: vals[1], asr: vals[2], maghrib: vals[3], isha: vals[4],
          jummah: jummah.length ? jummah : null,
        }),
      });
      if (!res.ok) throw new Error();
      // Merge the submission into the local list immediately
      setAll((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? { ...x, iqamaFixed: vals, jummah: jummah.length ? jummah : x.jummah, hasIqama: true, attribution: { provider: "Community" } }
            : x,
        ),
      );
      setEditingIqamah(null);
      setIqamahForm({});
    } catch {
      setError("Couldn't save iqamah. Try again.");
    } finally {
      setSavingIqamah(false);
    }
  }
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<import("maplibre-gl").Map | null>(null);
  const markerObjs = useRef<import("maplibre-gl").Marker[]>([]);

  async function copyAddress(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  const lat = loc ? parseFloat(loc.latitude) : NaN;
  const lng = loc ? parseFloat(loc.longitude) : NaN;
  const hasLoc = !isNaN(lat) && !isNaN(lng);

  // One fetch grabs everything in the radius; cached for a week like prayer
  // times. List pagination and the map both read from this single list.
  const refresh = useCallback(
    async (radius: number, la = lat, ln = lng) => {
      if (isNaN(la) || isNaN(ln)) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/masjids?lat=${la}&lng=${ln}&radius=${radius}&offset=0&limit=50`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAll(data.mosques ?? []);
        // Don't cache an empty list for a week — a temporary upstream outage
        // would otherwise stick. Empty results just aren't cached.
        if (data.mosques?.length) writeMasjidCache(la, ln, data.mosques);
      } catch {
        setError("Couldn't load masjids. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [lat, lng],
  );

  // Re-geolocate → applyLocation persists + refetches for the new spot.
  function refreshLocation() {
    if (locating || typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void applyLocation(pos.coords.latitude, pos.coords.longitude).finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Check permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    if (!hasLoc) return;
    // Defer so setState isn't synchronous inside the effect
    const t = setTimeout(() => {
      const cached = readMasjidCache(lat, lng);
      if (cached) {
        setAll(cached); // fresh weekly cache — no fetch needed
      } else {
        void refresh(radiusKm); // expired or moved — refetch
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoc]); // settings cache may be seeded after first render

  // Debounced name search — hits the full registry + community + Mawaqit
  // server-side. Empty query restores the cached nearby list.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/masjids?q=${encodeURIComponent(q)}&lat=${lat}&lng=${lng}`);
        const data = res.ok ? await res.json() : { mosques: [] };
        setSearchResults(data.mosques ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, lat, lng]);

  const isSearching = query.trim().length > 0;
  const mosques = searchResults ?? all.slice(0, shown);
  const total = isSearching ? (searchResults?.length ?? 0) : all.length;

  // Reset stale drive/copy state when the selection changes (render-time
  // adjustment — the React-sanctioned alternative to setState-in-effect)
  const [prevSelected, setPrevSelected] = useState<Masjid | null>(null);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setDriveInfo(null);
    setCopied(false);
  }

  // Driving distance/time via OSRM (public demo server, no key) — fetched
  // only when a masjid is selected, never for the whole list.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${selected.lng},${selected.lat}?overview=false`,
    )
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        const route = d?.routes?.[0];
        if (!cancelled && route) {
          setDriveInfo({ km: route.distance / 1000, min: Math.round(route.duration / 60) });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, lat, lng]);

  useEffect(() => {
    if (mode !== "map" || !hasLoc || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      const maplibregl = await import("maplibre-gl").catch(() => null);
      if (!maplibregl) {
        if (!cancelled) setError("Map failed to load. Check your connection.");
        return;
      }
      if (cancelled || !mapRef.current) return;
      if (!mapObj.current) {
        // WebGL unavailable (old devices, battery saver) → honest fallback
        const glTest = document.createElement("canvas").getContext("webgl2") ??
          document.createElement("canvas").getContext("webgl");
        if (!glTest) {
          setError("Map needs WebGL — your browser has it disabled.");
          return;
        }
        // MapLibre GL (open-source renderer) + OpenFreeMap vector tiles —
        // free, no API key. Liberty = full cartography w/ texture + labels.
        mapObj.current = new maplibregl.Map({
          container: mapRef.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [lng, lat],
          zoom: 11,
          attributionControl: { compact: true },
        });
        mapObj.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        mapObj.current.on("click", () => setSelected(null));
        mapObj.current.on("error", (e) => {
          // Surface tile/style failures instead of silently rendering white
          console.warn("map error", e?.error?.message);
        });
      }
      if (cancelled || !mapObj.current) return;
      const map = mapObj.current;
      // Clear old markers
      for (const mk of markerObjs.current) mk.remove();
      markerObjs.current = [];

      // "You" — blue dot
      const meEl = document.createElement("div");
      meEl.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      markerObjs.current.push(new maplibregl.Marker({ element: meEl }).setLngLat([lng, lat]).addTo(map));

      const pinSvg = `<svg width="24" height="30" viewBox="0 0 24 30" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))"><path d="M12 0C5.9 0 1 4.9 1 11c0 8.3 11 19 11 19s11-10.7 11-19C23 4.9 18.1 0 12 0z" fill="var(--color-accent)" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11" r="4" fill="#fff"/></svg>`;
      for (const m of all) {
        const el = document.createElement("div");
        el.title = m.name;
        el.style.cssText = "width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer";
        el.innerHTML = pinSvg;
        el.addEventListener("click", (e) => {
          e.stopPropagation(); // don't let the map's deselect handler eat it
          setSelected(m);
        });
        markerObjs.current.push(
          new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([m.lng, m.lat]).addTo(map),
        );
      }
      if (all.length > 0) {
        const bounds = new maplibregl.LngLatBounds([lng, lat], [lng, lat]);
        for (const m of all) bounds.extend([m.lng, m.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 13 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, hasLoc, lat, lng, all]);

  // Tear down map when leaving map mode
  useEffect(() => {
    if (mode !== "map" && mapObj.current) {
      for (const mk of markerObjs.current) mk.remove();
      markerObjs.current = [];
      mapObj.current.remove();
      mapObj.current = null;
    }
  }, [mode]);

  if (!hasLoc) {
    return (
      <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
        <p>Set your location to find masjids nearby.</p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={refreshLocation}
            disabled={locating}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
          >
            {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
            Locate me
          </button>
          <button
            onClick={() => setAddrOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
          >
            <Search className="h-3 w-3" /> Address
          </button>
        </div>
        {addrOpen && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="text"
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void searchAddress(); }}
              placeholder="Address, city, or ZIP…"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
            />
            <button
              onClick={() => void searchAddress()}
              disabled={addrBusy || !addrInput.trim()}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
            >
              {addrBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          <MapPin className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          Masjids near you
          {total > 0 && (
            <span className="text-[11px] font-normal" style={{ color: "var(--color-ink-muted)" }}>
              · {total} found
            </span>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={refreshLocation}
            disabled={locating}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            aria-label="Refresh my location"
            title="Update my location"
          >
            {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
            Locate me
          </button>
          <button
            onClick={() => setAddrOpen((o) => !o)}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            aria-label="Search an address"
            title="Search an address or ZIP"
          >
            <Search className="h-3 w-3" /> Address
          </button>
          <div className="flex rounded-lg border" style={{ borderColor: "var(--color-paper-3)" }}>
            <button
              onClick={() => setMode("list")}
            className="flex items-center gap-1 rounded-l-lg px-2.5 py-1 text-[11px] font-medium"
            style={mode === "list" ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" } : { color: "var(--color-ink-soft)" }}
            aria-label="List view"
          >
            <List className="h-3 w-3" /> List
          </button>
          <button
            onClick={() => setMode("map")}
            className="flex items-center gap-1 rounded-r-lg px-2.5 py-1 text-[11px] font-medium"
            style={mode === "map" ? { backgroundColor: "var(--color-ink)", color: "var(--color-paper)" } : { color: "var(--color-ink-soft)" }}
            aria-label="Map view"
          >
            <MapIcon className="h-3 w-3" /> Map
          </button>
          </div>
        </div>
      </div>

      {addrOpen && (
        <div className="mb-3 flex items-center gap-1.5">
          <input
            type="text"
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void searchAddress(); }}
            placeholder="Address, city, or ZIP…"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
          />
          <button
            onClick={() => void searchAddress()}
            disabled={addrBusy || !addrInput.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            {addrBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Go"}
          </button>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--color-ink-muted)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) setSearchResults(null);
          }}
          placeholder="Search masjids by name or address…"
          className="w-full rounded-lg border py-2 pl-8 pr-8 text-xs outline-none"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
        />
        {isSearching && (
          <button
            onClick={() => { setQuery(""); setSearchResults(null); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5"
            style={{ color: "var(--color-ink-muted)" }}
            aria-label="Clear search"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 text-xs" style={{ color: "var(--color-warmth)" }}>{error}</p>
      )}

      {mode === "map" ? (
        <div>
          <div ref={mapRef} className="h-72 w-full overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)" }} />

          {/* Selected masjid card — opens when a marker is tapped */}
          {selected && (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: "var(--color-accent)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-start gap-3">
                {selected.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)" }}
                  >
                    <MapPin className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{selected.name}</p>
                  <p className="text-[11px] tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                    {fmtDist(selected.distanceKm)} away
                    {driveInfo && ` · ${driveInfo.min} min drive (${fmtDist(driveInfo.km)})`}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded p-1 text-xs"
                  style={{ color: "var(--color-ink-muted)" }}
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              {selected.address && (
                <button
                  onClick={() => void copyAddress(selected.address!)}
                  className="mt-2 flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors"
                  style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  {copied ? <Check className="h-3 w-3 shrink-0" style={{ color: "var(--color-success)" }} /> : <Copy className="h-3 w-3 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{copied ? "Copied!" : selected.address}</span>
                </button>
              )}

              {selected.hasIqama && (
                <div className="mt-2">
                  <IqamahTable m={selected} prayerTimes={prayerTimes} />
                </div>
              )}

              {selected.jummah && selected.jummah.length > 0 && (
                <div className="mt-2 space-y-0.5 rounded-lg px-2 py-1.5" style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, transparent)" }}>
                  {selected.jummah.map((j, i) => (
                    <p key={i} className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-warmth)" }}>
                      Jumu&apos;ah{selected.jummah!.length > 1 ? ` ${i + 1}` : ""} — {fmt12(j)}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center gap-3">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  <Navigation className="h-3 w-3" /> Directions
                </a>
                {selected.attribution?.provider && (
                  <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                    via {selected.attribution.provider}
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              const next = Math.min(radiusKm * 2, 80);
              setRadiusKm(next);
              void refresh(next);
            }}
            disabled={radiusKm >= 80}
            className="mt-2 w-full rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
          >
            {radiusKm >= 80 ? "Max radius reached" : `Widen search (now ~${Math.round(radiusKm * 0.621)} mi)`}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {mosques.map((m) => {
            return (
              <div key={m.id} className="rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-start gap-3">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)" }}
                    >
                      <MapPin className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>{m.name}</p>
                    <p className="truncate text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
                      {m.address || [m.city, m.country].filter(Boolean).join(", ") || "Masjid"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                      style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)", color: "var(--color-accent)" }}
                    >
                      {fmtDist(m.distanceKm)}
                    </span>
                    {m.attribution?.provider && (
                      <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                        via {m.attribution.provider}
                      </span>
                    )}
                  </div>
                </div>

                {m.hasIqama ? (
                  <div className="mt-2.5">
                    <IqamahTable m={m} prayerTimes={prayerTimes} />
                  </div>
                ) : prayerTimes ? (
                  <div className="mt-2.5">
                    <table
                      className="w-full table-fixed rounded-lg text-center"
                      style={{ backgroundColor: "color-mix(in oklab, var(--color-paper-2) 60%, transparent)" }}
                    >
                      <thead>
                        <tr>
                          {["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].map((label) => (
                            <th key={label} className="truncate px-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {([prayerTimes.fajr, prayerTimes.dhuhr, prayerTimes.asr, prayerTimes.maghrib, prayerTimes.isha] as const).map((t, i) => (
                            <td key={i} className="whitespace-nowrap px-0.5 pb-2 pt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
                              {fmt12(t)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                    <p className="mt-1 text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                      Adhan times — this masjid hasn&apos;t published iqamah
                    </p>
                  </div>
                ) : null}

                {!m.hasIqama && editingIqamah !== m.id && (
                  <button
                    onClick={() => { setEditingIqamah(m.id); setIqamahForm({}); }}
                    className="mt-2 rounded-md border px-2 py-1 text-[10px] font-medium"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                  >
                    + Add iqamah times
                  </button>
                )}
                {editingIqamah === m.id && (
                  <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--color-paper-3)" }}>
                    <p className="mb-1.5 text-[10px] font-semibold" style={{ color: "var(--color-ink)" }}>
                      Add iqamah times for {m.name}
                    </p>
                    <div className="grid grid-cols-5 gap-1">
                      {["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => (
                        <label key={k} className="min-w-0">
                          <span className="block truncate text-[8px] font-semibold uppercase" style={{ color: "var(--color-ink-muted)" }}>{k}</span>
                          <input
                            type="time"
                            value={iqamahForm[k] ?? ""}
                            onChange={(e) => setIqamahForm((f) => ({ ...f, [k]: e.target.value }))}
                            className="w-full rounded border px-1 py-1 text-[11px]"
                            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                      {["j1", "j2", "j3"].map((k, i) => (
                        <label key={k} className="min-w-0">
                          <span className="block truncate text-[8px] font-semibold uppercase" style={{ color: "var(--color-ink-muted)" }}>Jumu&apos;ah {i + 1}</span>
                          <input
                            type="time"
                            value={iqamahForm[k] ?? ""}
                            onChange={(e) => setIqamahForm((f) => ({ ...f, [k]: e.target.value }))}
                            className="w-full rounded border px-1 py-1 text-[11px]"
                            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => void submitIqamah(m)}
                        disabled={savingIqamah}
                        className="rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                        style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                      >
                        {savingIqamah ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditingIqamah(null); setIqamahForm({}); }}
                        className="text-[11px]"
                        style={{ color: "var(--color-ink-muted)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {m.jummah && m.jummah.length > 0 && (
                  <div
                    className="mt-2 space-y-0.5 rounded-lg px-2 py-1.5"
                    style={{ backgroundColor: "color-mix(in oklab, var(--color-warmth) 8%, transparent)" }}
                  >
                    {m.jummah.map((j, i) => (
                      <p key={i} className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-warmth)" }}>
                        Jumu&apos;ah{m.jummah!.length > 1 ? ` ${i + 1}` : ""} — {fmt12(j)}
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.address && (
                    <button
                      onClick={() => void copyAddress(m.address!)}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                    >
                      <Copy className="h-3 w-3" /> Copy address
                    </button>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium"
                    style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                  >
                    <Navigation className="h-3 w-3" /> Directions
                  </a>
                  {m.website && (
                    <a
                      href={m.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                    >
                      Website
                    </a>
                  )}
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                    >
                      Masjid page
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {loading && mosques.length === 0 && (
            <div className="space-y-3" aria-busy="true" aria-label="Loading masjids">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
                  <div className="h-3.5 w-2/3 rounded" style={{ backgroundColor: "var(--color-paper-3)" }} />
                  <div className="mt-1.5 h-2.5 w-1/3 rounded" style={{ backgroundColor: "var(--color-paper-3)" }} />
                  <div className="mt-2.5 h-9 rounded-lg" style={{ backgroundColor: "var(--color-paper-2)" }} />
                </div>
              ))}
            </div>
          )}
          {loading && mosques.length > 0 && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-ink-soft)" }} />
            </div>
          )}

          {!loading && !searching && mosques.length === 0 && !error && (
            <p className="py-2 text-center text-xs" style={{ color: "var(--color-ink-soft)" }}>
              {isSearching ? `No masjids match "${query.trim()}".` : "No masjids found nearby."}
            </p>
          )}

          {!isSearching && mosques.length < total && !loading && (
            <button
              onClick={() => setShown((s) => s + PAGE)}
              className="w-full rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            >
              Show more ({total - mosques.length} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
