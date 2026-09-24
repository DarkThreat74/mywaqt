/**
 * Central site configuration — the SINGLE place the domain is set.
 *
 * To switch domains, set NEXT_PUBLIC_SITE_DOMAIN in the environment
 * (Vercel project env vars, .env for local/capacitor builds). Everything —
 * SITE_URL, support email, metadata, sitemap, robots.txt, deep links,
 * Capacitor server.url, Nominatim User-Agent — derives from it.
 *
 * Still manual on a domain change:
 *   - DNS / Vercel custom domain for the new domain
 *   - R2 CORS policy
 *   - VAPID_SUBJECT / EMAIL_FROM env vars if you override them
 */

/** The bare domain (no protocol). Used for deep links, CSP, etc. */
export const SITE_DOMAIN =
  process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'mywaqtapp.vercel.app';

/** The full origin URL (no trailing slash). Used for absolute URLs. */
export const SITE_URL = `https://${SITE_DOMAIN}`;

/** Support contact email. */
export const SUPPORT_EMAIL = `support@${SITE_DOMAIN}`;

/** App name (used in User-Agent strings, metadata, etc.) */
export const APP_NAME = 'Waqt';

/** App version string for User-Agent. */
export const APP_VERSION = '1.0';

/** User-Agent string for outbound API calls (e.g. Nominatim geocoding). */
export const HTTP_USER_AGENT = `${APP_NAME}/${APP_VERSION} (${SITE_URL})`;

/**
 * Capacitor / native app bundle ID.
 * Changing this requires a new App Store / Play Store listing.
 */
export const APP_BUNDLE_ID = 'com.waqt.app';
