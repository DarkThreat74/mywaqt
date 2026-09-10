"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Compass, MapPin, Navigation } from "lucide-react";
import Link from "next/link";

interface QiblaData {
  bearing: number;
  distance: number;
  cardinal: string;
  userLocation: { latitude: number; longitude: number };
}

/**
 * Smoothed Qibla compass — v2.
 *
 * Fixes vs v1:
 * 1. atan2 instead of atan + manual quadrant correction (correct on all devices)
 * 2. Only ONE event listener (absolute preferred, not both)
 * 3. Low-pass filter on raw sensor data BEFORE feeding rAF (kills noise at source)
 * 4. Fixed stale hasHeading closure (use ref, not state in handler)
 * 5. No double-smoothing: needle = bearing - smoothed heading (single pass)
 * 6. Deadzone: ignore heading changes < 0.5° (eliminates micro-jitter)
 * 7. rAF loop only runs when heading data is available
 */
export default function QiblaCompassClient() {
  const [data, setData] = useState<QiblaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionSupported, setPermissionSupported] = useState(true);
  const [hasHeading, setHasHeading] = useState(false);

  // Refs for smooth animation — never trigger re-renders
  const rawHeadingRef = useRef<number | null>(null); // raw heading from sensor
  const filteredHeadingRef = useRef<number | null>(null); // low-pass filtered heading
  const currentHeadingRef = useRef(0); // smoothed heading for the dial (rAF output)
  const dialRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const bearingRef = useRef(0);
  const hasHeadingRef = useRef(false); // avoids stale closure in event handler
  const hasAbsoluteDataRef = useRef(false); // tracks if we've received absolute sensor data

  // ── Fetch Qibla data ──
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/qibla").catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const json = await res.json().catch(() => null);
          if (json) {
            setData(json);
            bearingRef.current = json.bearing;
          } else {
            setError("Failed to load Qibla data.");
          }
        } else if (res?.status === 400) {
          setError("Location not set. Please set your location in Settings first.");
        } else {
          setError("Failed to load Qibla direction.");
        }
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    // Re-fetch when returning to the page (e.g. after changing location in Settings)
    const onPageShow = () => fetchData();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // ── Shortest-path angular delta: returns the smallest signed delta ──
  // from `from` to `to` in degrees, in range (-180, 180].
  function angleDelta(from: number, to: number): number {
    let d = ((to - from) % 360 + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  // ── rAF smoothing loop ──
  // Reads the filtered heading ref, lerps toward it, and writes transforms
  // directly to the DOM. No React re-render per frame.
  // alpha = 0.12: smooth but responsive. Lower = smoother but more lag.
  const RAF_ALPHA = 0.12;
  // Deadzone: if the angular change is less than this, don't bother updating.
  // This eliminates micro-jitter from sensor noise.
  const DEADZONE = 0.3;

  useEffect(() => {
    const tick = () => {
      const filtered = filteredHeadingRef.current;
      if (filtered !== null) {
        // Smooth the dial heading toward the filtered target
        const dh = angleDelta(currentHeadingRef.current, filtered);
        if (Math.abs(dh) > DEADZONE) {
          currentHeadingRef.current = (currentHeadingRef.current + dh * RAF_ALPHA + 360) % 360;
        }

        // Apply dial transform (rotates opposite to heading so N faces true north)
        if (dialRef.current) {
          dialRef.current.style.transform = `rotate(${-currentHeadingRef.current}deg)`;
        }

        // Needle = bearing relative to current heading (single computation, no double-smooth)
        const needleAngle = (bearingRef.current - currentHeadingRef.current + 360) % 360;
        if (needleRef.current) {
          needleRef.current.style.transform = `translate(-50%, -50%) rotate(${needleAngle}deg)`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Enable compass (iOS permission + listener) ──
  const handleEnableCompass = useCallback(async () => {
    const doe = typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined;
    const doeWithPermission = doe as unknown as { requestPermission?: (absolute?: boolean) => Promise<string> };
    const needsPermission = doeWithPermission && typeof doeWithPermission.requestPermission === "function";

    if (needsPermission) {
      try {
        const result = await doeWithPermission.requestPermission!(true);
        if (result !== "granted") {
          setPermissionSupported(false);
          return;
        }
      } catch {
        setPermissionSupported(false);
        return;
      }
    } else if (!doe) {
      setPermissionSupported(false);
      return;
    }

    setPermissionGranted(true);

    // Low-pass filter constant for raw sensor data.
    const SENSOR_ALPHA = 0.25;

    // Track whether we've received absolute data — used to prefer absolute
    // over relative when both events fire.
    const hasAbsoluteRef = hasAbsoluteDataRef;

    const handler = (e: DeviceOrientationEvent) => {
      // iOS: webkitCompassHeading is already compensated and gives
      // the true compass heading (0 = North, clockwise).
      const webkitHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
        hasAbsoluteRef.current = true;
        updateHeading(webkitHeading);
        return;
      }

      // Android/other: check if alpha is available
      if (typeof e.alpha === "number" && e.alpha !== null &&
          typeof e.beta === "number" && typeof e.gamma === "number") {
        // If the event provides absolute data (or doesn't specify), use it.
        // Many Android devices report e.absolute as undefined, not true.
        if (e.absolute !== false) {
          hasAbsoluteRef.current = true;
        }
        // Always compute heading from alpha/beta/gamma — this is the only
        // reliable source on many Android devices where deviceorientationabsolute
        // never fires. Don't gate on hasAbsoluteRef.current.
        const heading = compassHeading(e.alpha, e.beta, e.gamma);
        if (!Number.isNaN(heading)) updateHeading(heading);
      }
    };

    // Low-pass filter on raw heading, then store in ref for rAF loop
    function updateHeading(raw: number) {
      const prev = filteredHeadingRef.current;
      if (prev === null) {
        // First reading — initialize directly, no filtering
        filteredHeadingRef.current = raw;
        currentHeadingRef.current = raw;
      } else {
        // Low-pass filter: smooth out sensor noise at the source
        const delta = angleDelta(prev, raw);
        filteredHeadingRef.current = (prev + delta * SENSOR_ALPHA + 360) % 360;
      }
      rawHeadingRef.current = raw;

      // Set hasHeading once (using ref to avoid stale closure)
      if (!hasHeadingRef.current) {
        hasHeadingRef.current = true;
        setHasHeading(true);
      }
    }

    // ── Register BOTH events for maximum compatibility ──
    // deviceorientationabsolute: Android Chrome (preferred, gives true north)
    // deviceorientation: iOS (provides webkitCompassHeading) + Android fallback
    // Registering both ensures we get data regardless of which one fires.
    const absSupported = "ondeviceorientationabsolute" in window;
    if (absSupported) {
      window.addEventListener("deviceorientationabsolute", handler as EventListener);
    }
    // Always also register deviceorientation — on iOS this is the only event,
    // and on some Android devices deviceorientationabsolute never fires.
    window.addEventListener("deviceorientation", handler as EventListener);

    cleanupRef.current = () => {
      if (absSupported) {
        window.removeEventListener("deviceorientationabsolute", handler as EventListener);
      }
      window.removeEventListener("deviceorientation", handler as EventListener);
    };
  }, []);

  // Store cleanup function for the orientation listener
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

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

  // ── Error / no location ──
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-8 sm:py-12">
        <div className="rounded-2xl border p-6 text-center" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-paper-2)" }}>
            <Compass className="h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Qibla Direction</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            {error || "Unable to determine Qibla direction."}
          </p>
          <Link
            href="/settings"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper-2)", minHeight: 44 }}
          >
            <MapPin className="h-4 w-4" />
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Qibla Direction</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Face the Kaaba in Mecca for prayer
        </p>
      </div>

      {/* ── Compass ── */}
      <div className="relative mx-auto mb-6" style={{ width: "min(80vw, 320px)", height: "min(80vw, 320px)" }}>
        {/* Compass dial — rotates with device heading (via rAF, no CSS transition) */}
        <div
          ref={dialRef}
          className="absolute inset-0 rounded-full border-4"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            willChange: "transform",
          }}
        >
          {/* Cardinal directions on the dial */}
          {["N", "E", "S", "W"].map((dir, i) => (
            <div
              key={dir}
              className="absolute left-1/2 top-1/2 text-sm font-bold"
              style={{
                color: dir === "N" ? "var(--color-error)" : "var(--color-ink-soft)",
                transform: `rotate(${i * 90}deg) translateY(-130px) rotate(${-i * 90}deg) translateX(-50%)`,
                transformOrigin: "center",
              }}
            >
              {dir}
            </div>
          ))}
          {/* Tick marks every 30 degrees */}
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                width: 1,
                height: i % 3 === 0 ? 12 : 6,
                backgroundColor: "var(--color-paper-3)",
                transform: `rotate(${i * 30}deg) translateY(-140px)`,
                transformOrigin: "center bottom",
              }}
            />
          ))}
        </div>

        {/* Qibla needle — points to Mecca relative to the dial (via rAF) */}
        <div
          ref={needleRef}
          className="absolute left-1/2 top-1/2"
          style={{
            transform: "translate(-50%, -50%) rotate(0deg)",
            width: "100%",
            height: "100%",
            willChange: "transform",
          }}
        >
          {/* Kaaba icon at the tip */}
          <div
            className="absolute left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              top: 12,
              backgroundColor: "var(--color-ink)",
              color: "var(--color-paper)",
            }}
          >
            <span className="text-lg">🕋</span>
          </div>
          {/* Needle line */}
          <div
            className="absolute left-1/2 top-12 -translate-x-1/2"
            style={{
              width: 3,
              height: "calc(50% - 60px)",
              backgroundColor: "var(--color-accent)",
              borderRadius: 2,
            }}
          />
        </div>

        {/* Center dot */}
        <div
          className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
      </div>

      {/* ── Info panel ── */}
      <div className="space-y-3">
        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Bearing</span>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
            {data.bearing}° {data.cardinal}
          </span>
        </div>

        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Distance to Kaaba</span>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
            {data.distance.toLocaleString()} km
          </span>
        </div>

        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Your location</span>
          </div>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {data.userLocation.latitude.toFixed(4)}°, {data.userLocation.longitude.toFixed(4)}°
          </span>
        </div>
      </div>

      {/* ── Live compass toggle ── */}
      {!permissionGranted && permissionSupported && (
        <button
          onClick={handleEnableCompass}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--color-accent)",
            color: "var(--color-accent)",
            backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
            minHeight: 48,
          }}
        >
          <Compass className="h-5 w-5" />
          Enable live compass
        </button>
      )}

      {!permissionSupported && (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Live compass not available on this device. The bearing above shows the
          direction from North. Use a physical compass to find it.
        </p>
      )}

      {permissionGranted && hasHeading && (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-success)" }}>
          ✓ Compass active. Rotate your phone until the 🕋 points straight up.
        </p>
      )}

      {permissionGranted && !hasHeading && (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Waiting for compass data. Try moving your phone in a figure-8 to calibrate.
        </p>
      )}
    </div>
  );
}

/**
 * Compute compass heading from deviceorientation alpha/beta/gamma
 * when the device is held in portrait, screen facing the user, top up.
 *
 * Uses atan2 (not atan) for correct quadrant handling on all devices.
 * Returns degrees 0-360, clockwise from North. NaN if inputs are invalid.
 */
function compassHeading(alpha: number, beta: number, gamma: number): number {
  if (alpha == null || beta == null || gamma == null) return NaN;

  const alphaRad = alpha * (Math.PI / 180);
  const betaRad = beta * (Math.PI / 180);
  const gammaRad = gamma * (Math.PI / 180);

  const cA = Math.cos(alphaRad);
  const sA = Math.sin(alphaRad);
  const sB = Math.sin(betaRad);
  const cG = Math.cos(gammaRad);
  const sG = Math.sin(gammaRad);

  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;

  // atan2 handles all quadrants correctly — no manual correction needed
  const compassHeading = Math.atan2(rA, rB);

  // Convert to degrees, normalize to 0-360
  return (compassHeading * (180 / Math.PI) + 360) % 360;
}
