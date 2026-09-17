"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Compass, MapPin, Navigation, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface QiblaData {
  bearing: number;
  distance: number;
  cardinal: string;
  userLocation: { latitude: number; longitude: number };
}

/**
 * Qibla compass — v3 (rewrite).
 *
 * Heading pipeline fixes vs v2:
 * 1. Screen-orientation compensation — alpha/webkitCompassHeading are measured
 *    against the device's physical top edge. screen.orientation.angle is added
 *    so rotating the phone to landscape doesn't swing the dial ~90°.
 * 2. Absolute vs relative events are separated. `deviceorientation` alpha is a
 *    relative frame (zero = whatever direction the phone faced at page load) —
 *    mixing it with true-north `deviceorientationabsolute` data corrupts the
 *    filter. Only absolute readings (e.absolute === true, or iOS
 *    webkitCompassHeading) feed the compass.
 * 3. Tilt-compensated heading via the W3C worked-example rotation components,
 *    which stays correct when the phone isn't perfectly vertical.
 * 4. Alignment detection — when the Qibla marker sits under the lubber line
 *    within ±4°, the UI signals "facing Qibla" and pulses the haptic motor.
 *
 * Sensor reality check (why "is it even fixable"): phone magnetometers drift
 * ±10-20° near metal/magnets and need figure-8 calibration. That's a hardware
 * limit — the UI now says so instead of pretending to be exact.
 */
export default function QiblaCompassClient() {
  const [data, setData] = useState<QiblaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorState, setSensorState] = useState<"idle" | "live" | "relative-only" | "unavailable">("idle");
  const [aligned, setAligned] = useState(false);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  // Signed delta from current heading to the Qibla: + = turn right, - = turn left
  const [turnDelta, setTurnDelta] = useState<number | null>(null);

  // Refs for the rAF render loop — never trigger re-renders per frame
  const filteredHeadingRef = useRef<number | null>(null);
  const currentHeadingRef = useRef(0);
  const dialRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const bearingRef = useRef(0);
  const hasAbsoluteRef = useRef(false);
  const sawAnyEventRef = useRef(false);
  const alignedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastReadoutRef = useRef(-1);

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
    const onPageShow = () => fetchData();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  function angleDelta(from: number, to: number): number {
    let d = ((to - from) % 360 + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  // Current screen rotation — alpha is in the device frame, the screen's "up"
  // rotates relative to it when the device is in landscape.
  function screenAngle(): number {
    const a = window.screen?.orientation?.angle;
    if (typeof a === "number") return a;
    const legacy = (window as unknown as { orientation?: number }).orientation;
    return typeof legacy === "number" ? legacy : 0;
  }

  // ── rAF render loop — lerps the dial toward the filtered heading ──
  const RAF_ALPHA = 0.14;
  const DEADZONE = 0.25;

  useEffect(() => {
    const tick = () => {
      const filtered = filteredHeadingRef.current;
      if (filtered !== null) {
        const dh = angleDelta(currentHeadingRef.current, filtered);
        if (Math.abs(dh) > DEADZONE) {
          currentHeadingRef.current = (currentHeadingRef.current + dh * RAF_ALPHA + 360) % 360;
        }
        if (dialRef.current) {
          dialRef.current.style.transform = `rotate(${-currentHeadingRef.current}deg)`;
        }

        // Alignment: Qibla marker sits at bearing on the dial; when the dial's
        // rotation puts it under the top lubber line, the user faces Qibla.
        const deltaToQibla = angleDelta(currentHeadingRef.current, bearingRef.current);
        const isAligned = Math.abs(deltaToQibla) <= 4;
        if (isAligned !== alignedRef.current) {
          alignedRef.current = isAligned;
          setAligned(isAligned);
          if (isAligned && navigator.vibrate) navigator.vibrate(40);
        }

        // Live readout — throttle state updates to ~4/sec
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
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Sensor listeners ──
  const startListening = useCallback(() => {
    const SENSOR_ALPHA = 0.22; // low-pass on raw readings, kills sensor noise

    function updateHeading(raw: number) {
      const prev = filteredHeadingRef.current;
      if (prev === null) {
        filteredHeadingRef.current = raw;
        currentHeadingRef.current = raw;
      } else {
        filteredHeadingRef.current = (prev + angleDelta(prev, raw) * SENSOR_ALPHA + 360) % 360;
      }
    }

    // True-north sources only. Anything else is ignored — a relative reading
    // would corrupt the filter.
    const handler = (e: Event) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      sawAnyEventRef.current = true;

      // iOS Safari: already true compass heading, clockwise from north.
      if (typeof ev.webkitCompassHeading === "number" && !Number.isNaN(ev.webkitCompassHeading)) {
        hasAbsoluteRef.current = true;
        updateHeading((ev.webkitCompassHeading + screenAngle() + 360) % 360);
        return;
      }

      // Absolute events only — e.absolute === false means alpha is relative
      // to page load, which is useless for finding north.
      if (ev.absolute === true && ev.alpha !== null && ev.beta !== null && ev.gamma !== null &&
          typeof ev.alpha === "number" && typeof ev.beta === "number" && typeof ev.gamma === "number") {
        hasAbsoluteRef.current = true;
        const h = compassHeading(ev.alpha, ev.beta, ev.gamma);
        if (!Number.isNaN(h)) updateHeading((h + screenAngle() + 360) % 360);
      }
    };

    window.addEventListener("deviceorientationabsolute", handler);
    // iOS doesn't fire deviceorientationabsolute — webkitCompassHeading arrives
    // on the plain event. On Android the plain event is relative and ignored.
    window.addEventListener("deviceorientation", handler);

    // If sensors only ever deliver relative data (or nothing), tell the user.
    const stateTimer = setTimeout(() => {
      if (!hasAbsoluteRef.current) {
        setSensorState(sawAnyEventRef.current ? "relative-only" : "unavailable");
      } else {
        setSensorState("live");
      }
    }, 2500);
    const liveTimer = setInterval(() => {
      setSensorState(hasAbsoluteRef.current ? "live" : sawAnyEventRef.current ? "relative-only" : "unavailable");
    }, 2000);

    cleanupRef.current = () => {
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
      clearTimeout(stateTimer);
      clearInterval(liveTimer);
    };
  }, []);

  // ── Enable compass (iOS needs a user-gesture permission request) ──
  const handleEnableCompass = useCallback(async () => {
    if (cleanupRef.current) return; // already listening — don't double-register
    const doe = typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined;
    if (!doe) {
      setSensorState("unavailable");
      return;
    }
    const requestPermission = (doe as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof requestPermission === "function") {
      try {
        const result = await requestPermission.call(doe);
        if (result !== "granted") {
          setSensorState("unavailable");
          return;
        }
      } catch {
        setSensorState("unavailable");
        return;
      }
    }
    startListening();
  }, [startListening]);

  // Auto-enable on platforms that don't gate orientation behind a permission
  // (Android Chrome, desktop). iOS requires the button tap — it stays "idle"
  // until then, which is what shows the enable button.
  useEffect(() => {
    const doe = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (window.DeviceOrientationEvent && typeof doe.requestPermission !== "function") {
      startListening();
    }
    return () => { cleanupRef.current?.(); };
  }, [startListening]);

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

  const size = "min(78vw, 300px)";

  return (
    <div className="mx-auto max-w-md">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--color-ink)" }}>Qibla</h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {data.bearing}° {data.cardinal} · {data.distance.toLocaleString()} km to the Kaaba
          </p>
        </div>
        <p className="pt-0.5 text-xl leading-none" style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }} aria-hidden="true">
          قبلة
        </p>
      </div>

      {/* ── Compass ── */}
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        {/* Fixed lubber line at top — the direction the phone's top edge faces */}
        <div
          className="absolute left-1/2 top-0 z-10 h-5 w-1 -translate-x-1/2 rounded-b"
          style={{ backgroundColor: aligned ? "var(--color-success)" : "var(--color-ink)" }}
        />

        {/* Rotating dial — the whole compass card turns opposite to heading so
            screen-top points at real-world north */}
        <div
          ref={dialRef}
          className="absolute inset-0 rounded-full"
          style={{ willChange: "transform" }}
        >
          {/* Face */}
          <div
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: aligned ? "var(--color-success)" : "var(--color-paper-3)",
              backgroundColor: "var(--color-paper-2)",
              transition: "border-color 0.3s ease",
            }}
          />

          {/* Degree ticks — every 15°, major at cardinals */}
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

          {/* Cardinal letters */}
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

          {/* Qibla marker — pinned on the dial at the true bearing, so it only
              sits under the lubber line when the user faces Mecca */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) rotate(${data.bearing}deg)`,
            }}
          >
            {/* Ray from center toward the marker */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: 2,
                height: `calc(${size} / 2 - 56px)`,
                backgroundColor: aligned ? "var(--color-success)" : "var(--color-accent)",
                transform: "translate(-50%, -100%)",
                borderRadius: 2,
                transition: "background-color 0.3s ease",
              }}
            />
            <div
              className="absolute left-1/2 flex h-11 w-11 items-center justify-center rounded-full border-2"
              style={{
                transform: `translate(-50%, -50%) translateY(calc(${size} / -2 + 58px)) rotate(${-data.bearing}deg)`,
                backgroundColor: "var(--color-ink)",
                borderColor: aligned ? "var(--color-success)" : "var(--color-paper)",
                transition: "border-color 0.3s ease",
              }}
            >
              <span className="text-base leading-none">🕋</span>
            </div>
          </div>
        </div>

        {/* Center pivot + live heading readout (doesn't rotate) */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
            {headingDeg !== null ? `${headingDeg}°` : "—"}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: aligned ? "var(--color-success)" : "var(--color-ink-muted)" }}>
            {aligned ? "Facing Qibla" : "heading"}
          </p>
          {/* Turn hint — which way to rotate */}
          {!aligned && turnDelta !== null && sensorState === "live" && (
            <p className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
              {turnDelta > 0 ? `↻ ${turnDelta}°` : `↺ ${-turnDelta}°`}
            </p>
          )}
        </div>
      </div>

      {/* ── Status / CTA ── */}
      <div className="mt-6">
        {sensorState === "idle" && (
          <button
            onClick={handleEnableCompass}
            className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors"
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

        {sensorState === "live" && !aligned && (
          <p className="text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Hold the phone flat and turn until the 🕋 reaches the top marker.
            If it drifts, wave the phone in a figure-8 to calibrate.
          </p>
        )}
        {aligned && (
          <p className="text-center text-sm font-medium" style={{ color: "var(--color-success)" }}>
            You are facing the Qibla
          </p>
        )}

        {(sensorState === "relative-only" || sensorState === "unavailable") && (
          <div
            className="flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-warmth)" }} />
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              {sensorState === "relative-only"
                ? "This browser only provides relative orientation — it can't find true north. Use the bearing below with a physical compass."
                : "No compass sensor detected. Use the bearing below with a physical compass."}
            </p>
          </div>
        )}
      </div>

      {/* ── Info panel ── */}
      <div className="mt-6 space-y-3">
        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Bearing from North</span>
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

      <p className="mt-5 text-center text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        Phone compasses drift near metal and magnets. For precision, verify with
        a physical compass or the sun&apos;s position.
      </p>
    </div>
  );
}

/**
 * Tilt-compensated compass heading from deviceorientation alpha/beta/gamma —
 * the W3C worked-example rotation components, using atan2 for correct
 * quadrant handling. Returns degrees 0–360 clockwise from North (in the
 * device frame; caller adds screen orientation).
 */
function compassHeading(alpha: number, beta: number, gamma: number): number {
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

  return (Math.atan2(rA, rB) * (180 / Math.PI) + 360) % 360;
}
