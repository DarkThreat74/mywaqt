/**
 * Central site configuration — the SINGLE place to change when switching domains.
 *
 * When you switch from waqt.app to mywaqt.app (or any other domain):
 *   1. Change `SITE_DOMAIN` below
 *   2. Change `SITE_URL` below
 *   3. Change `SUPPORT_EMAIL` below (if applicable)
 *   4. Update env vars on Vercel: APP_URL, NEXT_PUBLIC_APP_URL, VAPID_SUBJECT
 *   5. Update R2 CORS policy to include the new domain
 *   6. Update Cloudflare DNS / Vercel custom domain
 *
 * Everything else (metadata, sitemap, robots.txt, Capacitor, deep links,
 * support email links, Nominatim User-Agent) reads from this file.
 */

/** The bare domain (no protocol). Used for deep links, CSP, etc. */
export const SITE_DOMAIN = 'waqt.app';

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
