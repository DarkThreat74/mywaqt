"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, List, Map as MapIcon, Loader2 } from "lucide-react";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import "leaflet/dist/leaflet.css";

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
}

// Only Fajr/Dhuhr/Asr/Isha have distinct iqamah times — Maghrib iqamah is
// effectively the adhan (sunset) time, so we render that directly.
const IQAMA_PRAYERS = ["fajr", "dhuhr", "asr", "isha"] as const;
const IQAMA_LABELS = ["Fajr", "Dhuhr", "Asr", "Isha"];
const PAGE = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MASJID_CACHE_KEY = "waqt-masjids";

interface MasjidCache {
  lat: number;
  lng: number;
  cachedAt: number;
  mosques: Masjid[];
}

function readMasjidCache(lat: number, lng: number): Masjid[] | null {
  try {
    const raw = localStorage.getItem(MASJID_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MasjidCache;
    // Fresh + same location (within ~2km) → use it
    if (Date.now() - c.cachedAt > WEEK_MS) return null;
    if (Math.abs(c.lat - lat) > 0.02 || Math.abs(c.lng - lng) > 0.02) return null;
    return c.mosques;
  } catch {
    return null;
  }
}

function writeMasjidCache(lat: number, lng: number, mosques: Masjid[]) {
  try {
    localStorage.setItem(MASJID_CACHE_KEY, JSON.stringify({ lat, lng, cachedAt: Date.now(), mosques }));
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

export default function MasjidFinder({ prayerTimes }: { prayerTimes: PrayerTimes | null }) {
  const loc = getCachedPrayerSettings();
  const [mode, setMode] = useState<"list" | "map">("list");
  const [all, setAll] = useState<Masjid[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(16); // ~10mi
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<import("leaflet").Map | null>(null);

  const lat = loc ? parseFloat(loc.latitude) : NaN;
  const lng = loc ? parseFloat(loc.longitude) : NaN;
  const hasLoc = !isNaN(lat) && !isNaN(lng);

  // One fetch grabs everything in the radius; cached for a week like prayer
  // times. List pagination and the map both read from this single list.
  const refresh = useCallback(
    async (radius: number) => {
      if (!hasLoc) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/masjids?lat=${lat}&lng=${lng}&radius=${radius}&offset=0&limit=50`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAll(data.mosques ?? []);
        writeMasjidCache(lat, lng, data.mosques ?? []);
      } catch {
        setError("Couldn't load masjids. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [hasLoc, lat, lng],
  );

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
  }, []);

  const mosques = all.slice(0, shown);
  const total = all.length;

  useEffect(() => {
    if (mode !== "map" || !hasLoc || !mapRef.current) return;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;
      if (!mapObj.current) {
        mapObj.current = L.map(mapRef.current).setView([lat, lng], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapObj.current);
      }
      if (cancelled || !mapObj.current) return;
      const map = mapObj.current;
      // Clear old markers
      map.eachLayer((l) => {
        if (l instanceof L.Marker) map.removeLayer(l);
      });
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;border-radius:50%;background:var(--color-accent);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const meIcon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([lat, lng], { icon: meIcon }).addTo(map).bindPopup("You");
      for (const m of all) {
        L.marker([m.lat, m.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<strong>${m.name.replace(/</g, "&lt;")}</strong><br>${m.distanceKm.toFixed(1)} km${m.hasIqama ? "<br>Iqamah times available" : ""}`,
          );
      }
      if (all.length > 0) {
        const bounds = L.latLngBounds([[lat, lng], ...all.map((m) => [m.lat, m.lng] as [number, number])]);
        map.fitBounds(bounds.pad(0.1));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, hasLoc, lat, lng, all]);

  // Tear down map when leaving map mode
  useEffect(() => {
    if (mode !== "map" && mapObj.current) {
      mapObj.current.remove();
      mapObj.current = null;
    }
  }, [mode]);

  if (!hasLoc) {
    return (
      <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
        Set your location in prayer settings to find masjids nearby.
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
          <MapPin className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          Masjids near you
        </h3>
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

      {error && (
        <p className="mb-2 text-xs" style={{ color: "var(--color-warmth)" }}>{error}</p>
      )}

      {mode === "map" ? (
        <div>
          <div ref={mapRef} className="h-72 w-full rounded-lg border" style={{ borderColor: "var(--color-paper-3)" }} />
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
            const iq = iqamahTimes(m, prayerTimes);
            return (
              <div key={m.id} className="rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{m.name}</p>
                    <p className="truncate text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
                      {m.distanceKm.toFixed(1)} km
                      {m.address ? ` · ${m.address}` : [m.city, m.country].filter(Boolean).length ? ` · ${[m.city, m.country].filter(Boolean).join(", ")}` : ""}
                    </p>
                  </div>
                  {m.attribution?.provider && (
                    <span className="shrink-0 text-[10px]" style={{ color: "var(--color-ink-soft)" }}>
                      via {m.attribution.provider}
                    </span>
                  )}
                </div>

                {m.hasIqama ? (
                  <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                    {IQAMA_LABELS.map((label, i) => (
                      <div key={label}>
                        <p className="text-[10px] font-medium" style={{ color: "var(--color-ink-soft)" }}>{label}</p>
                        <p className="text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>{fmt12(iq[i])}</p>
                      </div>
                    ))}
                    {/* Maghrib iqamah is at the adhan — show sunset directly */}
                    <div>
                      <p className="text-[10px] font-medium" style={{ color: "var(--color-ink-soft)" }}>Maghrib</p>
                      <p className="text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>{fmt12(prayerTimes?.maghrib)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
                    No iqamah times published{m.url ? "" : " for this masjid"}.
                  </p>
                )}

                {m.jummah && m.jummah.length > 0 && (
                  <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--color-paper-3)" }}>
                    {m.jummah.map((j, i) => (
                      <p key={i} className="text-[11px] font-medium" style={{ color: "var(--color-warmth)" }}>
                        Jumu&apos;ah{i > 0 ? ` ${i + 1}` : ""}: {fmt12(j)}
                      </p>
                    ))}
                  </div>
                )}

                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-[11px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    View masjid page →
                  </a>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-ink-soft)" }} />
            </div>
          )}

          {!loading && mosques.length === 0 && !error && (
            <p className="py-2 text-center text-xs" style={{ color: "var(--color-ink-soft)" }}>
              No masjids found nearby.
            </p>
          )}

          {mosques.length < total && !loading && (
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
