/**
 * Qibla direction calculation utilities.
 *
 * The Qibla is the direction of the Kaaba in Mecca from the user's location.
 * We use the great-circle bearing formula (spherical trigonometry).
 *
 * Kaaba coordinates: 21.4225°N, 39.8262°E
 */

export const KAABA_LAT = 21.4225;
export const KAABA_LNG = 39.8262;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Vincenty inverse on the WGS84 ellipsoid — the geodesic initial bearing and
 * distance. The spherical great-circle value is off by up to ~0.25° at high
 * latitudes; this is the survey-grade number.
 * Returns null when it fails to converge (antipodal-ish inputs) — callers
 * fall back to the spherical formula.
 */
export function vincentyInverse(
  lat1: number, lng1: number, lat2: number, lng2: number,
): { initialBearing: number; distanceKm: number } | null {
  const a = 6378137;              // WGS84 semi-major axis, metres
  const f = 1 / 298.257223563;    // WGS84 flattening
  const b = a * (1 - f);

  const U1 = Math.atan((1 - f) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(toRad(lat2)));
  const L = toRad(lng2 - lng1);
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let λ = L;
  let sinσ = 0, cosσ = 0, σ = 0, cos2σm = 0, cosSqα = 0;
  for (let i = 0; i < 100; i++) {
    const sinλ = Math.sin(λ), cosλ = Math.cos(λ);
    sinσ = Math.sqrt(
      (cosU2 * sinλ) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosλ) ** 2,
    );
    if (sinσ === 0) return null; // coincident points
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
    σ = Math.atan2(sinσ, cosσ);
    const sinα = (cosU1 * cosU2 * sinλ) / sinσ;
    cosSqα = 1 - sinα * sinα;
    cos2σm = cosSqα === 0 ? 0 : cosσ - (2 * sinU1 * sinU2) / cosSqα;
    const C = (f / 16) * cosSqα * (4 + f * (4 - 3 * cosSqα));
    const λPrev = λ;
    λ = L + (1 - C) * f * sinα * (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
    if (Math.abs(λ - λPrev) < 1e-12) break;
    if (i === 99) return null; // didn't converge
  }

  const uSq = (cosSqα * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const Δσ = B * sinσ * (cos2σm + (B / 4) * (cosσ * (-1 + 2 * cos2σm * cos2σm) - (B / 6) * cos2σm * (-3 + 4 * sinσ * sinσ) * (-3 + 4 * cos2σm * cos2σm)));

  const distanceKm = (b * A * (σ - Δσ)) / 1000;
  const α1 = Math.atan2(cosU2 * Math.sin(λ), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(λ));
  return { initialBearing: (toDeg(α1) + 360) % 360, distanceKm };
}

/**
 * Calculate the Qibla bearing (degrees clockwise from North) from a given location.
 *
 * Geodesic on WGS84 (Vincenty) when it converges — the survey-grade answer —
 * falling back to the spherical great-circle formula:
 *   θ = atan2(sin(Δλ)·cos(φ₂), cos(φ₁)·sin(φ₂) − sin(φ₁)·cos(φ₂)·cos(Δλ))
 *
 * @param userLat User's latitude in degrees
 * @param userLng User's longitude in degrees
 * @returns Bearing in degrees (0-360, clockwise from North)
 */
export function calculateQiblaBearing(userLat: number, userLng: number): number {
  const geo = vincentyInverse(userLat, userLng, KAABA_LAT, KAABA_LNG);
  if (geo) return geo.initialBearing;

  const φ1 = toRad(userLat);
  const φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - userLng);

  const x = Math.sin(Δλ) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const bearing = toDeg(Math.atan2(x, y));
  return (bearing + 360) % 360;
}

/**
 * Calculate the great-circle distance between two points using the Haversine formula.
 *
 * @param userLat User's latitude in degrees
 * @param userLng User's longitude in degrees
 * @returns Distance in kilometers
 */
export function calculateDistance(userLat: number, userLng: number): number {
  const geo = vincentyInverse(userLat, userLng, KAABA_LAT, KAABA_LNG);
  if (geo) return Math.round(geo.distanceKm);

  const R = 6371; // Earth's radius in km
  const φ1 = toRad(userLat);
  const φ2 = toRad(KAABA_LAT);
  const Δφ = toRad(KAABA_LAT - userLat);
  const Δλ = toRad(KAABA_LNG - userLng);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Convert a bearing (0-360°) to a cardinal direction label.
 *
 * @param bearing Degrees clockwise from North
 * @returns Cardinal label like "N", "NNE", "NE", "ENE", "E", etc.
 */
export function bearingToCardinal(bearing: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(bearing / 22.5) % 16;
  return dirs[idx];
}
