"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Compass, MapPin, AlertTriangle, LocateFixed, RefreshCw } from "lucide-react";
import { calculateQiblaBearing, calculateDistance, bearingToCardinal } from "@/lib/prayer/qibla";
import { getCachedPrayerSettings } from "@/lib/offline/settings-cache";
import Link from "next/link";

/** Capacitor Android: fused rotation-vector heading (magnetic → true north
 *  via GeomagneticField) plus a GPS fix that needs no wifi/data. */
type QiblaNative = {
  start: (args: { latitude: number; longitude: number }) => Promise<void>;
  stop: () => Promise<void>;
  getLocation: () => Promise<{ latitude: number; longitude: number; accuracy: number; ageMs: number }>;
  getStatus: () => Promise<{ available: boolean; fusion: string }>;
  addListener: (
    event: string,
    cb: (d: { heading: number; declination?: number; magneticHeading?: number; sensorAccuracy?: number; headingErrorDeg?: number }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
} | undefined;

function angleDelta(from: number, to: number): number {
  let d = ((to - from) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function screenAngle(): number {
  const a = window.screen?.orientation?.angle;
  if (typeof a === "number") return a;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

type HeadingRefs = {
  filtered: React.MutableRefObject<number | null>;
  current: React.MutableRefObject<number>;
  lastReading: React.MutableRefObject<number>;
  dropped: React.MutableRefObject<number>;
};

function updateHeading(refs: HeadingRefs, raw: number) {
  const SENSOR_ALPHA = 0.22;
  refs.lastReading.current = Date.now();
  const prev = refs.filtered.current;
  if (prev === null) {
    refs.filtered.current = raw;
    refs.current.current = raw;
    refs.dropped.current = 0;
  } else {
    const jump = angleDelta(prev, raw);
    // >90° between readings is a magnetometer spike — drop it, unless every
    // reading disagrees (a real fast turn): after 8 drops, trust the sensor
    // again so the needle can't freeze forever.
    if (Math.abs(jump) > 90 && refs.dropped.current < 8) {
      refs.dropped.current += 1;
      return;
    }
    refs.dropped.current = 0;
    refs.filtered.current = (prev + jump * SENSOR_ALPHA + 360) % 360;
  }
}

function getNative(): NonNullable<QiblaNative> | undefined {
  return (window as Window & { Capacitor?: { Plugins?: { QiblaSensor?: NonNullable<QiblaNative> } } })
    .Capacitor?.Plugins?.QiblaSensor;
}

type LocSource = "gps" | "settings" | "network";
type SensorState = "idle" | "live" | "relative-only" | "unavailable" | "denied";

/**
 * Qibla compass — v4 (full rewrite).
 *
 * Data flow, all offline-capable:
 *   1. Bearing seeds instantly from the cached profile location (pure math).
 *   2. Native GPS fix refreshes it — satellites need no wifi/data.
 *   3. /api/qibla is a background refinement only; nothing waits on network.
 *
 * Heading flow:
 *   Native rotation-vector (gyro+mag fused, screen-rotation remapped,
 *   GeomagneticField declination → TRUE north) → browser absolute events
 *   (web fallback) → explicit degraded states, never a quietly wrong needle.
 *
 * Accuracy is reported, not guessed: the fused sensor's own heading-error
 * estimate (values[4], radians) drives the accuracy chip; the sensor status
 * channel drives the figure-8 calibration prompt.
 */
export default function QiblaCompassClient() {
  const [bearing, setBearing] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locSource, setLocSource] = useState<LocSource | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noLocation, setNoLocation] = useState(false);
  const [sensorState, setSensorState] = useState<SensorState>("idle");
  const [accuracyLow, setAccuracyLow] = useState(false);
  const [headingErr, setHeadingErr] = useState<number | null>(null);
  const [declination, setDeclination] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [turnDelta, setTurnDelta] = useState<number | null>(null);
  const [sensorDiag, setSensorDiag] = useState<string | null>(null);

  const filteredHeadingRef = useRef<number | null>(null);
  const currentHeadingRef = useRef(0);
  const dialRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const bearingRef = useRef(0);
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locSourceRef = useRef<LocSource | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const hasAbsoluteRef = useRef(false);
  const sawAnyEventRef = useRef(false);
  const [iosGranted, setIosGranted] = useState(false);
  const alignedRef = useRef(false);
  const lastReadoutRef = useRef(-1);
  const lastReadingRef = useRef(0);
  const droppedRef = useRef(0);
  const reduceMotionRef = useRef(false);
  const nativeStartedRef = useRef(false);

  // ── Bearing + distance from a coordinate — pure offline math ──
  const applyCoords = useCallback((lat: number, lng: number, src: LocSource) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const c = { latitude: lat, longitude: lng };
    const b = calculateQiblaBearing(lat, lng);
    setCoords(c);
    coordsRef.current = c;
    setBearing(Math.round(b * 10) / 10);
    bearingRef.current = b;
    setDistance(calculateDistance(lat, lng));
    setLocSource(src);
    locSourceRef.current = src;
    setLoading(false);
    setNoLocation(false);
  }, []);

  // ── Location chain: cached settings → native GPS → API refinement ──
  const refreshLocation = useCallback(async () => {
    const native = getNative();
    if (native?.getLocation) {
      try {
        setLocBusy(true);
        const l = await native.getLocation();
        applyCoords(l.latitude, l.longitude, "gps");
        return;
      } catch { /* denied or no fix — keep what we have */ }
      finally { setLocBusy(false); }
    }
    // Web GPS fallback (works offline once the browser permission is granted)
    if (navigator.geolocation) {
      try {
        setLocBusy(true);
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 60000 }),
        );
        applyCoords(pos.coords.latitude, pos.coords.longitude, "gps");
        return;
      } catch { /* keep existing */ }
      finally { setLocBusy(false); }
    }
  }, [applyCoords]);

  useEffect(() => {
    let cancelled = false;
    // 1. Instant seed from the profile's saved location — the compass is
    //    never blocked on a network round-trip.
    Promise.resolve().then(() => {
      if (cancelled) return;
      const s = getCachedPrayerSettings();
      const lat = Number(s?.latitude), lng = Number(s?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        applyCoords(lat, lng, "settings");
      }
    });
    // 2. Native GPS — fresher than the profile if the user has moved.
    Promise.resolve().then(() => { if (!cancelled) void refreshLocation(); });
    // 3. API refinement only (never the source of truth).
    fetch("/api/qibla").then((r) => (r.ok ? r.json() : null)).then((json) => {
      // locSourceRef — the state var is stale inside this effect's closure.
      if (cancelled || !json || locSourceRef.current === "gps") return;
      if (json.userLocation) applyCoords(Number(json.userLocation.latitude), Number(json.userLocation.longitude), "network");
    }).catch(() => {});
    const done = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setNoLocation((prev) => prev || !coordsRef.current);
      }
    }, 1500);
    return () => { cancelled = true; clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headingRefs = useRef<HeadingRefs>({
    filtered: filteredHeadingRef,
    current: currentHeadingRef,
    lastReading: lastReadingRef,
    dropped: droppedRef,
  }).current;

  // ── rAF render loop ──
  const RAF_ALPHA = 0.14;
  const DEADZONE = 0.25;
  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const tick = () => {
      const filtered = filteredHeadingRef.current;
      if (filtered !== null) {
        const dh = angleDelta(currentHeadingRef.current, filtered);
        if (Math.abs(dh) > DEADZONE) {
          currentHeadingRef.current = reduceMotionRef.current
            ? filtered
            : (currentHeadingRef.current + dh * RAF_ALPHA + 360) % 360;
        }
        if (dialRef.current) {
          dialRef.current.style.transform = `rotate(${-currentHeadingRef.current}deg)`;
        }
        const deltaToQibla = angleDelta(currentHeadingRef.current, bearingRef.current);
        const isAligned = Math.abs(deltaToQibla) <= 3;
        if (isAligned !== alignedRef.current) {
          alignedRef.current = isAligned;
          setAligned(isAligned);
          if (isAligned && navigator.vibrate) navigator.vibrate([0, 40, 60, 40]);
        }
        const rounded = Math.round(currentHeadingRef.current);
        if (rounded !== lastReadoutRef.current) {
          lastReadoutRef.current = rounded;
          setHeadingDeg(rounded);
          setTurnDelta(Math.round(deltaToQibla));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Sensor attach: native first, WebView orientation fallback ──
  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const native = getNative();

    // WebView fallback — Chrome's own sensor stack, independent of the app
    // process. This is what Capacitor's official Motion plugin uses entirely.
    const attachWeb = () => {
      const handler = (e: Event) => {
        const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
        sawAnyEventRef.current = true;
        if (typeof ev.webkitCompassHeading === "number" && !Number.isNaN(ev.webkitCompassHeading)) {
          hasAbsoluteRef.current = true;
          if (typeof ev.webkitCompassAccuracy === "number") {
            setAccuracyLow(ev.webkitCompassAccuracy < 0 || ev.webkitCompassAccuracy > 20);
          }
          updateHeading(headingRefs, (ev.webkitCompassHeading + screenAngle() + 360) % 360);
          return;
        }
        if (ev.absolute === true && ev.alpha !== null &&
            typeof ev.alpha === "number" && typeof ev.beta === "number" && typeof ev.gamma === "number") {
          hasAbsoluteRef.current = true;
          // Qibla is used flat — steep pitch/roll makes alpha meaningless.
          if (Math.abs(ev.beta ?? 0) > 65 || Math.abs(ev.gamma ?? 0) > 65) return;
          updateHeading(headingRefs, (360 - ev.alpha + screenAngle() + 360) % 360);
        }
      };
      window.addEventListener("deviceorientationabsolute", handler);
      window.addEventListener("deviceorientation", handler);
      const onNeedsCal = () => setAccuracyLow(true);
      window.addEventListener("compassneedscalibration", onNeedsCal);
      const stateTimer = setTimeout(() => {
        setSensorState(hasAbsoluteRef.current ? "live" : sawAnyEventRef.current ? "relative-only" : "unavailable");
      }, 2500);
      const liveTimer = setInterval(() => {
        setSensorState(hasAbsoluteRef.current ? "live" : sawAnyEventRef.current ? "relative-only" : "unavailable");
        if (hasAbsoluteRef.current) setStale(Date.now() - lastReadingRef.current > 3000);
      }, 2000);
      return () => {
        window.removeEventListener("deviceorientationabsolute", handler);
        window.removeEventListener("deviceorientation", handler);
        window.removeEventListener("compassneedscalibration", onNeedsCal);
        clearTimeout(stateTimer);
        clearInterval(liveTimer);
      };
    };

    if (native && coords) {
      let removeH: (() => void) | null = null;
      let removeA: (() => void) | null = null;
      let webCleanup: (() => void) | null = null;
      // If the app-process sensor stack fails, Chrome's may still work —
      // they're independent paths to the same sensors.
      const fallbackToWeb = () => { if (!webCleanup) webCleanup = attachWeb(); };
      try {
      void native.addListener("heading", (r) => {
        try {
          if (typeof r.heading !== "number" || Number.isNaN(r.heading)) return;
          lastReadingRef.current = Date.now();
          setSensorState(r.sensorAccuracy === 0 ? "unavailable" : "live");
          setSensorDiag(null);
          setAccuracyLow(r.sensorAccuracy === 1);
          if (typeof r.headingErrorDeg === "number" && !Number.isNaN(r.headingErrorDeg)) setHeadingErr(r.headingErrorDeg);
          if (typeof r.declination === "number" && !Number.isNaN(r.declination)) setDeclination(r.declination);
          updateHeading(headingRefs, r.heading);
        } catch { /* a bad sensor payload must never take the page down */ }
      }).then((h) => { removeH = () => void h.remove(); }).catch(() => {});
      void native.addListener("accuracy", (d) => {
        setAccuracyLow((d.sensorAccuracy ?? 3) <= 1);
      }).then((h) => { removeA = () => void h.remove(); }).catch(() => {});
      void native.start({ latitude: coords.latitude, longitude: coords.longitude })
        .then(() => { nativeStartedRef.current = true; })
        .catch((e) => {
          fallbackToWeb();
          queueMicrotask(() => {
            setSensorDiag(e instanceof Error ? e.message : String(e));
          });
        });
      } catch (e) {
        // sync throws from the bridge must not reach the boundary
        fallbackToWeb();
        queueMicrotask(() => {
          setSensorDiag(e instanceof Error ? e.message : String(e));
        });
      }
      const silentProbe = setTimeout(() => {
        if (lastReadingRef.current === 0) {
          fallbackToWeb(); // native silent → give Chrome's stack a shot
          if (nativeStartedRef.current) {
            void native.getStatus?.().then((s) => {
              const st = s as { fusion?: string; listening?: boolean; sensorEvents?: number; build?: string; device?: string };
              queueMicrotask(() => setSensorDiag(
                `native silent — fusion: ${st.fusion}, listening: ${st.listening}, events: ${st.sensorEvents}, ${st.device ?? ""} ${st.build ?? "old-apk"}`,
              ));
            }).catch(() => {});
          }
        }
      }, 4000);
      const staleTimer = setInterval(() => {
        setStale(Date.now() - lastReadingRef.current > 3000 && lastReadingRef.current > 0);
      }, 2000);
      cleanupRef.current = () => {
        void native.stop().catch(() => {});
        nativeStartedRef.current = false;
        removeH?.(); removeA?.();
        webCleanup?.();
        clearTimeout(silentProbe);
        clearInterval(staleTimer);
      };
      return cleanupRef.current;
    }
    if (native && !coords) return; // wait for the bearing to land first

    // ── Web path (desktop browser / iOS PWA / no plugin) ──
    const doe = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof doe?.requestPermission === "function" && !iosGranted) return; // iOS — wait for the Enable button
    cleanupRef.current = attachWeb();
    return cleanupRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, iosGranted]);

  // iOS gesture gate — the one place a button press is truly required.
  // Granting flips iosGranted, which re-runs the attach effect so iOS gets
  // the same handler path (webkit heading + alpha fallback + tilt guard).
  const handleEnableCompass = useCallback(async () => {
    const doe = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!doe?.requestPermission) { setSensorState("unavailable"); return; }
    try {
      if ((await doe.requestPermission.call(window.DeviceOrientationEvent)) !== "granted") {
        setSensorState("denied");
        return;
      }
    } catch { setSensorState("unavailable"); return; }
    setIosGranted(true);
  }, []);

  const needsIosGesture =
    typeof window !== "undefined" &&
    !getNative() &&
    typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown })?.requestPermission === "function" &&
    sensorState === "idle" &&
    !iosGranted;

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: "var(--color-accent)", borderRightColor: "var(--color-accent)" }} />
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Finding Qibla…</p>
        </div>
      </div>
    );
  }

  // ── No location anywhere ──
  if (noLocation || !coords || bearing === null) {
    return (
      <div className="mx-auto max-w-md py-8 sm:py-12">
        <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <Compass className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Qibla Direction</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            I need your location to point at the Kaaba — GPS works offline.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => { setLoading(true); void refreshLocation().finally(() => setLoading(false)); }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)", minHeight: 44 }}
            >
              <LocateFixed className="h-4 w-4" />
              Use my GPS location
            </button>
            <Link
              href="/settings"
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper-2)", minHeight: 44 }}
            >
              <MapPin className="h-4 w-4" />
              Set location in Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const size = "min(76vw, 300px)";
  const accuracyChip =
    sensorState !== "live" ? null
    : headingErr !== null
      ? headingErr < 8 ? { label: "high accuracy", good: true } : headingErr < 20 ? { label: "fair accuracy", good: false } : { label: "low — calibrate", good: false }
      : accuracyLow ? { label: "low — calibrate", good: false } : { label: "live", good: true };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8">
      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Qibla</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {bearing.toFixed(1)}° {bearingToCardinal(bearing)} · {distance !== null ? `${kmToMi(distance).toLocaleString()} mi` : "—"} to the Kaaba
          </p>
        </div>
        <p className="pt-0.5 text-xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">
          قبلة
        </p>
      </div>

      {/* ── Status chips ── */}
      <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
        {accuracyChip && (
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              backgroundColor: accuracyChip.good ? "color-mix(in oklab, var(--color-success) 14%, transparent)" : "color-mix(in oklab, var(--color-warmth, #c9a227) 16%, transparent)",
              color: accuracyChip.good ? "var(--color-success)" : "var(--color-warmth, #c9a227)",
            }}
          >
            {accuracyChip.label}
            {headingErr !== null ? ` ±${headingErr.toFixed(0)}°` : ""}
          </span>
        )}
        <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
          {locSource === "gps" ? "GPS fix" : locSource === "network" ? "saved location" : "profile location"}
        </span>
        <button
          onClick={() => void refreshLocation()}
          disabled={locBusy}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}
        >
          <RefreshCw className={`h-3 w-3 ${locBusy ? "animate-spin" : ""}`} />
          {locBusy ? "locating…" : "refresh"}
        </button>
      </div>

      {/* ── Compass ── */}
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        {/* Lubber line */}
        <div
          className="absolute left-1/2 top-0 z-10 h-5 w-1 -translate-x-1/2 rounded-b"
          style={{ backgroundColor: aligned ? "var(--color-success)" : "var(--color-ink)" }}
        />

        {/* Rotating dial */}
        <div ref={dialRef} className="absolute inset-0 rounded-full" style={{ willChange: "transform" }}>
          <div
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: aligned ? "var(--color-success)" : "var(--color-paper-3)",
              backgroundColor: "var(--color-paper-2)",
              boxShadow: aligned ? "0 0 0 4px color-mix(in oklab, var(--color-success) 25%, transparent), 0 0 40px color-mix(in oklab, var(--color-success) 20%, transparent)" : "none",
              transition: "border-color .3s ease, box-shadow .3s ease",
            }}
          />
          {Array.from({ length: 24 }, (_, i) => {
            const deg = i * 15;
            const major = deg % 90 === 0;
            return (
              <div
                key={deg}
                className="absolute left-1/2 top-1/2"
                style={{
                  width: major ? 2 : 1,
                  height: major ? 14 : 8,
                  backgroundColor: major ? "var(--color-ink-soft)" : "var(--color-paper-3)",
                  transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(calc(${size} / -2 + ${major ? 10 : 7}px))`,
                }}
              />
            );
          })}
          {(["N", "E", "S", "W"] as const).map((dir, i) => (
            <div
              key={dir}
              className="absolute left-1/2 top-1/2 text-sm font-semibold"
              style={{
                color: dir === "N" ? "var(--color-accent)" : "var(--color-ink-soft)",
                transform: `translate(-50%, -50%) rotate(${i * 90}deg) translateY(calc(${size} / -2 + 32px))`,
              }}
            >
              {dir}
            </div>
          ))}

          {/* Qibla marker + ray */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) rotate(${bearing}deg)` }}
          >
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: 2,
                height: `calc(${size} / 2 - 56px)`,
                backgroundColor: aligned ? "var(--color-success)" : "var(--color-accent)",
                transform: "translate(-50%, -100%)",
                borderRadius: 2,
                transition: "background-color .3s ease",
              }}
            />
            <div
              className="absolute left-1/2 flex h-11 w-11 items-center justify-center rounded-full border-2"
              style={{
                transform: `translate(-50%, -50%) translateY(calc(${size} / -2 + 58px)) rotate(${-bearing}deg)`,
                backgroundColor: aligned ? "var(--color-success)" : "var(--color-ink)",
                borderColor: "var(--color-paper)",
                transition: "background-color .3s ease",
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ color: "var(--color-paper)" }} fill="currentColor" aria-label="Kaaba">
                <path d="M4 9l8-3.2L20 9v9l-8 3.2L4 18V9zm8-1.9L6.4 9.6 12 12l5.6-2.4L12 7.1zm-6.4 3.6v6.4l5.4 2.1v-6.7l-5.4-1.8zm7.4 6.2l5.4-2.1v-6.2l-5.4 1.8v6.5z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Center readout */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
            {headingDeg !== null ? `${headingDeg}°` : "—"}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: aligned ? "var(--color-success)" : "var(--color-ink-muted)" }}>
            {aligned ? "Facing Qibla" : "heading"}
          </p>
          {!aligned && turnDelta !== null && sensorState === "live" && (
            <p className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
              {turnDelta > 0 ? `turn ↻ ${turnDelta}°` : `turn ↺ ${-turnDelta}°`}
            </p>
          )}
        </div>
      </div>

      {/* ── Guidance / states ── */}
      <div className="mt-6">
        {needsIosGesture && (
          <button
            onClick={handleEnableCompass}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)", minHeight: 48 }}
          >
            <Compass className="h-5 w-5" />
            Enable live compass
          </button>
        )}

        {sensorState === "live" && !aligned && (
          <p className="text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Hold the phone flat and turn until the Kaaba marker reaches the top.
          </p>
        )}
        {aligned && (
          <p className="text-center text-sm font-medium" style={{ color: "var(--color-success)" }}>
            You are facing the Qibla — قبلة
          </p>
        )}
        {sensorState === "live" && stale && (
          <Warn text="Compass readings stalled — move the phone or reopen the page if the needle is frozen." />
        )}
        {sensorState === "live" && !stale && accuracyLow && (
          <Warn text="Compass accuracy is low — wave the phone in a slow figure-8 to calibrate." />
        )}
        {(sensorState === "relative-only" || sensorState === "unavailable" || sensorState === "denied") && !needsIosGesture && (
          <Warn
            text={
              sensorState === "denied"
                ? "Motion access was denied — enable it in browser settings for the live compass. The bearing below still works."
                : sensorState === "relative-only"
                  ? "This browser can't find true north. Use the bearing below with a physical compass."
                  : `No live compass sensor detected. Use the bearing below with a physical compass.${sensorDiag ? ` (${sensorDiag})` : ""}`
            }
          />
        )}
      </div>

      {/* ── Info panel ── */}
      <div className="mt-6 space-y-3">
        <InfoRow icon={<Navigation2Icon />} label="Bearing from true north" value={`${bearing.toFixed(1)}° ${bearingToCardinal(bearing)}`} />
        {distance !== null && (
          <InfoRow
            icon={<MapPin className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />}
            label="Distance to Kaaba"
            value={`${kmToMi(distance).toLocaleString()} mi · ${distance.toLocaleString()} km`}
          />
        )}
        {declination !== null && (
          <InfoRow
            icon={<Compass className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />}
            label="Magnetic declination"
            value={`${declination >= 0 ? "+" : ""}${declination.toFixed(1)}° corrected`}
          />
        )}
        <InfoRow
          icon={<LocateFixed className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />}
          label="Your location"
          value={`${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`}
        />
      </div>

      <p className="mt-5 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Geodesic bearing on WGS84, corrected to true north — all computed on
        device, works with no internet. Phone compasses drift near metal;
        for certainty verify with a physical compass.
      </p>
    </div>
  );
}

function Navigation2Icon() {
  return <Compass className="h-4 w-4" style={{ color: "var(--color-accent)" }} />;
}

function Warn({ text }: { text: string }) {
  return (
    <div
      className="mt-3 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-warmth, #c9a227)" }} />
      <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>{text}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{label}</span>
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>{value}</span>
    </div>
  );
}

function kmToMi(km: number): number {
  return Math.round(km * 0.621371);
}
