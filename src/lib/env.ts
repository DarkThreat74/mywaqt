import 'server-only';
import { SITE_URL } from '@/lib/site-config';

/**
 * Centralized server-side environment variables.
 * NEVER use process.env directly in any other file — import from here.
 * See CODEBASE_PATTERNS.md §28 (Environment Variable Management).
 */

function required(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val) return val;
  if (fallback !== undefined) return fallback;
  // No value and no fallback — this is a missing required env var.
  // Warn loudly in all environments. We don't throw during build (NODE_ENV=production
  // is set by `next build` for page data collection) because that would break the build
  // even for features that aren't being used. Features that need this var will fail
  // at runtime with a clear error from their own validation.
  if (process.env.NODE_ENV === 'production') {
    console.error(`[env] CRITICAL: Missing required environment variable: ${key} — this feature will fail at runtime.`);
  } else {
    console.warn(`[env] Missing required environment variable: ${key} — some features will not work.`);
  }
  return '';
}

export const env = {
  // Database
  databaseUrl: required('DATABASE_URL'),

  // Auth
  sessionSecret: required('SESSION_SECRET'),

  // App
  appUrl: required('APP_URL', 'http://localhost:3000'),
  isProduction: process.env.NODE_ENV === 'production',

  // Cron
  cronSecret: required('CRON_SECRET'),

  // AlAdhan
  aladhanBaseUrl: required('ALADHAN_BASE_URL', 'https://api.aladhan.com/v1'),

  // Twilio
  twilioAccountSid: required('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: required('TWILIO_AUTH_TOKEN'),
  twilioFromNumber: required('TWILIO_FROM_NUMBER'),

  // Stripe
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET'),

  // Web Push
  vapidPublicKey: required('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: required('VAPID_PRIVATE_KEY'),
  vapidSubject: required('VAPID_SUBJECT', SITE_URL),

  // Cloudflare Turnstile (bot protection)
  turnstileSecretKey: required('TURNSTILE_SECRET_KEY'),

  // Cloudflare R2 (talks audio storage)
  r2AccountId: required('R2_ACCOUNT_ID'),
  r2AccessKeyId: required('R2_ACCESS_KEY_ID'),
  r2SecretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  r2BucketName: required('R2_BUCKET_NAME', 'waqt-talks'),
} as const;
