# RingProof Codebase Patterns & Techniques

A complete reference for AI coders working on this codebase. Every pattern, technique,
and architectural decision is documented here with file paths, line numbers, and short
code snippets so you can learn from them and apply them correctly.

---

## Table of Contents

1. [Security & Access Control](#1-security--access-control)
   - [Supabase Row Level Security (RLS)](#supabase-row-level-security-rls)
   - [Admin & Worker Authentication](#admin--worker-authentication)
   - [Portal Session Authentication](#portal-session-authentication)
   - [Onboarding Token Authentication](#onboarding-token-authentication)
   - [Webhook Signature Verification](#webhook-signature-verification)
   - [Cron Authentication](#cron-authentication)
   - [Rate Limiting](#rate-limiting)
   - [SQL Injection Prevention](#sql-injection-prevention)
   - [Secrets Management](#secrets-management)
   - [PHI Scrubbing](#phi-scrubbing)
   - [URL Validation (SSRF Prevention)](#url-validation-ssrf-prevention)
   - [Encryption at Rest (AES-256-GCM)](#encryption-at-rest-aes-256-gcm)
   - [Cookie Security](#cookie-security)
   - [Input Validation](#input-validation)
2. [Architecture & Provider Abstractions](#2-architecture--provider-abstractions)
   - [Multi-Provider Voice Abstraction](#multi-provider-voice-abstraction)
   - [Provider Implementations](#provider-implementations)
   - [Call Processor](#call-processor)
   - [Webhook Normalization](#webhook-normalization)
   - [Calendar Provider Abstraction](#calendar-provider-abstraction)
   - [Provisioning System](#provisioning-system)
   - [Prompt Builder (Single Source of Truth)](#prompt-builder-single-source-of-truth)
   - [Schema Design & Idempotent Migrations](#schema-design--idempotent-migrations)
   - [Client Status Helpers (Gate-Based Logic)](#client-status-helpers-gate-based-logic)
   - [Addon System](#addon-system)
   - [Metered Billing](#metered-billing)
   - [Commission Calculation](#commission-calculation)
3. [Next.js 16 Patterns](#3-nextjs-16-patterns)
   - [Route Groups & Dynamic Routes](#route-groups--dynamic-routes)
   - [Server vs Client Components](#server-vs-client-components)
   - [after() for Post-Response Work](#after-for-post-response-work)
   - [Turbopack Configuration](#turbopack-configuration)
   - [PWA / Manifest](#pwa--manifest)
   - [SEO / Metadata / JSON-LD](#seo--metadata--json-ld)
   - [Sitemap & Robots.txt](#sitemap--robotstxt)
   - [OG Images](#og-images)
   - [Dynamic Rendering](#dynamic-rendering)
   - [Max Duration](#max-duration)
   - [CSS Architecture & Design Tokens](#css-architecture--design-tokens)
   - [Scroll Reveal Animations](#scroll-reveal-animations)
   - [Tab Switching](#tab-switching)
   - [Mobile Sidebar](#mobile-sidebar)
   - [Form Handling](#form-handling)
   - [Error Boundaries](#error-boundaries)
   - [Loading States](#loading-states)
4. [Integrations & Third-Party Services](#4-integrations--third-party-services)
   - [Stripe Integration](#stripe-integration)
   - [Twilio Telephony](#twilio-telephony)
   - [Retell AI Integration](#retell-ai-integration)
   - [ElevenLabs Integration](#elevenlabs-integration)
   - [Cal.com Integration](#calcom-integration)
   - [Cronofy Integration](#cronofy-integration)
   - [Resend Email](#resend-email)
   - [OpenRouter / LLM](#openrouter--llm)
   - [Supabase Client Pattern](#supabase-client-pattern)
   - [GitHub Actions Cron](#github-actions-cron)
   - [Error Logging](#error-logging)
   - [Activity Logging](#activity-logging)
   - [Google Sheets Integration](#google-sheets-integration)
   - [Make.com Webhook Integration](#makecom-webhook-integration)
   - [Twilio Number Provisioning](#twilio-number-provisioning)
5. [Operational Patterns](#5-operational-patterns)
   - [DB-Save-First, External-Sync-Best-Effort](#db-save-first-external-sync-best-effort)
   - [Idempotency Guards](#idempotency-guards)
   - [Background Processing with after()](#background-processing-with-after)
   - [Pool-First Resource Management](#pool-first-resource-management)
   - [Caching with Fallback](#caching-with-fallback)
   - [Best-Effort External Calls](#best-effort-external-calls)
6. [Building Mindset & Philosophy](#6-building-mindset--philosophy)
7. [Recurring Bug Prevention](#7-recurring-bug-prevention)
8. [Schema Discipline](#8-schema-discipline)
9. [Security Checklist](#9-security-checklist)
10. [CSS & Design Rules](#10-css--design-rules)
11. [AI Reasoning Strategy](#11-ai-reasoning-strategy)
12. [Production-Readiness Audit Methodology](#12-production-readiness-audit-methodology)
13. [Operational Wisdom](#13-operational-wisdom)
14. [Complete Lesson Summary](#14-complete-lesson-summary)
15. [Anti-Patterns Quick Reference](#15-anti-patterns-quick-reference)
16. [Pre-Coding Ritual](#16-pre-coding-ritual)
17. [Sales Portal Architecture](#17-sales-portal-architecture)
18. [Sales Agent Authentication](#18-sales-agent-authentication)
19. [Commission System](#19-commission-system)
20. [Lead Management](#20-lead-management)
21. [Sub-Agent Hierarchy](#21-sub-agent-hierarchy)
22. [ClawCaptcha](#22-clawcaptcha)
23. [Spam Shield](#23-spam-shield)
24. [Onboarding Flow](#24-onboarding-flow)
25. [Landing Page](#25-landing-page)
26. [Proxy & CSP](#26-proxy--csp)
27. [CI/CD Pipeline](#27-cicd-pipeline)
28. [Environment Variable Management](#28-environment-variable-management)
29. [SaaS Starter Kit Checklist](#29-saas-starter-kit-checklist)
30. [Rate Limiting — The Complete Method](#30-rate-limiting--the-complete-method)
31. [Authentication & Session Security — Deep Dive](#31-authentication--session-security--deep-dive)
32. [Database Security & RLS — The Complete Method](#32-database-security--rls--the-complete-method)
33. [Multi-Provider Voice Stack Architecture](#33-multi-provider-voice-stack-architecture)
34. [Payment Security & Subscription Lifecycle](#34-payment-security--subscription-lifecycle)
35. [Cron Jobs, Operations & Reliability](#35-cron-jobs-operations--reliability)
36. [Add-on Gating & Client Status State Machine](#36-add-on-gating--client-status-state-machine)
37. [Calendar, Email, Telephony & LLM Integrations](#37-calendar-email-telephony--llm-integrations)
38. [Landing Page, SEO, PWA & Performance](#38-landing-page-seo-pwa--performance)
39. [Client Portal UI Patterns](#39-client-portal-ui-patterns)
40. [The Security Audit Methodology](#40-the-security-audit-methodology)

---

## 1. Security & Access Control

### Supabase Row Level Security (RLS)

**What it does:** Database-level access control that restricts which rows users can
read/write based on their authentication context and role.

**Why it's done that way:** Defense-in-depth — even if application logic fails, the
database enforces access boundaries. RLS policies run server-side and cannot be
bypassed by client requests.

**File:** `.sql/schema.sql` (lines 1350-1449)

```sql
-- Helper function for admin checks
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Admin policy on user_profiles
create policy "admin_all_user_profiles" on user_profiles for all
  using (is_admin()) with check (is_admin());

-- Worker policy — can only select own profile
create policy "worker_select_user_profiles" on user_profiles for select
  using (auth.uid() = id);

-- Column-level privileges (defense-in-depth)
revoke update on user_profiles from authenticated, anon;
grant update (full_name, worker_label) on user_profiles to authenticated;
```

**Key helper functions:**
- `is_admin()` — checks `user_profiles.role = 'admin'`
- `is_active_worker()` — checks `role = 'worker'` AND `status = 'active'`
- `is_authenticated()` — checks `auth.uid()` is not null

**How to use:** Every new table must have:
1. `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`
2. At minimum, an admin-only policy: `for all using (is_admin()) with check (is_admin())`
3. Tables with RLS enabled but no policies are invisible to all non-service-role clients

---

### Admin & Worker Authentication

**What it does:** Verifies users are authenticated via Supabase Auth and checks their
role in `user_profiles` to authorize admin/worker actions.

**Why it's done that way:** Separates authentication (Supabase Auth) from authorization
(role check). Uses the anon key for RLS-respecting queries, service role key for admin
operations that bypass RLS.

**File:** `src/lib/supabase/server.ts` (lines 1-55)

```typescript
// Server client with anon key — respects RLS
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: { /* cookie handling */ },
    cookieOptions: {
      secure: env.isProduction,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  });
}

// Admin client with service role key — bypasses RLS
export function getSupabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

**Role check pattern** (from `src/app/crm/api/leads/route.ts`, lines 23-31):

```typescript
const { data: profile } = await supabaseAdmin
  .from('user_profiles')
  .select('role, status')
  .eq('id', user.id)
  .single();

if (!profile || (profile.role !== 'admin' &&
    !(profile.role === 'worker' && profile.status === 'active'))) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Admin vs Worker:**
- **Admin:** `role = 'admin'` — full access to all clients and settings
- **Worker:** `role = 'worker'` AND `status = 'active'` — can only access assigned
  clients, limited to specific columns

---

### Portal Session Authentication

**What it does:** Verifies client portal sessions using a SHA-256 hashed token stored
in the database, with constant-time comparison to prevent timing attacks.

**Why it's done that way:** Hashing tokens at rest means a DB compromise doesn't reveal
active session tokens. Timing-safe comparison prevents timing side-channel attacks.
Session tokens are high-entropy (256-bit random) so SHA-256 is sufficient (no slow hash
like bcrypt needed).

**File:** `src/lib/portalSession.ts` (lines 1-121)

```typescript
import { createHash, timingSafeEqual } from 'crypto';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function verifyPortalSession(
  cookieHeader: string | null
): Promise<PortalSessionResult> {
  // Parse cookie — check both __Host-portal_session (prod) and portal_session (dev)
  const sessionToken = cookies['__Host-portal_session'] || cookies.portal_session;

  // Hash before lookup — DB only stores the hash
  const tokenHash = hashSessionToken(sessionToken);
  const tokenHashBuf = Buffer.from(tokenHash, 'hex');

  // Look up session by hash — must not be revoked and must not be expired
  const { data: session } = await supabase
    .from('portal_sessions')
    .select('id, client_id, expires_at, revoked, session_token')
    .eq('session_token', tokenHash)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  // Constant-time re-verification (defense-in-depth against DB timing variance)
  const storedHashBuf = Buffer.from(session.session_token as string, 'hex');
  if (storedHashBuf.length !== tokenHashBuf.length ||
      !timingSafeEqual(storedHashBuf, tokenHashBuf)) {
    return { clientId: null, error: 'Invalid or expired session', status: 401 };
  }

  // Update last_used_at after response (best-effort)
  after(async () => {
    await supabase.from('portal_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', session.id);
  });

  // Verify client still exists and is not deleted/churned
  const { data: clientRow } = await supabase
    .from('clients')
    .select('status')
    .eq('id', session.client_id)
    .maybeSingle();

  if (!clientRow || clientRow.status === 'deleted' || clientRow.status === 'churned') {
    return { clientId: null, error: 'Account inactive', status: 403 };
  }

  return { clientId: session.client_id };
}
```

**Cookie setup** (from `src/app/crm/api/portal/exchange-session/route.ts`, lines 278-286):

```typescript
const cookieName = isProduction ? '__Host-portal_session' : 'portal_session';
response.cookies.set(cookieName, sessionToken, {
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  secure: isProduction,  // Only sent over HTTPS
  sameSite: 'strict',    // Prevents CSRF (not sent on cross-site requests)
  path: '/',             // Required for __Host- prefix
  maxAge: 30 * 24 * 60 * 60, // 30 days
});
```

---

### Onboarding Token Authentication

**What it does:** Authenticates onboarding flow using a token stored in the `clients`
table, with expiry and termination checks.

**Why it's done that way:** Allows public access to onboarding without requiring
Supabase Auth. Expiry prevents indefinite access. Termination allows ending onboarding
after completion.

**File:** `src/app/crm/api/onboarding/chat/route.ts` (lines 56-77)

```typescript
const { data: clientRow } = await supabase
  .from('clients')
  .select('id, status, onboarding_token_terminated_at, onboarding_token_expires_at')
  .eq('onboarding_token', token)
  .maybeSingle();

if (!clientRow) {
  return NextResponse.json({ error: 'Unauthorized or invalid onboarding token' }, { status: 401 });
}
if (clientRow.onboarding_token_expires_at &&
    new Date(clientRow.onboarding_token_expires_at) < new Date()) {
  return NextResponse.json({ error: 'Onboarding link has expired' }, { status: 403 });
}
if (clientRow.onboarding_token_terminated_at) {
  return NextResponse.json({ error: 'Onboarding session has ended' }, { status: 403 });
}
```

**Token termination** (from `src/app/crm/api/onboarding/terminate-token/route.ts`):

```typescript
await supabase.from('clients')
  .update({ onboarding_token_terminated_at: new Date().toISOString() })
  .eq('id', client.id);
```

**Token extension** (from `src/app/crm/api/clients/resume-token/route.ts`):

```typescript
const newExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
await supabaseAdmin.from('clients')
  .update({ onboarding_token_expires_at: newExpiresAt, status: 'incomplete' })
  .eq('id', clientId);
```

---

### Webhook Signature Verification

All webhooks use `crypto.timingSafeEqual()` to prevent timing attacks on signature
comparison. Each provider has a different signature format:

#### Retell Webhook
**File:** `src/lib/retellVerify.ts`

```typescript
export function verifyRetellSignatureWithSecret(
  rawBody: string, secret: string, signatureHeader: string | null,
): boolean {
  // Format: "v=timestamp,d=digest"
  // Validate clock skew (5 minutes threshold)
  const timeDifference = Math.abs(Date.now() - parseInt(timestamp, 10));
  if (timeDifference > 5 * 60 * 1000) return false;

  // HMAC-SHA256 of rawBody + timestamp
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody + timestamp);
  const computedDigest = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(receivedDigest, 'hex'),
    Buffer.from(computedDigest, 'hex'),
  );
}
```

#### Stripe Webhook
**File:** `src/app/crm/api/webhooks/stripe/route.ts` (lines 69-80)

```typescript
// 300-second tolerance for replay attack prevention
event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret, 300);
```

#### ElevenLabs Webhook
**File:** `src/app/crm/api/webhooks/elevenlabs/route.ts` (lines 27-52)

```typescript
function verifyElevenLabsSignature(rawBody: string, signatureHeader: string | null): boolean {
  // Format: "t=timestamp,v1=signature"
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.elevenlabsWebhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const a = Buffer.from(v1Signature, 'hex');
  const b = Buffer.from(expectedSignature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

#### Twilio Webhook
**File:** `src/lib/twilioVerify.ts` (lines 29-76)

```typescript
export function verifyTwilioSignature(
  url: string, params: Record<string, string> | URLSearchParams | FormData,
  signature: string | null,
): boolean {
  // Skip in dev without auth token (for local testing with ngrok)
  if (!env.isProduction && !env.twilioAuthToken) return true;

  // Build signature string: URL + sorted params as "keyvalue"
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const paramString = sorted.map(([k, v]) => `${k}${v}`).join('');
  const data = url + paramString;

  const computed = crypto.createHmac('sha1', env.twilioAuthToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  // Timing-safe comparison
  const computedBuf = Buffer.from(computed);
  const receivedBuf = Buffer.from(signature);
  if (computedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}
```

---

### Cron Authentication

**What it does:** Verifies cron job requests using a Bearer token with timing-safe
comparison.

**Why it's done that way:** Prevents unauthorized cron job execution. Timing-safe
comparison prevents timing side-channel attacks on the secret.

**File:** `src/lib/cronAuth.ts` (lines 1-40)

```typescript
export function verifyCronAuth(authHeader: string | null, isVercelCron = false): boolean {
  const cronSecret = env.cronSecret;

  if (cronSecret && authHeader) {
    const expected = `Bearer ${cronSecret}`;
    if (authHeader.length === expected.length) {
      try {
        return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
      } catch {
        return false;
      }
    }
  }

  // Vercel cron bypass (dev only — no secret configured)
  if (!cronSecret && isVercelCron && !env.isProduction) {
    return true;
  }

  return false;
}
```

**Usage:**

```typescript
const authHeader = req.headers.get('authorization');
if (!verifyCronAuth(authHeader, req.headers.get('x-vercel-cron') === '1')) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

### Rate Limiting

**What it does:** IP-based rate limiting with secure IP extraction to prevent
X-Forwarded-For spoofing.

**Why it's done that way:** Prevents brute force attacks and abuse. Taking the LAST
value in X-Forwarded-For prevents bypass by spoofing the first value (which clients
can control).

**File:** `src/lib/rateLimit.ts` (lines 1-104)

```typescript
export function getClientIp(headers: Headers): string {
  // 1. Vercel's dedicated IP header — cannot be spoofed
  const vercelIp = headers.get('x-vercel-ip');
  if (vercelIp) return vercelIp.trim();

  // 2. x-real-ip — set by trusted reverse proxies
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // 3. X-Forwarded-For — take the LAST value (set by trusted proxy),
  //    NOT the first (which can be client-spoofed)
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return 'unknown';
}

export function checkRateLimit(
  namespace: string, ip: string, maxRequests: number, windowMs: number,
): boolean {
  const key = `${namespace}:${ip}`;
  const now = Date.now();
  const entry = map.get(key);

  if (entry && now < entry.resetAt) {
    if (entry.count >= maxRequests) return false;
    entry.count++;
  } else {
    map.set(key, { count: 1, resetAt: now + windowMs });
  }
  return true;
}
```

**Example rate limits:**
- Onboarding terminate: 5 per hour
- Cronofy authorize: 10 per minute
- Landing chat: 15 per 60 seconds
- Admin set-plan: 20 per hour

---

### SQL Injection Prevention

**What it does:** Uses parameterized Supabase queries and validates tokens before
interpolation into `.or()` filters.

**Why it's done that way:** Supabase client uses parameterized queries by default.
Token validation prevents filter injection when tokens are interpolated into PostgREST
filter strings.

**File:** `src/app/crm/api/onboarding/save-forwarding/route.ts` (lines 15-32)

```typescript
// SECURITY: token is interpolated into PostgREST .or() filter
// Validate token format to prevent filter injection
if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(token)) {
  return NextResponse.json({ error: 'Invalid token.' }, { status: 400 });
}

// Safe .or() usage with validated token
const { data: client } = await supabase
  .from('clients')
  .select('id, onboarding_token_expires_at')
  .or(`onboarding_token.eq.${token},report_token.eq.${token}`)
  .maybeSingle();
```

**Pattern:** Tokens are validated to only contain `[A-Za-z0-9_-]` before being used in
`.or()` filters, preventing injection of special characters like `,`, `.`, `(`, `)`.

---

### Secrets Management

**What it does:** Centralizes all environment variables in a single module and masks
secrets in API responses using a prefix pattern.

**File:** `src/lib/env.ts` (lines 1-217)

```typescript
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  retellApiKey: process.env.RETELL_API_KEY ?? '',
  retellWebhookSecret: process.env.RETELL_WEBHOOK_SECRET ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenlabsWebhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET ?? '',
  // ... all other env vars
};
```

**Secret masking in API responses** (from `src/app/crm/api/webhooks/save-endpoint/route.ts`):

```typescript
// Only return first 8 chars of secret
return NextResponse.json({
  success: true,
  endpoint_id: newEp.id,
  signing_secret_prefix: secret.slice(0, 8),
});
```

**Rule:** Never use `process.env` directly in other files. Always import from `env.ts`.
Never return raw secrets in client-facing API responses.

---

### PHI Scrubbing

**What it does:** Strips PHI patterns (emails, phones, SSNs, addresses, names) from
error messages and stack traces before logging.

**Why it's done that way:** Defense-in-depth for HIPAA compliance. Even if upstream
code fails to sanitize, error logs won't contain unencrypted PHI per BAA Section 12.

**File:** `src/lib/errorLogger.ts` (lines 11-46)

```typescript
const PHI_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE]' },
  { pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g, replacement: '[SSN]' },
  { pattern: /\b(?:DOB|born|birth(?:day)?)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi, replacement: '[DOB]' },
  { pattern: /\b\d{1,6}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Way|Place|Pl|Circle|Cir|Square|Sq|Highway|Hwy)\b\.?/g, replacement: '[ADDRESS]' },
  { pattern: /\b(?:caller|patient|name(?:'s)?)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g, replacement: '[NAME]' },
];

function scrubPHI(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PHI_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
```

**Context allowlist** (lines 72-93): Only safe keys (client_id, step,
stripe_event_id, etc.) are logged — all others are dropped with a warning.

---

### URL Validation (SSRF Prevention)

**What it does:** Validates webhook URLs to ensure they are HTTPS and not pointing to
private/internal IPs.

**Why it's done that way:** Prevents Server-Side Request Forgery (SSRF) attacks where
an attacker could force the server to make requests to internal infrastructure.

**File:** `src/lib/webhooks/validateUrl.ts` (lines 1-106)

```typescript
export function validateWebhookUrl(targetUrl: string): { valid: boolean; error?: string } {
  if (!targetUrl.startsWith('https://')) {
    return { valid: false, error: 'Target URL must be HTTPS' };
  }

  const parsed = new URL(targetUrl);
  const host = parsed.hostname.toLowerCase();

  // Reject IPv6 loopback, link-local, unique-local
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') ||
      host.startsWith('fd') || host.startsWith('::ffff:')) {
    return { valid: false, error: 'Target URL must not be a private/local address' };
  }

  // Reject localhost in production
  if (host === 'localhost' || host === '0.0.0.0') {
    return { valid: false, error: 'Target URL must not be localhost' };
  }

  // Reject decimal-integer IP representations (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(host)) {
    const decimal = Number(host);
    const a = (decimal >>> 24) & 0xff;
    const b = (decimal >>> 16) & 0xff;
    const privateErr = checkPrivateIpv4(a, b);
    if (privateErr) return { valid: false, error: privateErr };
  }

  // Reject private IP ranges (RFC 1918)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return { valid: false, error: 'Target URL must not be localhost' };
    const privateErr = checkPrivateIpv4(a, b);
    if (privateErr) return { valid: false, error: privateErr };
  }

  return { valid: true };
}

function checkPrivateIpv4(a: number, b: number): string | null {
  if (a === 10) return 'Target URL must not be a private IP address';
  if (a === 172 && b >= 16 && b <= 31) return 'Target URL must not be a private IP address';
  if (a === 192 && b === 168) return 'Target URL must not be a private IP address';
  if (a === 169 && b === 254) return 'Target URL must not be a link-local address';
  if (a === 0) return 'Target URL must not be a reserved address';
  if (a === 100 && b >= 64 && b <= 127) return 'Target URL must not be a reserved address';
  return null;
}
```

---

### Encryption at Rest (AES-256-GCM)

**What it does:** Encrypts OAuth tokens using AES-256-GCM before storing in the database.

**Why it's done that way:** Protects sensitive tokens at rest. AES-256-GCM provides
authenticated encryption (confidentiality + integrity). The IV and auth tag are packed
with the ciphertext for self-contained decryption.

**File:** `src/lib/crypto.ts` (lines 1-65)

```typescript
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

export function decrypt(packedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(packedBase64, 'base64');
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = packed.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
```

**Used for:** Cronofy OAuth token encryption. The key is
`CRONOFY_TOKEN_ENCRYPTION_KEY` (64-char hex = 32 bytes).

---

### Cookie Security

**What it does:** Sets cookies with HttpOnly, Secure, SameSite=Strict, and `__Host-`
prefix to prevent XSS, CSRF, and subdomain attacks.

**Why it's done that way:** Defense-in-depth against cookie theft and forgery.
`__Host-` prefix requires Secure=true and Path=/, preventing subdomain cookie injection.

**File:** `src/app/crm/api/portal/exchange-session/route.ts` (lines 278-299)

```typescript
const isProduction = env.isProduction;
const cookieName = isProduction ? '__Host-portal_session' : 'portal_session';
response.cookies.set(cookieName, sessionToken, {
  httpOnly: true,        // Prevents JavaScript access (XSS protection)
  secure: isProduction,  // Only sent over HTTPS
  sameSite: 'strict',    // Prevents CSRF (not sent on cross-site requests)
  path: '/',             // Required for __Host- prefix
  maxAge: 30 * 24 * 60 * 60, // 30 days
});
```

**Supabase auth cookies** (from `src/lib/supabase/server.ts`):

```typescript
cookieOptions: {
  secure: env.isProduction,
  httpOnly: true,
  sameSite: 'lax',  // lax for auth — allows redirect-based OAuth flows
  path: '/',
},
```

---

### Input Validation

**What it does:** Provides shared validation helpers for UUIDs, emails, tokens, phone
numbers, and HTML escaping.

**File:** `src/lib/validation.ts` (lines 1-94)

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidUUID(str: string): boolean { return UUID_RE.test(str); }
export function isValidEmail(str: string): boolean { return EMAIL_RE.test(str); }
export function isValidToken(str: string): boolean { return TOKEN_RE.test(str); }

// Phone normalization to 10 digits
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

// Convert to E.164 format
export function toE164(input: string): string | null {
  const normalized = normalizePhone(input);
  return normalized ? `+1${normalized}` : null;
}

// XSS prevention for HTML insertion
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

---

## 2. Architecture & Provider Abstractions

### Multi-Provider Voice Abstraction

**What it does:** Defines a unified interface for voice AI providers (Retell,
ElevenLabs, Dograh) so the provisioning system can work with any provider without
knowing provider-specific APIs.

**Why it's done this way:** Enables provider switching without rewriting provisioning
logic. Uses dynamic imports to avoid loading unused provider SDKs (code-splitting).

**File:** `src/lib/voice/provider.ts` (lines 1-94)

```typescript
export interface VoiceAgentProvider {
  createAgent(client: Client, config: AgentConfig): Promise<{ agentId: string }>;
  updateAgent(client: Client, agentId: string, updates: Partial<AgentConfig>): Promise<void>;
  deleteAgent(client: Client, agentId: string): Promise<void>;
  publishAgent(client: Client, agentId: string): Promise<void>;
  updateLlmModel(client: Client, agentId: string, modelId: string): Promise<void>;
  syncKnowledgeBase(client: Client): Promise<void>;
  getAgentStatus(agentId: string): Promise<AgentStatus>;
  listVoices(): Promise<ProviderVoice[]>;
  updateVoice(client: Client, agentId: string, voiceId: string, voiceSettings?: Record<string, unknown>): Promise<void>;
  normalizeWebhookPayload(payload: Record<string, unknown>): NormalizedCallEvent | null;
}

// Factory pattern with dynamic imports for code-splitting
export async function getVoiceProvider(provider: VoiceProvider): Promise<VoiceAgentProvider> {
  switch (provider) {
    case 'retell': {
      const { RetellVoiceProvider } = await import('./retellProvider');
      return new RetellVoiceProvider();
    }
    case 'elevenlabs': {
      const { ElevenLabsVoiceProvider } = await import('./elevenLabsProvider');
      return new ElevenLabsVoiceProvider();
    }
    case 'dograh': {
      const { DograhVoiceProvider } = await import('./dograhProvider');
      return new DograhVoiceProvider();
    }
    default:
      throw new Error(`Unknown voice provider: ${provider satisfies never}`);
  }
}

// Agent ID resolution with backward compatibility
export function getAgentId(
  client: Pick<Client, 'voice_provider' | 'voice_provider_agent_id' | 'retell_agent_id'>,
): string | null {
  const provider = client.voice_provider ?? 'retell';
  if (provider === 'retell') {
    return client.voice_provider_agent_id || client.retell_agent_id || null;
  }
  return client.voice_provider_agent_id || null;
}
```

---

### Provider Implementations

#### RetellVoiceProvider
**File:** `src/lib/voice/retellProvider.ts`

Thin adapter that delegates to existing `src/lib/provision/*` functions. Does NOT
reimplement logic — avoids duplication by reusing the mature Retell provisioning code.

#### ElevenLabsVoiceProvider
**File:** `src/lib/voice/elevenLabsProvider.ts`

Full implementation using ElevenLabs Conversational AI REST API with direct `fetch()`
calls (no SDK). Maps RingProof's `AgentConfig` to ElevenLabs-specific format including
LLM model mapping, emotion mapping, ambient sounds, and tool mapping.

```typescript
const LLM_MODEL_MAP: Record<string, string> = {
  'openai/gpt-4o':              'gpt-4o',
  'openai/gpt-4o-mini':         'gpt-4o-mini',
  'anthropic/claude-3.5-sonnet': 'claude-3-5-sonnet',
  'google/gemini-2.0-flash':     'gemini-2.0-flash',
};
```

#### DograhVoiceProvider
**File:** `src/lib/voice/dograhProvider.ts`

Full implementation using Dograh REST API. Models agents as "workflows" (graph of
nodes + edges). `publishAgent()` is a no-op because workflows go live when saved.

---

### Call Processor

**What it does:** Shared call-logging logic that normalizes call events across
providers. Inserts into `call_logs` with idempotency guard, sends lead notifications,
and runs post-insert integrations.

**File:** `src/lib/voice/callProcessor.ts`

```typescript
export async function processCallEvent(event: NormalizedCallEvent): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Idempotency guard — check if (provider_call_id, event_type) already exists
  const { data: existingCall } = await supabase
    .from('call_logs')
    .select('id')
    .eq('provider_call_id', event.providerCallId)
    .eq('event_type', event.eventType)
    .limit(1)
    .maybeSingle();

  if (existingCall) {
    console.log(`Duplicate event. Skipping.`);
    return;
  }

  // Insert into call_logs
  const callLog = {
    client_id: event.clientId,
    provider_call_id: event.providerCallId,
    voice_provider: event.voiceProvider,
    retell_call_id: null, // ElevenLabs calls have no Retell call_id
    event_type: event.eventType,
  };

  const { data: insertedRow } = await supabase
    .from('call_logs')
    .insert(callLog)
    .select('id')
    .single();

  // Best-effort post-insert steps (never block the insert)
  await sendLeadNotifications(supabase, {...});
  await runPostInsertIntegrations({...});
}
```

---

### Webhook Normalization

**What it does:** Defines `NormalizedCallEvent` interface that all providers map their
webhook payloads to.

**File:** `src/lib/voice/types.ts` (lines 96-119)

```typescript
export interface NormalizedCallEvent {
  providerCallId:       string;
  voiceProvider:        VoiceProvider;
  clientId:             string;
  clientNumberId:       string | null;
  eventType:            'call_started' | 'call_ended' | 'call_analyzed';
  callTimestamp:        string;
  durationSeconds:      number | null;
  outcome:              string | null;
  callerName:           string | null;
  callerPhone:          string | null;
  callReason:           string | null;
  transcript:           string | null;
  transcriptSummary:    string | null;
  recordingUrl:         string | null;
  callCost:             number | null;
  callCostBreakdown:    Record<string, unknown> | null;
  disconnectionReason:  string | null;
  isRepeatCaller:       boolean;
  metadata:             Record<string, unknown>;
}
```

---

### Calendar Provider Abstraction

**What it does:** Abstracts calendar operations so the AI agent tools work with both
Cal.com and Cronofy.

**File:** `src/lib/calendar/provider.ts`

```typescript
export interface CalendarProvider {
  findBookingByPhone(clientId: string, phoneNumber: string): Promise<CalendarEvent | null>;
  rescheduleEvent(clientId: string, bookingId: string, newStartTime: string, newEndTime?: string): Promise<void>;
  cancelEvent(clientId: string, bookingId: string): Promise<void>;
  createEvent(clientId: string, event: {...}): Promise<{ event_id: string; event_url?: string }>;
}

export async function getCalendarProvider(integrationType: string): Promise<CalendarProvider | null> {
  switch (integrationType) {
    case 'cronofy': return new CronofyCalendarProvider();
    case 'cal_com':
    case 'capture_only': return new CalCalendarProvider();
    case 'zapier_webhook': return null;
    default: return new CalCalendarProvider();
  }
}
```

---

### Provisioning System

**What it does:** Orchestrates the full onboarding provisioning chain: purchases Twilio
number, creates/binds voice agent, updates database state.

**File:** `src/lib/provision/index.ts`

**Key patterns:**
- **Payment guard:** Never purchases Twilio numbers for unpaid clients
- **Atomic number claiming:** `UPDATE...RETURNING` guarantees only one UPDATE wins per
  row under concurrent calls
- **DB-save-first:** Saves to DB first, external sync is best-effort

```typescript
// CRITICAL: Never purchase Twilio numbers for unpaid clients
if (!isManualOverride) {
  const hasPaid = !!client.paid_at || client.payment_manually_overridden;
  if (!hasPaid) {
    throw new Error(`Client has not paid. Refusing to provision.`);
  }
}

// Atomically claim an eligible number from the reuse pool
const { data: claimedRows } = await supabase
  .from('available_numbers')
  .update({ reused: true })
  .eq('reused', false)
  .order('created_at', { ascending: true })
  .limit(1)
  .select('*')
  .maybeSingle();

// DB save first, external sync best-effort
await supabase.from('clients').update({ status: 'trial', retell_agent_id: agentId }).eq('id', client.id);

try {
  await createRetellLlmAndAgent({...});
} catch (externalErr) {
  await logError('provisionClient', externalErr);
  // Don't fail — DB state is the source of truth
}
```

---

### Prompt Builder (Single Source of Truth)

**What it does:** Single source of truth for AI prompts. Assembles prompt from
recording disclosure, persona, safety escalation, triage tiers, booking-mode logic,
and closing.

**File:** `src/lib/promptBuilder/index.ts`

```typescript
export async function buildFullClientPrompt(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ctx: PromptBuildContext
): Promise<string> {
  const triage = await loadTriageTable(supabase, ctx.tradeType);
  const emergencyPhrases = await loadEmergencyPhrases(supabase, ctx.tradeType);

  return assembleSectionedPrompt([
    disclosure,
    securityRules,
    safetyBranches,
    triageSection,
    bookingLogic,
  ]);
}
```

**Rule:** Never duplicate prompt text in other files. Always use
`buildFullClientPrompt()`.

---

### Schema Design & Idempotent Migrations

**What it does:** Single source of truth for database schema. All tables, constraints,
indexes, RLS policies, triggers, and seed data in one file.

**File:** `.sql/schema.sql`

**Idempotent patterns:**

```sql
-- Idempotent table creation
create table if not exists clients (...);

-- Idempotent seed data
insert into addon_catalog (...) values (...)
on conflict (slug) do nothing;

-- ALTER TABLE migrations for existing databases
alter table clients add column if not exists plan_type text
  constraint clients_plan_type_check
  check (plan_type is null or plan_type in ('starter_150','flagship_599','unlimited_1200'));

-- Constraint recreation (must drop and recreate)
alter table call_logs drop constraint if exists cl_outcome_check;
alter table call_logs add constraint cl_outcome_check
  check (outcome is null or outcome in (...));
```

**Rules:**
1. Add new columns to BOTH `CREATE TABLE` and the `ALTER TABLE` migration section
2. Add RLS policies for every new table
3. Add seed data with `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`
4. Never create separate migration files
5. After editing schema.sql, run `pnpm exec tsc --noEmit` to verify types
6. Tell the user to run schema.sql against their live database

---

### Client Status Helpers (Gate-Based Logic)

**What it does:** Shared helpers for determining client completeness. Gate-based
whitelist approach — a client is ONLY complete if ALL gates pass.

**File:** `src/lib/clientStatus.ts`

```typescript
export function isIncompleteOnboarding(client: ClientStatusFields): boolean {
  // Gate 1: Contract must be signed
  if (!client.contract_signed) return true;
  // Gate 2: Payment must be received
  if (!client.paid_at && !client.payment_manually_overridden) return true;
  // Gate 3: Status must be 'trial' or 'active'
  if (client.status !== 'trial' && client.status !== 'active') return true;
  // Gate 4: No incomplete marker in notes
  if (client.notes && client.notes.includes('[INCOMPLETE ONBOARDING]')) return true;
  // All gates passed
  return false;
}

export function canMarkAsPaid(client: { contract_signed?: boolean | null }): { ok: boolean; reason?: string } {
  if (!client.contract_signed) {
    return { ok: false, reason: 'Contract must be signed before payment.' };
  }
  return { ok: true };
}
```

**Rule:** Never inline this logic in components. Always import from `clientStatus.ts`.

---

### Addon System

**What it does:** Centralized add-on gating via `hasAddon()`. Auto-includes certain
add-ons for Unlimited tier clients.

**File:** `src/lib/addons.ts`

```typescript
const UNLIMITED_AUTO_ADDONS: ReadonlySet<string> = new Set([
  'sms_follow_up', 'native_crm_sync', 'outbound_reminder_calls',
  'priority_support_sla', 'dedicated_concurrency_slot',
  'review_automation', 'no_show_recovery',
]);

export async function hasAddon(
  supabase: SupabaseClient, clientId: string, slug: string,
): Promise<boolean> {
  // Check if Unlimited tier auto-includes this add-on
  if (UNLIMITED_AUTO_ADDONS.has(slug)) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('plan_type')
      .eq('id', clientId)
      .maybeSingle();
    if (clientRow?.plan_type === 'unlimited_1200') return true;
  }

  // Otherwise check client_addons table
  const { data } = await supabase
    .from('client_addons')
    .select('id')
    .eq('client_id', clientId)
    .eq('addon_slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  return !!data;
}
```

---

### Metered Billing

**What it does:** Defines plan tiers with included minutes and overage rates. Loads
settings from DB with fallback to constants.

**File:** `src/lib/meteredBilling.ts`

```typescript
export const PLAN_TIERS = {
  starter_150: { monthlyPrice: 150, annualPrice: 1206, includedMinutes: 150, overageRatePerMinute: 0.60, name: 'Starter' },
  flagship_599: { monthlyPrice: 599, annualPrice: 4816, includedMinutes: 700, overageRatePerMinute: 0.15, name: 'Flagship' },
  unlimited_1200: { monthlyPrice: 1200, annualPrice: 9600, includedMinutes: 0, overageRatePerMinute: 0, concurrencySlots: 5, name: 'Unlimited' },
} as const;

export function isUnlimitedTier(planType: string | null | undefined): boolean {
  return planType === 'unlimited_1200';
}

export function isMeteredTier(planType: string | null | undefined): boolean {
  return planType === 'starter_150' || planType === 'flagship_599';
}
```

---

### Commission Calculation

**What it does:** Calculates profit per client per billing period, then derives agent
commission. Caches plan pricing for 10 minutes.

**File:** `src/lib/commissionCalc.ts`

```typescript
let _planPricingCache: { value: {...}; expiresAt: number } | null = null;
const PLAN_PRICING_CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function getPlanPricing(supabase): Promise<{...}> {
  if (_planPricingCache && Date.now() < _planPricingCache.expiresAt) {
    return _planPricingCache.value;
  }
  // Load from settings table with fallback to constants
  // ...
  _planPricingCache = { value: result, expiresAt: Date.now() + PLAN_PRICING_CACHE_MS };
  return result;
}
```

---

## 3. Next.js 16 Patterns

### Route Groups & Dynamic Routes

**Route groups `(app)/`** organize routes without affecting URL structure:

```
src/app/crm/(app)/overview/page.tsx  →  /crm/overview
src/app/crm/(app)/clients/[id]/page.tsx  →  /crm/clients/abc123
```

**Dynamic routes `[token]`** — In Next.js 16, `params` is now a `Promise<T>`:

```typescript
export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // ...
}
```

---

### Server vs Client Components

**Server components** (default) fetch data server-side and pass to client components:

```typescript
// page.tsx (server component)
const [clientResult, callLogColumns] = await Promise.all([...]);
return <ReportPageClientLazy client={client} callLogs={callLogs} token={token} />;
```

**Client components** (`'use client'`) handle interactivity:

```typescript
'use client';
import { useState, useEffect } from 'react';
export default function ReportPageClient({ client, callLogs, token }: Props) {
  const [activeTab, setActiveTab] = useState('home');
}
```

**Lazy loading** with `next/dynamic` and `ssr: false`:

```typescript
const ReportPageClient = nextDynamic(() => import('./ReportPageClient'), {
  ssr: false,
  loading: () => <div>Loading your portal…</div>,
});
```

---

### after() for Post-Response Work

**What it does:** Schedules work to run after the HTTP response is sent.

**Why:** Webhooks must return 200 quickly to avoid timeouts/retries. Heavy processing
happens in background.

```typescript
import { after } from 'next/server';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  after(() => processWebhookInBackground(rawBody).catch(async (err) => {
    console.error('Error:', err);
    await logError('webhook/after-callback', err);
  }));

  return NextResponse.json({ received: true });
}
```

---

### Turbopack Configuration

**File:** `next.config.ts`

```typescript
experimental: {
  turbopackFileSystemCacheForBuild: true,
  optimizePackageImports: [
    'googleapis', 'twilio', 'stripe', '@supabase/supabase-js',
    '@anthropic-ai/sdk', 'elevenlabs', 'retell-sdk',
  ],
},
```

---

### PWA / Manifest

**File:** `public/manifest.webmanifest`

```json
{
  "name": "RingProof — AI Receptionist & Appointment Booking",
  "short_name": "RingProof",
  "description": "AI phone receptionist that answers every missed call 24/7...",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAF7F2",
  "theme_color": "#FF4B2B",
  "icons": [
    { "src": "/icon.png", "sizes": "180x180", "type": "image/png" },
    { "src": "/apple-icon.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

**Dynamic manifest for client portal** (from `src/app/crm/report/[token]/page.tsx`):

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/crm/report/${token}/manifest.webmanifest`,
    icons: { icon: '/portal/icon-512.png', apple: '/portal/apple-touch-icon.png' },
  };
}
```

---

### SEO / Metadata / JSON-LD

**File:** `src/app/page.tsx` (lines 59-139)

```typescript
export const metadata: Metadata = {
  title: 'RingProof — AI Receptionist & Appointment Booking',
  description: 'AI phone receptionist that answers every call 24/7...',
  keywords: ['AI receptionist', 'missed call recovery', ...],
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website', url: SITE_URL,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
};
```

**JSON-LD structured data** (lines 146-209):

```typescript
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'Service'],
  name: 'RingProof',
  description: '...',
  image: `${SITE_URL}/og-image.png`,
  logo: `${SITE_URL}/og-image.png`,
  areaServed: { '@type': 'Country', name: 'United States' },
  // ... offers, FAQ, etc.
};
```

---

### Sitemap & Robots.txt

**File:** `src/app/sitemap.ts`

```typescript
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    { url: 'https://getringproof.com', priority: 1, changeFrequency: 'weekly' },
    { url: 'https://getringproof.com/integrations', priority: 0.6 },
    { url: 'https://getringproof.com/research', priority: 0.7 },
    { url: 'https://getringproof.com/blog', priority: 0.7 },
    { url: 'https://getringproof.com/privacy', priority: 0.3 },
    { url: 'https://getringproof.com/audit', priority: 0.6 },
  ];

  const blogPages = articles.map(a => ({
    url: `https://getringproof.com/blog/${a.slug}`,
    lastModified: new Date(a.date),
    priority: 0.6,
  }));

  return [...staticPages, ...blogPages];
}
```

**File:** `public/robots.txt`

```
User-agent: *
Allow: /
Allow: /privacy
Allow: /research
Allow: /integrations
Allow: /blog
Disallow: /crm/

Sitemap: https://getringproof.com/sitemap.xml
```

---

### OG Images

Referenced in metadata:

```typescript
openGraph: {
  images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RingProof' }],
},
twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
```

The file `public/og-image.png` must exist. The JSON-LD `logo` field also points to
`/og-image.png` (since `/logo.png` doesn't exist).

---

### Dynamic Rendering

```typescript
export const dynamic = 'force-dynamic';
```

Used on all routes that display real-time data (client portal, admin CRM, API routes,
webhooks). Prevents static generation so data is always fresh.

---

### Max Duration

```typescript
export const maxDuration = 60;  // webhooks, API routes
export const maxDuration = 300; // cron jobs, bulk operations
export const maxDuration = 30;  // upload routes
```

Vercel Hobby plan defaults to 10s. Set `maxDuration` explicitly for routes that need
more time for DB queries, external API calls, or bulk processing.

---

### CSS Architecture & Design Tokens

**File:** `src/app/globals.css`

```css
:root {
  --color-bg:           #FAF7F2;
  --color-surface:      #FFFFFF;
  --color-ink:          #14181A;
  --color-ink-muted:    #6B7280;
  --color-signal:       #FF4B2B;
  --color-alert:        #E53E3E;
  --color-success:      #1E7A4C;
  --color-border:       #E5E7EB;

  --space-1:   4px;
  --space-2:   8px;
  --space-4:   16px;
  --space-6:   24px;

  --z-sidebar: 100;
  --z-modal: 1100;
  --z-toast: 2000;

  --anim-fast:  180ms ease;
  --anim-panel: 320ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Landing page** has a separate CSS file (`src/app/landing.css`) with its own design
tokens (`--lp-ink`, `--lp-paper`, `--lp-signal`) for the marketing site's distinct
visual identity.

---

### Scroll Reveal Animations

**File:** `src/app/LandingInteractions.tsx`

```typescript
useEffect(() => {
  document.documentElement.classList.add('js-loaded');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      entry.target.classList.toggle('in', entry.isIntersecting);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => {
    observer.observe(el);
  });
}, []);
```

**CSS:**

```css
.js-loaded .reveal { opacity: 0; transform: translateY(16px); transition: opacity 0.6s, transform 0.6s; }
.js-loaded .reveal.in { opacity: 1; transform: translateY(0); }
```

---

### Tab Switching

**File:** `src/app/LandingInteractions.tsx`

```typescript
function showView(name: ViewName) {
  views.forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  refreshObserver();
  closeSidebar();
}

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    const view = link.dataset.view as ViewName;
    if (view) showView(view);
  });
});
```

---

### Mobile Sidebar

**File:** `src/app/LandingInteractions.tsx` (lines 68-111)

```typescript
function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  sidebar.removeAttribute('inert');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
  sidebar.setAttribute('inert', '');
  document.body.style.overflow = '';
}
```

**Sidebar component** (`src/app/sections/Sidebar.tsx`):

```html
<aside className="sidebar" id="sidebar" aria-hidden="true" inert aria-label="Mobile navigation menu">
  <nav className="sidebar-links">
    <span className="sidebar-link active" data-view="home">Home</span>
    <span className="sidebar-link" data-view="tools">Tools</span>
  </nav>
</aside>
```

---

### Form Handling

**File:** `src/app/audit/components/AuditSignupForm.tsx`

```typescript
'use client';
import { useState } from 'react';

export default function AuditSignupForm() {
  const [formData, setFormData] = useState({ businessName: '', phone: '', email: '', tradeType: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/crm/api/audit/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Submission failed');
    } catch (err) {
      setError('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <form onSubmit={handleSubmit}>{/* fields */}</form>;
}
```

---

### Error Boundaries

**File:** `src/app/crm/report/[token]/error.tsx`

```typescript
'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>We couldn't load your portal. Try again...</p>
      {error.digest && <p>Error ID: {error.digest}</p>}
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

Error boundaries exist at: `src/app/crm/report/[token]/error.tsx`,
`src/app/crm/(app)/error.tsx`, `src/app/crm/onboard/[token]/error.tsx`,
`src/app/sales/(portal)/error.tsx`.

---

### Loading States

**File:** `src/app/crm/report/[token]/loading.tsx`

```typescript
export default function Loading(): React.JSX.Element {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FAF7F2' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%',
        border: '3px solid #F0EDE5', borderTopColor: '#FF4B2B',
        animation: 'portal-spin 0.7s linear infinite' }} />
      <div>Loading portal…</div>
    </div>
  );
}
```

Next.js renders `loading.tsx` automatically when server components are fetching async
data. No explicit `<Suspense>` boundaries needed.

---

## 4. Integrations & Third-Party Services

### Stripe Integration

**File:** `src/lib/stripe.ts`, `src/app/crm/api/webhooks/stripe/route.ts`

**Key patterns:**
- **Cached singleton:** Stripe client cached to avoid re-initialization
- **Signature verification:** `stripe.webhooks.constructEvent()` with 300-second tolerance
- **Test-mode rejection:** Rejects test-mode events when using live keys
- **Deduplication:** Checks `billing_events.stripe_event_id` before processing
- **DB-save-first:** Saves to database first, then triggers provisioning/emails

```typescript
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  cachedStripe = new Stripe(env.stripeSecretKey, {...});
  return cachedStripe;
}

// Webhook verification with replay attack prevention
event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret, 300);
```

**Events handled:**
- `checkout.session.completed` — marks client as paid, triggers provisioning
- `invoice.payment_succeeded` — records billing events, applies add-ons
- `customer.subscription.deleted` — deactivates client, releases phone number
- `customer.subscription.updated` — handles pause/resume/cancel_at_period_end

---

### Twilio Telephony

**File:** `src/app/crm/api/voice/incoming/route.ts`, `src/lib/twilioVerify.ts`

**TwiML pattern** — forwards calls to Retell AI via TwiML redirect:

```typescript
function twimlRedirectToRetell(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${RETELL_VOICE_URL}</Redirect>
</Response>`;
}
```

**SMS sending:**

```typescript
const message = await twilioClient.messages.create({
  body,
  to: bookingData.callerPhone,
  ...(isMsgService ? { messagingServiceSid: env.twilioFromNumber } : { from: env.twilioFromNumber }),
});
```

**Call screening:** Whitelist/blacklist checked before forwarding to AI. Whitelisted
callers go to voicemail (saves AI costs). Signature verified before any processing.

---

### Retell AI Integration

**File:** `src/lib/voice/retellProvider.ts`, `src/app/crm/api/webhooks/retell/route.ts`

- Agent creation via `createRetellLlmAndAgent()`
- Webhook handles `call_started`, `call_ended`, `call_analyzed`
- Idempotency via `call_logs(event_type, retell_call_id)` check
- Background processing via `after()`

---

### ElevenLabs Integration

**File:** `src/lib/voice/elevenLabsProvider.ts`, `src/app/crm/api/webhooks/elevenlabs/route.ts`

- Uses REST API via `fetch()` (no SDK dependency)
- LLM model mapping from OpenRouter format to ElevenLabs format
- Twilio number import via `import-twilio-number` endpoint
- Webhook handles `post_call_transcription` and `post_call_audio`
- HMAC-SHA256 signature verification

---

### Cal.com Integration

**File:** `src/lib/calcom.ts`, `src/lib/calendar/calProvider.ts`

```typescript
export async function findBookingByPhone(apiKey: string, phoneNumber: string) {
  const res = await fetch(`${CALCOM_V2_BASE}/bookings?status=upcoming&limit=50`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'cal-api-version': '2026-05-01' },
  });
  // Match phone digits in description, title, or attendee fields
}
```

---

### Cronofy Integration

**File:** `src/lib/cronofy.ts`, `src/lib/calendar/cronofyProvider.ts`

- OAuth token management with auto-refresh
- Concurrent refresh prevention via module-level `refreshPromises` Map
- Tokens encrypted with AES-256-GCM before storage
- Universal calendar support (Google, Outlook, iCloud)

---

### Resend Email

**File:** `src/lib/clientEmails.ts`

```typescript
export async function sendClientNotificationEmail(
  toEmail: string, subject: string, htmlBody: string, textBody: string,
  source: string, clientId?: string,
): Promise<boolean> {
  const { Resend } = await import('resend');
  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: env.resendFromNotifications, to: toEmail,
    subject, html: htmlBody, text: textBody,
  });
  await logEmailSend({ recipient: toEmail, subject, source, clientId, success: !error });
  return !error;
}
```

**Pattern:** Best-effort — never blocks the primary operation. All sends logged to
`email_logs` table.

---

### OpenRouter / LLM

**File:** `src/app/api/landing-chat/route.ts`

```typescript
const MODEL = 'google/gemini-2.5-flash-lite'; // $0.10/1M input, $0.40/1M output
const MAX_TOKENS = 400; // response token cap — keeps cost bounded

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${env.openRouterApiKey}`,
    'HTTP-Referer': env.appUrl,
    'X-Title': 'RingProof Landing Assistant',
  },
  body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.4 }),
});
```

**Cost control:** Model selection (flash-lite is 15x cheaper), max_tokens cap, rate
limiting (15 messages per 60 seconds per IP).

---

### Supabase Client Pattern

**File:** `src/lib/supabase/server.ts`

Two client types:
- **`getSupabaseServer()`** — uses anon key, respects RLS, for user-authenticated routes
- **`getSupabaseAdmin()`** — uses service role key, bypasses RLS, for webhooks/cron/admin

```typescript
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet) {...} },
    cookieOptions: { secure: env.isProduction, httpOnly: true, sameSite: 'lax', path: '/' },
  });
}

export function getSupabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

---

### GitHub Actions Cron

**File:** `.github/workflows/health-check-cron.yml`

```yaml
env:
  APP_URL: ${{ secrets.APP_URL }}
  CRON_SECRET: ${{ secrets.CRON_SECRET }}
run: |
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$APP_URL/crm/api/cron/check-health")
```

**Endpoints called by cron workflows:**
- `/crm/api/cron/check-health` — Retell/Twilio API reachability
- `/crm/api/cron/send-review-requests` — review request SMS
- `/crm/api/cron/audit-reports` — audit report generation
- `/crm/api/cron/seasonal-outreach` — seasonal outreach campaigns

---

### Error Logging

**File:** `src/lib/errorLogger.ts`

```typescript
await supabase.from('error_logs').insert({
  source,
  error_message: scrubbedMessage,    // PHI scrubbed
  error_stack: scrubbedStack,        // PHI scrubbed
  context: safeContext,              // Only allowed keys
  severity,
  resolved: false,
});
```

**PHI scrubbing** removes emails, phones, SSNs, DOBs, addresses, and names before
logging. Context object is filtered through an allowlist of safe keys.

---

### Activity Logging

```typescript
await supabase.from('activity_log').insert({
  actor_id: user.id,
  action_type: 'plan_changed',       // e.g., 'cronofy_disconnected', 'client_updated'
  target_table: 'clients',
  target_id: clientId,
  detail: `Plan changed from "starter" to "flagship" for ${client.business_name}`,
});
```

Used in 30+ files for audit trail of admin actions.

---

### Google Sheets Integration

**File:** `src/lib/googleSheets.ts`

```typescript
async function getSheetsClient() {
  const credentials = JSON.parse(env.googleServiceAccountJson);
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}
```

**Pattern:** Best-effort — never throws. Errors are logged and the function returns
quietly. Call log rows are appended to per-client Google Sheets.

---

### Make.com Webhook Integration

**File:** `src/lib/crmWebhook.ts`

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);
const response = await fetch(client.crm_webhook_url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'RingProof-Webhook/1.0',
    'X-RingProof-Event': 'appointment_booked',
  },
  body: JSON.stringify(payload),
  signal: controller.signal,
});
```

**Gating:** Only Flagship/Unlimited clients or those with `native_crm_sync` add-on.

---

### Twilio Number Provisioning

**File:** `src/lib/provision/index.ts`

```typescript
const incomingNumber = await clientTwilio.incomingPhoneNumbers.create({
  phoneNumber: localNumbers[0].phoneNumber,
  friendlyName: `RingProof - ${client.business_name} (Main Line)`,
  voiceUrl: `${env.appUrl}/crm/api/voice/incoming`,
});
```

**Pool-first policy:** Numbers are NEVER directly released. They go to the
`available_numbers` reuse pool via `moveNumberToPool()`. Only a scheduled cron job
releases them.

**Provider-specific import:**
- **Retell:** Number bound via Retell's Twilio import endpoint
- **ElevenLabs:** Uses `import-twilio-number` endpoint
- **Dograh:** Telephony configured in Dograh dashboard (manual)

---

## 5. Operational Patterns

### DB-Save-First, External-Sync-Best-Effort

All API routes that update both the DB and an external service MUST:
1. Save to the DB first
2. Attempt the external sync as best-effort
3. If external sync fails, return success with a `warning` field
4. Never block the DB save on an external API call succeeding

```typescript
// DB save first
await supabase.from('clients').update({ plan_type: planType }).eq('id', clientId);

// External sync best-effort
try {
  await syncToStripe(clientId, newPrice);
} catch (stripeErr) {
  await logError('set-plan-type', stripeErr, { step: 'stripe-sync' });
  // Don't fail — DB is source of truth
  return NextResponse.json({ success: true, warning: 'Stripe sync failed' });
}

return NextResponse.json({ success: true });
```

---

### Idempotency Guards

Webhooks check for existing records before processing to handle retries:

```typescript
const { data: existingCall } = await supabase
  .from('call_logs')
  .select('id')
  .eq('provider_call_id', event.providerCallId)
  .eq('event_type', event.eventType)
  .maybeSingle();

if (existingCall) {
  console.log('Duplicate event. Skipping.');
  return;
}
```

Stripe webhooks check `billing_events.stripe_event_id` for deduplication.

---

### Background Processing with after()

Webhooks return 200 immediately, then process in background:

```typescript
after(() => processWebhookInBackground(rawBody).catch(async (err) => {
  await logError('webhook/after-callback', err);
}));
return NextResponse.json({ received: true });
```

---

### Pool-First Resource Management

Twilio numbers are NEVER directly released. They go to the `available_numbers` reuse
pool. Only a scheduled cron job releases them.

```typescript
// NEVER do this:
await twilioClient.incomingPhoneNumbers(numberSid).remove();

// ALWAYS do this:
await moveNumberToPool(numberSid, phoneNumber);
```

---

### Caching with Fallback

Settings are loaded from the DB with hardcoded fallback constants:

```typescript
const FALLBACK_PLAN_PRICING = {
  starter_150: { monthlyPrice: 150, includedMinutes: 150, overageRatePerMinute: 0.60 },
  // ...
};

const num = (key: string, fallback: number): number => {
  const v = map.get(key);
  return typeof v === 'number' ? v : fallback;
};

return {
  starterMonthlyPrice: num('starter_monthly_price', FALLBACK_PLAN_PRICING.starter_150.monthlyPrice),
};
```

---

### Best-Effort External Calls

Email, SMS, webhooks, and integration fan-out never block the primary operation:

```typescript
try {
  await sendLeadNotifications(supabase, { clientId, callerPhone });
  await runPostInsertIntegrations({ clientId, callLogId });
} catch (err) {
  await logError('post-insert', err);
  // Don't fail the call log insert
}
```

---

## Quick Reference: File Locations

| What | Where |
|------|-------|
| Environment variables | `src/lib/env.ts` |
| Supabase clients | `src/lib/supabase/server.ts` |
| Supabase types | `src/lib/supabase/types/*.ts` |
| Portal session auth | `src/lib/portalSession.ts` |
| Cron auth | `src/lib/cronAuth.ts` |
| Rate limiting | `src/lib/rateLimit.ts` |
| Input validation | `src/lib/validation.ts` |
| Twilio signature | `src/lib/twilioVerify.ts` |
| AES-256-GCM encryption | `src/lib/crypto.ts` |
| PHI scrubbing | `src/lib/errorLogger.ts` |
| URL validation (SSRF) | `src/lib/webhooks/validateUrl.ts` |
| Voice provider interface | `src/lib/voice/provider.ts` |
| Call processor | `src/lib/voice/callProcessor.ts` |
| Provisioning | `src/lib/provision/index.ts` |
| Prompt builder | `src/lib/promptBuilder/index.ts` |
| Client status helpers | `src/lib/clientStatus.ts` |
| Addon system | `src/lib/addons.ts` |
| Metered billing | `src/lib/meteredBilling.ts` |
| Commission calc | `src/lib/commissionCalc.ts` |
| Stripe client | `src/lib/stripe.ts` |
| Cal.com integration | `src/lib/calcom.ts` |
| Cronofy integration | `src/lib/cronofy.ts` |
| Google Sheets | `src/lib/googleSheets.ts` |
| CRM webhook (Make.com) | `src/lib/crmWebhook.ts` |
| Database schema | `.sql/schema.sql` |
| PWA manifest | `public/manifest.webmanifest` |
| Sitemap | `src/app/sitemap.ts` |
| Robots.txt | `public/robots.txt` |
| Landing interactions | `src/app/LandingInteractions.tsx` |
| Next.js config | `next.config.ts` |

---

## Quick Reference: Verification Commands

```bash
# TypeScript check
pnpm exec tsc --noEmit

# ESLint (zero warnings enforced)
pnpm exec eslint --max-warnings=0 <changed-files>

# Production build
pnpm run build

# Pre-commit hooks (run automatically)
# husky + lint-staged runs ESLint on staged files
```

---

## Quick Reference: Git Workflow

```bash
# Commit format: type: concise description
git commit -m "fix: description of what was fixed"

# Never push without explicit user request
# Never force-push or rewrite history
# Never commit secrets
```

---

## 6. Building Mindset & Philosophy

This section documents the mindset, decision-making framework, and hard-won lessons
from building and auditing this codebase. These are the principles that separate code
that compiles from code that works in production.

### 6.1 The Prime Directive: Verify Before Trusting

**Never assume. Always verify with tools.**

The single most expensive mistake an AI coder can make is assuming something is true
without checking. Every assumption is a potential bug:

- **Don't assume a function exists** because the naming convention suggests it should.
  Grep for it. Read its signature. Check what it actually returns.
- **Don't assume a file is at a path** because Next.js convention suggests it. App
  Router uses `(group)` folders that don't appear in URLs. `[dynamic]` segments
  have specific rules. Always confirm with glob/grep.
- **Don't assume a DB column exists** because the TypeScript type defines it. The
  type might be ahead of the production schema. The type might be behind it. The
  `ALTER TABLE` might have been forgotten.
- **Don't assume a feature is implemented** because the marketing page claims it.
  The marketing page might be aspirational. The code might be a stub. Grep for the
  handler.
- **Don't assume your previous edit worked** because the tool returned success.
  Run `tsc --noEmit`. Run ESLint. Read the changed lines back.

Every "done" in your memory is a claim, not a fact. Verify it.

### 6.2 The Three-Phase Workflow

Every non-trivial task follows three phases. Skipping any phase produces bugs.

**Phase 1: Understand before changing.**
Before writing a single line of code, you must understand:
- What does the code currently do? (Read it, grep for callers)
- What should it do? (Read the request carefully)
- What else depends on this code? (Grep for imports, function calls)
- What conventions does this file follow? (Read neighboring code)
- What are the edge cases? (What if the input is null? Empty? Huge?)

If you can't answer all five questions, you don't understand the code well enough
to change it. Read more.

**Phase 2: Change with surgical precision.**
- Make the smallest change that achieves the goal
- Follow existing conventions in the file (naming, error handling, style)
- Don't refactor unrelated code in the same edit
- Don't add comments unless asked
- Don't add error handling that the codebase pattern doesn't use
- If you're adding a new dependency, check package.json first — is it already there?

**Phase 3: Verify the change actually works.**
- `tsc --noEmit` — TypeScript catches type errors
- `eslint --max-warnings=0` — ESLint catches style and correctness issues
- Read the changed lines back — do they say what you intended?
- Check for edge cases — what if the input is null? What if the API fails?
- If you changed schema.sql, remind the user to run it against production

### 6.3 Defense in Depth — Security as Layers

Security is never one layer. It's layers, each catching what the previous missed:

```
Request → Rate limit → Input validation → Auth check → RLS policy → Column GRANT → Response masking
```

If any single layer fails, the others still protect you:
- Rate limiting slows brute force even if auth has a bug
- Input validation prevents injection even if the query builder has a flaw
- RLS prevents data leaks even if the API route has an IDOR
- Column GRANTs prevent mass assignment even if RLS is misconfigured
- Response masking prevents secret leaks even if the query returns too much

**The lesson:** Never rely on a single security check. Always ask: "If this check
fails, what's the next layer that catches the attack?"

### 6.4 DB-Save-First — The User's Selection Must Always Persist

This is the most important operational pattern in the codebase:

```typescript
// 1. Save to DB FIRST
await supabase.from('clients').update({ plan_type: newPlan }).eq('id', clientId);

// 2. External sync is BEST-EFFORT
try {
  await syncToStripe(clientId, newPrice);
} catch (stripeErr) {
  await logError('plan-change', stripeErr);
  // Don't fail! DB is source of truth.
  return NextResponse.json({ success: true, warning: 'Stripe sync pending' });
}

return NextResponse.json({ success: true });
```

**Why this matters:** External APIs fail. Stripe goes down. Retell rate-limits you.
Twilio has a hiccup. If you block the DB save on the external API succeeding, the
user loses their selection when the external API fails. They have to redo it. They
get frustrated. They leave.

The DB is your source of truth. Save there first. Sync externally best-effort. If
the sync fails, log it, return a warning, and let a cron job or manual action retry
later. The user never loses their selection.

### 6.5 Gate-Based Logic — Whitelists Beat Blacklists

The `isIncompleteOnboarding()` function uses a gate-based whitelist:

```typescript
export function isIncompleteOnboarding(client: ClientStatusFields): boolean {
  if (!client.contract_signed) return true;    // Gate 1
  if (!client.paid_at && !client.payment_manually_overridden) return true;  // Gate 2
  if (client.status !== 'trial' && client.status !== 'active') return true;  // Gate 3
  if (client.notes?.includes('[INCOMPLETE ONBOARDING]')) return true;  // Gate 4
  return false;  // ALL gates passed
}
```

**Why gates, not blacklist?** A blacklist says "if X, Y, or Z is wrong, it's
incomplete." Every time you add a new condition, you have to add it to the
blacklist. If you forget, the bug ships. A gate-based whitelist says "ALL of these
must be true." New conditions are added as new gates. You can't forget a gate
because the default is `true` (incomplete) — you have to explicitly add a gate
that passes.

This pattern has prevented the "all clients flipped to onboarding" bug that shipped
twice before the gate-based approach was adopted.

### 6.6 Single Source of Truth — Never Duplicate Logic

Every piece of business logic should have ONE home:

| Logic | Single source | Never duplicate in |
|-------|--------------|-------------------|
| Client completeness | `clientStatus.ts` | Components, pages, API routes |
| Add-on gating | `addons.ts hasAddon()` | Components, routes, cron jobs |
| AI prompt assembly | `promptBuilder/index.ts` | Scripts, API routes, test calls |
| Plan pricing | `meteredBilling.ts PLAN_TIERS` | Marketing pages, onboarding, sales |
| Environment variables | `env.ts` | Any file using `process.env` |
| Supabase client creation | `supabase/server.ts` | API routes, pages |
| Phone normalization | `validation.ts normalizePhone()` | Components, API routes, webhooks |

When you duplicate logic, the copies drift. One copy gets updated, the other
doesn't. The dashboard shows one status, the detail page shows another. The
marketing page says one price, the onboarding portal says another. Drift causes
bugs that are hard to find because "the code looks right" — it's just the wrong
copy.

### 6.7 Idempotency — Expect Retries

Every webhook handler, every cron job, every external API callback MUST be
idempotent. External systems retry. Networks duplicate. Your code must handle
being called twice with the same data.

```typescript
// Check if we already processed this event
const { data: existing } = await supabase
  .from('call_logs')
  .select('id')
  .eq('provider_call_id', event.providerCallId)
  .eq('event_type', event.eventType)
  .maybeSingle();

if (existing) {
  console.log('Duplicate event. Skipping.');
  return;  // Already processed — safe to skip
}

// Process the event
await supabase.from('call_logs').insert(callLog);
```

**The lesson:** If your code creates duplicate records when called twice with the
same input, it's not production-ready. Always check before inserting. Use unique
constraints in the DB as a backstop.

### 6.8 Best-Effort External Calls — Never Block the Primary Operation

Emails, SMS, webhooks, integration fan-out — these are all secondary to the
primary operation:

```typescript
// Primary: insert call log
const { data: callLog } = await supabase.from('call_logs').insert({...}).select('id').single();

// Secondary: send notifications (best-effort, never block)
try {
  await sendLeadNotifications(supabase, { clientId, callerPhone });
  await runPostInsertIntegrations({ clientId, callLogId: callLog.id });
} catch (err) {
  await logError('post-insert-notifications', err);
  // Don't fail the call log insert
}
```

If the email fails to send, the call log is still saved. If the Google Sheets
sync fails, the call log is still saved. The primary operation must always
succeed. Secondary operations are logged on failure and retried by cron if
needed.

### 6.9 Context Management — The AI Coder's Biggest Enemy

This codebase is large. Several files exceed 2,000 lines. The AI process has
crashed with OOM multiple times. Beyond crashes, large context causes:

- **Hallucination:** Inventing APIs that don't exist, referencing files at wrong
  paths, fabricating function signatures
- **Mistakes:** Editing the wrong file, duplicating logic that already exists,
  breaking imports
- **Confusion:** Losing track of what you've already done, skipping steps

**The rules that prevent this:**

1. **Never read huge files in full.** Use `offset`/`limit` or grep first. If a
   file is >500 lines, grep before reading.
2. **Prefer subagents for heavy work.** Subagent output is summarized back to the
   parent instead of pulling every line into main context.
3. **Grep before assuming.** Before writing code that calls a function, grep to
   verify it exists and check its actual signature.
4. **Use `todo_write` for multi-step tasks.** Break work into small steps, mark
   each complete before moving on.
5. **Keep responses compact.** Don't echo large file contents back to the user.
6. **Start fresh sessions for unrelated tasks.** Don't carry one task's context
   into the next.

### 6.10 The Verification Discipline

Before considering ANY task complete:

1. **TypeScript:** `pnpm exec tsc --noEmit` — must exit 0 with no output
2. **ESLint:** `pnpm exec eslint --max-warnings=0` — zero warnings allowed
3. **Build** (if structural changes): `pnpm run build`
4. **Self-review:** Re-read your changes. Check for:
   - Duplicate imports or variables
   - References to functions/types that don't exist (grep to verify)
   - Missing error handling on API calls
   - Mobile responsiveness (fixed widths, non-wrapping flex)
   - DB queries that select columns that might not exist in production yet

**The lesson:** "It compiles" is not "it works." TypeScript catches type errors.
ESLint catches style issues. Neither catches logic errors. You have to read your
own code back and ask: "Does this actually do what the user asked for?"

---

## 7. Recurring Bug Prevention — Lessons From Shipping

These are bugs that shipped to production, were caught, and were fixed. The
patterns below prevent them from recurring. Every AI coder working on this
codebase MUST follow these rules.

### 7.1 The "All Clients Flipped to Onboarding" Bug (Shipped Twice)

**What happened:** The dashboard and detail page had inline copies of the
"is this client's onboarding complete?" logic. One copy was updated, the other
wasn't. Clients who had completed onboarding appeared as incomplete on one page
but complete on the other.

**Root cause:** Duplicated business logic. Two copies of the same check, drifting
apart over time.

**Fix:** Centralized in `src/lib/clientStatus.ts`. Both pages import the same
function. Never inline this logic.

**Lesson:** Business logic that appears in more than one place WILL drift.
Centralize it. Import it. Never copy it.

### 7.2 The "Buttons Don't Work" Bug (Shipped Three Times)

**What happened:** Pages rendered correctly but interactive elements (form submit
buttons, onClick handlers) did nothing when clicked. The page looked fine but was
completely non-functional.

**Root cause:** CSP nonce + static prerender conflict. The proxy sets a
per-request CSP nonce for authenticated routes. Next.js injects this nonce into
inline scripts during SSR. But statically prerendered pages are built at build
time when no request/nonce exists, so the CSP blocks their inline scripts at
runtime. Without those scripts, React hydration never runs.

**Fix:** Every root layout for a route prefix that receives nonce-based CSP MUST
have `export const dynamic = 'force-dynamic'`:
- `src/app/crm/layout.tsx` — covers all `/crm/*` routes
- `src/app/sales/layout.tsx` — covers all `/sales/*` routes

**Symptom to watch for:** "The page renders but buttons/forms don't do anything
when clicked." This is almost always a CSP nonce + static prerender issue.

**Lesson:** When a framework has both static and dynamic rendering modes, and you
add per-request security headers (like CSP nonces), you MUST force dynamic
rendering. Static pages can't receive per-request headers.

### 7.3 The "Database Update Required" Bug (Most Common Schema Bug)

**What happened:** New columns were added to `CREATE TABLE IF NOT EXISTS` but
not to the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration section. New
databases got the columns. Existing databases didn't. Production queries failed
with "column does not exist."

**Root cause:** `CREATE TABLE IF NOT EXISTS` does NOT add columns to an existing
table. It only creates the table if it doesn't exist. For existing tables, you
need `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**Fix:** Every new column must be added to BOTH:
1. The `CREATE TABLE` statement (for new databases)
2. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` section (for existing databases)

**Lesson:** Idempotent schema files have two audiences: fresh databases and
existing databases. Both must get the full schema. `CREATE TABLE IF NOT EXISTS`
serves fresh databases. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` serves existing
databases. You need both.

### 7.4 The "Email Never Sent" Bug

**What happened:** The Retell webhook used fire-and-forget code
(`processWebhookInBackground().catch()` without `await`) then returned
immediately. On Vercel serverless, the function froze before the email-sending
code ran. Emails were silently dropped.

**Root cause:** Vercel serverless functions freeze after the response is sent.
Fire-and-forget promises may not complete.

**Fix:** Use `after()` from `next/server` for post-response work:

```typescript
import { after } from 'next/server';

after(() => sendEmail().catch(err => logError('email', err)));
return NextResponse.json({ received: true });
```

`after()` tells Next.js "run this after the response is sent, but don't freeze
the function until it's done."

**Lesson:** On serverless platforms, never fire-and-forget. Use `after()` or
`await` the operation. The platform decides when to freeze based on the response,
not based on pending promises.

### 7.5 The "Wrong Retell Field Name" Bug

**What happened:** Code used `call_analysis.summary` and `call_analysis.outcome`.
The actual Retell API returns `call_analysis.call_summary` and
`custom_analysis_data.call_outcome`. Lead capture emails silently broke — empty
summaries, missing outcomes.

**Root cause:** Assumed field names based on naming conventions instead of
verifying against the actual API response.

**Fix:** Corrected to `call_analysis.call_summary` (8 locations) and
`custom_analysis_data.call_outcome` (2 locations).

**Lesson:** Never assume API field names. Verify against the actual API
documentation or a real webhook payload. Grep the codebase for how other routes
handle the same API.

### 7.6 The "Email Threading Hid Important Alerts" Bug

**What happened:** Multiple emails with the same subject line were auto-threaded
by email clients. Urgent call alerts were buried in a thread with routine
notifications.

**Root cause:** Email subjects were generic ("New call received") without unique
identifying data.

**Fix:** All email-sending functions now include unique identifying data in the
subject (caller phone + date/time, timestamp, etc.):

```typescript
const subject = `New lead from ${callerPhone} — ${new Date().toLocaleString()}`;
```

**Lesson:** Email subjects must be unique. Email clients thread by subject.
If you send 50 emails with the same subject, they all collapse into one thread
and the urgent ones get lost.

### 7.7 The "Hyphens Broke TTS" Bug

**What happened:** AI prompts contained hyphenated compound words
("24/7 availability", "same-day service"). TTS engines paused unnaturally at
hyphens, making the agent sound broken.

**Root cause:** Hyphens are interpreted as pause markers by some TTS engines.

**Fix:** All hyphens removed from natural language prompt text. The
AI-generate-prompt meta-prompt includes a `NO HYPHENS RULE` section.

**Lesson:** When generating text that will be spoken by TTS, test with the actual
TTS engine. Punctuation that's fine in written text can break spoken text.

### 7.8 The "Misleading Marketing Claims" Bugs (Multiple)

**What happened (examples):**
- "HIPAA compliant" — RingProof is not certified, only HIPAA-ready
- "Unlimited simultaneous calls" — Unlimited tier has 5 concurrent slots
- "$150-$599/month" — omitted the $1,200 Unlimited tier
- "14-day trial" — actual trial is 7 days
- "Two plans" — actually three plans
- "Hundreds of integrations" — actually 46
- "Human escalation" — feature not implemented
- "Multi-location routing" — not advertised as a feature (but IS implemented internally)

**Root cause:** Marketing copy was written aspirationally or based on plans, not
based on what the code actually does. Pricing was duplicated across 7+ locations
and drifted.

**Fix:** Audited every public-facing claim against the codebase. Changed claims
to match reality. Added the audit as an ongoing process.

**Lesson:** Every marketing claim must be verified against the code. "We support
X" means "grep the codebase for X's implementation." If you can't find the
implementation, the claim is false. Change the claim, not the code (unless you're
actually implementing the feature).

### 7.9 The "Provider-Specific Assumption" Bugs (Multi-Provider Migration)

**What happened:** Multiple routes assumed all clients use Retell:
- AI tool routes looked up `retell_agent_id` only — ElevenLabs clients failed
- Calendar routes used Retell-specific identifiers — ElevenLabs clients failed
- Voice incoming route hardcoded Retell webhook URL — ElevenLabs calls went nowhere
- Report page didn't select provider fields — non-Retell clients showed Retell UI

**Root cause:** The codebase was originally Retell-only. Every route hardcoded
Retell assumptions. When ElevenLabs was added, these assumptions weren't updated.

**Fix:** Provider abstraction layer (`src/lib/voice/provider.ts`). All routes use
`getAgentId()` which resolves the correct ID based on `voice_provider`. All
queries select `voice_provider`, `voice_provider_agent_id`, `provider_call_id`.

**Lesson:** When adding a second provider to a single-provider system, grep for
EVERY reference to the first provider's specific fields. Each one is a potential
bug. The provider abstraction must be complete — any route that bypasses it is a
bug waiting to happen.

### 7.10 The "Settings Cache Stale" Bug

**What happened:** Placeholder clients were created with `paid_at` set and
`contract_signed` true, but the onboarding portal still showed step 1.

**Root cause:** The onboarding portal reads from a settings cache
(`onboarding_pending_[token]`) first. If the cache exists, it uses the cache
instead of the DB. The cache had stale data from before the placeholder was
created.

**Fix:** When creating placeholder clients that are past payment, DELETE the
`onboarding_pending_[token]` settings row.

**Lesson:** When you have a cache layer, always clean the cache when the
underlying data changes. A stale cache is worse than no cache — it shows
confidently wrong data.

---

## 8. Schema Discipline — The Complete Method

### 8.1 The Single-File Schema Pattern

`.sql/schema.sql` is the SINGLE source of truth for the database. There are no
separate migration files. The entire file is designed to be run repeatedly
against any database (fresh or existing).

**Why single-file?** Separate migration files create problems:
- "Which migrations have been applied?" requires a tracking table
- Migrations can depend on each other in non-obvious ways
- Re-running a migration might fail if it's not idempotent
- Fresh databases need ALL migrations run in order

A single idempotent file solves all of these: run the whole file, every time,
on any database. It always works.

### 8.2 The Idempotent Patterns

Every statement in schema.sql must be safe to run multiple times:

```sql
-- Tables: IF NOT EXISTS
CREATE TABLE IF NOT EXISTS clients (...);

-- Columns: ADD COLUMN IF NOT EXISTS
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_type text;

-- Constraints: DROP IF EXISTS + ADD (ALTER CONSTRAINT doesn't support IF NOT EXISTS)
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS cl_outcome_check;
ALTER TABLE call_logs ADD CONSTRAINT cl_outcome_check CHECK (...);

-- Seed data: ON CONFLICT
INSERT INTO addon_catalog (...) VALUES (...)
ON CONFLICT (slug) DO NOTHING;

-- RLS: DROP IF EXISTS + CREATE
DROP POLICY IF EXISTS "admin_all_clients" ON clients;
CREATE POLICY "admin_all_clients" ON clients FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Indexes: IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
```

### 8.3 The Two-Audience Rule

Every schema change has two audiences:
1. **Fresh databases** — get the schema from `CREATE TABLE`
2. **Existing databases** — get the schema from `ALTER TABLE`

You MUST serve both. Adding a column to `CREATE TABLE` but not `ALTER TABLE`
means fresh databases work but existing databases break. This is the #1 cause
of production schema errors.

### 8.4 The RLS Rule

Every table MUST have:
1. `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`
2. At least one policy (tables with RLS but no policies = invisible to non-service-role)

```sql
-- Minimum viable RLS for an admin table
ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_my_new_table" ON my_new_table;
CREATE POLICY "admin_all_my_new_table" ON my_new_table FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
```

### 8.5 The TypeScript Sync Rule

When you change the schema, you MUST update `src/lib/supabase/types.ts` in the
same commit. The TS types must match the DB schema exactly. If they don't:
- TypeScript won't catch queries that reference non-existent columns
- TypeScript will reject queries that reference new columns
- The build will fail or (worse) pass with wrong types

### 8.6 The "Tell the User" Rule

After any schema change, tell the user to run `.sql/schema.sql` against their
live database. The file is safe to run multiple times. But the AI can't run it
for them — they have to do it in their Supabase dashboard.

---

## 9. Security Checklist — The Complete Method

Every new endpoint, form, or database change MUST pass these checks:

### 9.1 Rate Limiting
- Every POST endpoint that accepts unauthenticated requests MUST be rate-limited
- Target: 100 requests/hour per IP for auth endpoints, 20/hour for form submissions
- Use `src/lib/rateLimit.ts` (in-memory sliding window)
- Apply to: login, signup, password reset, onboarding submission, lead capture

### 9.2 Row Level Security
- Every table MUST have RLS enabled
- Every table MUST have at least one policy
- Admin tables: `for all using (is_admin()) with check (is_admin())`
- Portal tables: policy using `report_token` or `portal_session` verification
- Never use `USING (true)` in production policies

### 9.3 Secrets Management
- ALL secrets in environment variables via `src/lib/env.ts` — never hardcoded
- Service role keys NEVER reach client-side code
- Webhook signing secrets masked in API responses (return prefix only)
- `.env*` files gitignored — only `.env.example` committed

### 9.4 Input Validation
- Parse `req.json()` inside try/catch — malformed JSON returns 400, not crash
- Validate required fields exist before use
- Trim all string inputs
- Validate emails, UUIDs, phone numbers with regex
- Type-check numeric inputs (don't trust JSON types)
- Never trust client-side validation alone — always re-validate server-side

### 9.5 Authorization
- Admin routes: verify `user_profiles.role === 'admin'`
- Portal routes: verify `portal_session` cookie
- Onboarding routes: verify `onboarding_token`
- Cron routes: verify `CRON_SECRET` Bearer token
- Webhook routes: verify signature
- Check for IDOR: can user A access user B's data by changing an ID?

### 9.6 Data Minimization
- Never return `password_hash`, `signing_secret`, API keys in JSON responses
- Mask secrets: return only first 8 chars
- Portal endpoints: only return data for the authenticated client
- Use `.select()` to explicitly choose columns — never `select('*')` on sensitive tables

### 9.7 Timing-Safe Comparisons
- ALL secret/token/signature comparisons use `crypto.timingSafeEqual()`
- Never use `===` or `!==` for secret comparison — vulnerable to timing attacks
- Always check buffer length BEFORE `timingSafeEqual()` (it throws on mismatched lengths)

### 9.8 PHI Scrubbing
- Error messages scrubbed before logging (emails, phones, SSNs, addresses, names)
- Context objects filtered through allowlist of safe keys
- No `console.log` of secrets, passwords, tokens, or PII
- Silent catch blocks forbidden — at minimum log the error

---

## 10. CSS & Design Rules — Lessons From Audit Failures

These rules prevent silent CSS failures — code that compiles and lints clean but
doesn't match any element.

### 10.1 React Inline Style Serialization

React serializes inline styles to **kebab-case** in the DOM, NOT camelCase:

```css
/* WRONG — will never match */
[style*="flexDirection:'row'"]
[style*="fontSize:'2rem'"]

/* CORRECT — matches React's serialized output */
[style*="flex-direction:row"]
[style*="font-size:2rem"]
```

### 10.2 CSS Variable Circular References

```css
/* WRONG — circular reference, variable references itself */
--font-body: var(--font-body), sans-serif;

/* CORRECT — only declare aliases */
--font-heading: var(--font-display);
```

If `next/font/google` sets `--font-body` in layout.tsx, do NOT re-declare it in CSS.

### 10.3 Focus Rings — Use Outline, Not Box-Shadow

When applying `* { box-shadow: none !important }`, you also remove box-shadow-based
focus rings. ALWAYS add a `*:focus-visible` rule using `outline`:

```css
.client-portal-root *:focus-visible {
  outline: 2px solid var(--color-signal) !important;
  outline-offset: 2px !important;
}
```

### 10.4 Mobile Progress Bars — Always Add Overflow Scroll

Multi-step progress bars with 5+ items will overflow on 320px screens:

```typescript
containerStyle: {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
},
innerRowStyle: {
  minWidth: '320px',
},
labelStyle: {
  whiteSpace: 'nowrap',
},
```

### 10.5 Connector Lines — Don't Double Up

A div with `height: '2px'` AND `borderTop: '2px solid'` is 4px tall, not 2px.
Use EITHER `height` with `background` OR `borderTop` with `height: 0`.

### 10.6 Card Padding on Mobile — Always Use clamp()

Fixed `padding: '2.5rem'` leaves only ~240px of content on a 320px screen:

```typescript
padding: 'clamp(1.5rem, 5vw, 2.5rem)'  // Scales with viewport
```

### 10.7 Loading States — Consolidate Redundant Screens

If `!mounted` and `loadingState` render the same UI, merge them:

```typescript
// WRONG — causes flash of empty content between states
if (!mounted) return <LoadingScreen />;
if (loadingState) return <LoadingScreen />;

// CORRECT — single condition
if (!mounted || loadingState) return <LoadingScreen />;
```

### 10.8 Completion Timers — Minimum 3.5 Seconds

When showing a success message before redirecting, use minimum 3500ms. 2500ms is
too fast for users to read and understand what happened.

### 10.9 CSS File Syncing — Verify After Copy

When copying CSS files (e.g., `client-portal.css` to `onboard-portal.css`),
ALWAYS verify class name replacements applied correctly by grepping for leftover
references. A missed replacement means CSS rules won't match any element.

### 10.10 Landing Page CSS — Three Files That Must Stay in Sync

The landing page uses a split-CSS strategy:
- `src/app/landing-critical.css` — inlined, above-the-fold styles
- `public/landing-deferred.css` — loaded non-blockingly, below-the-fold styles
- `src/app/landing.css` — the FULL source stylesheet

When editing landing CSS: update `landing.css`, update `landing-critical.css` if
above-the-fold, THEN regenerate the deferred file:
```
Copy-Item src/app/landing.css public/landing-deferred.css -Force
```

If you forget, CSS changes won't appear on the live site.

---

## 11. AI Reasoning Strategy — When to Think Step-by-Step

Based on Apple's "The Illusion of Thinking" paper and empirical testing:

### Three Zones

| Difficulty | Approach | Example |
|-----------|----------|---------|
| Simple | Direct prompt — no reasoning prefix | Renaming a variable, changing a style |
| Medium | Structured reasoning — 5 steps max | Debugging, multi-file changes, trade-offs |
| High | Break into smaller medium subtasks | Novel architecture, complex race conditions |

### Practical Rules

- **Direct prompt** for: renaming, styling, adding a field, fixing lint, config
  changes, simple grep-and-replace
- **Reasoning prompt** for: debugging race conditions, tracing data flow across
  5+ files, designing new API endpoints, refactoring modules, security audits
- **NEVER** add "think step-by-step" to simple tasks — it burns 10x tokens for
  worse accuracy
- When using reasoning, keep it to 5 steps max — elaborate 10-step frameworks
  don't help, they just add noise

---

## 12. Production-Readiness Audit Methodology

The audit process that found and fixed the issues documented in this codebase:

### 12.1 The Audit Checklist

For every page, route, and feature, check:

1. **Pricing accuracy:** Does the displayed price match `PLAN_TIERS`? Are all
   tiers represented? Is the overage rate correct?
2. **Feature claims:** Does the code actually implement what's claimed? Grep for
   the handler. If you can't find it, the claim is false.
3. **Provider assumptions:** Does the route handle non-Retell providers? Grep for
   `retell_agent_id` — should also check `voice_provider_agent_id`.
4. **Date accuracy:** Are blog dates, last-updated dates, and title years
   consistent? No future dates unless intentional.
5. **Count accuracy:** Do "X integrations" claims match the actual count? Count
   the entries.
6. **HIPAA claims:** "HIPAA compliant" means certified. Use "HIPAA-ready" if not
   certified.
7. **Trial length:** Does the claimed trial length match the actual trial period?
8. **Concurrency claims:** "Unlimited" means truly unlimited. If there's a cap,
   state the cap.
9. **Sitemap coverage:** Are all public pages in the sitemap?
10. **JSON-LD accuracy:** Does the structured data match reality? Logo exists?
    Service area correct?

### 12.2 The Audit Process

1. **Grep for claims:** Search marketing pages for specific claims (prices,
   features, counts, durations)
2. **Verify against code:** For each claim, grep the codebase for the
   implementation
3. **Fix the claim OR the code:** If the claim is wrong, fix the claim. If the
   feature is missing, either implement it or remove the claim.
4. **Check for duplication:** If pricing/claims appear in multiple locations,
   check all of them. Drift is inevitable.
5. **Run verification:** `tsc --noEmit` + `eslint --max-warnings=0`
6. **Commit and push** after each batch of fixes

### 12.3 The "Grep Before Assuming" Rule

Before you write code that:
- Calls a function → grep for the function name to verify it exists
- References a type → grep for the type name to verify its definition
- Imports a module → grep for the module path to verify it exists
- Uses a DB column → grep schema.sql for the column name
- Claims a feature → grep for the feature's handler/implementation

**Every assumption is a potential bug. Verify with tools, not intuition.**

---

## 13. Operational Wisdom — Lessons From the Trenches

### 13.1 The Pool-First Resource Pattern

Twilio phone numbers are NEVER directly released. They go to the
`available_numbers` reuse pool. Only a scheduled cron job releases them.

**Why?** Twilio numbers take time to provision and cost money to release and
re-purchase. Reusing numbers from the pool is faster and cheaper. If you release
a number and a client signs up the next day, you have to buy a new number. If
you pool it, you just assign the pooled number.

**Lesson:** Expensive/slow-to-provision resources should be pooled, not released.
This applies to phone numbers, IP addresses, and any resource with a provisioning
delay or cost.

### 13.2 The Caching-with-Fallback Pattern

Settings are loaded from the DB with hardcoded fallback constants:

```typescript
const num = (key: string, fallback: number): number => {
  const v = map.get(key);
  return typeof v === 'number' ? v : fallback;
};

return {
  starterMonthlyPrice: num('starter_monthly_price', PLAN_TIERS.starter_150.monthlyPrice),
};
```

**Why?** The settings table might be empty (fresh install), might be missing a
key (schema updated but seed data not run), or might have a wrong type (manually
edited). The fallback ensures the system always works.

**Lesson:** Every DB-backed configuration should have a hardcoded fallback. The
system must work even if the DB is empty.

### 13.3 The Concurrent Refresh Prevention Pattern

Cronofy OAuth tokens need refreshing. If two requests trigger a refresh
simultaneously, you get a race condition — both refresh, one overwrites the
other, the token might get invalidated.

**Fix:** Module-level `refreshPromises` Map:

```typescript
const refreshPromises = new Map<string, Promise<string>>();

async function getValidAccessToken(clientId: string): Promise<string> {
  // If a refresh is already in progress for this client, wait for it
  const existing = refreshPromises.get(clientId);
  if (existing) return existing;

  const promise = doRefresh(clientId);
  refreshPromises.set(clientId, promise);
  try {
    return await promise;
  } finally {
    refreshPromises.delete(clientId);
  }
}
```

**Lesson:** When an operation is expensive and idempotent (like token refresh),
deduplicate concurrent calls. The first call does the work; subsequent calls wait
for the same promise.

### 13.4 The Atomic Claim Pattern

When claiming a resource from a pool, use `UPDATE...RETURNING`:

```typescript
const { data: claimed } = await supabase
  .from('available_numbers')
  .update({ reused: true })
  .eq('reused', false)
  .order('created_at', { ascending: true })
  .limit(1)
  .select('*')
  .maybeSingle();
```

**Why?** Under concurrent calls, two requests might both see the same available
number. `UPDATE...RETURNING` is atomic — only one UPDATE wins per row. The other
request gets null and tries the next number.

**Lesson:** For resource claiming from a pool, use atomic UPDATE...RETURNING, not
SELECT-then-UPDATE. The latter has a race condition.

### 13.5 The Webhook URL Migration Checklist

When moving routes (e.g., from `/api/webhooks/` to `/crm/api/webhooks/`), external
services still point at the old URL. You MUST update:

- **Retell AI dashboard:** Webhook URL
- **Stripe dashboard:** Webhook endpoint
- **ElevenLabs dashboard:** Webhook URL
- **Twilio phone numbers:** Voice URL, SMS URL for each number

If you forget, webhooks 404 and calls/payments silently fail.

**Lesson:** Route migrations are not complete until all external service
configurations are updated. Keep a deployment checklist.

### 13.6 The "Test Call Excluded From Metrics" Pattern

The portal's "Try your agent" button creates a test call. Test calls are excluded
from metrics, emails, and billing:

```typescript
// Mark as test call in the webhook handler
if (callMetadata.is_test_call) {
  // Don't send lead notification emails
  // Don't count in metrics
  // Don't bill the client
}
```

**Why?** If test calls counted, clients would be afraid to test their agent.
Testing is essential for confidence. Make testing free and safe.

**Lesson:** Always provide a safe testing path that doesn't affect production
metrics or billing. Fear of testing leads to untested production code.

---

## 14. The Complete Lesson Summary

### What I Learned Writing 100,000+ Lines of Code

1. **Verify before trusting.** Every assumption is a potential bug. Grep before
   assuming. Read before writing. Test before claiming "done."

2. **Centralize business logic.** Duplicated logic drifts. Every piece of
   business logic should have ONE home. Import it, never copy it.

3. **Defense in depth.** Security is layers. Rate limiting, input validation,
   auth checks, RLS, column GRANTs, response masking — each catches what the
   previous missed.

4. **DB-save-first.** External APIs fail. The DB is your source of truth. Save
   there first. Sync externally best-effort. Never block the DB save on an
   external API succeeding.

5. **Gate-based logic.** Whitelists beat blacklists. "ALL gates must pass" is
   safer than "if X, Y, or Z is wrong." New conditions are new gates, not new
   blacklist entries.

6. **Idempotency is mandatory.** External systems retry. Networks duplicate.
   Your code must handle being called twice with the same data. Always check
   before inserting.

7. **Best-effort secondary operations.** Emails, SMS, webhooks, integrations —
   these are secondary. Never block the primary operation on a secondary one
   succeeding.

8. **Context management.** Large codebases cause OOM, hallucination, and
   mistakes. Never read huge files in full. Prefer subagents. Grep before
   assuming. Use todo_write for multi-step tasks.

9. **Schema discipline.** Single-file, idempotent, two-audience (fresh +
   existing). Every column in both CREATE TABLE and ALTER TABLE. Every table
   has RLS. TS types match DB schema exactly.

10. **Verify after every change.** `tsc --noEmit` + `eslint --max-warnings=0`.
    Read your changes back. Check edge cases. "It compiles" is not "it works."

11. **Marketing claims must match code.** Every public claim must be verified
    against the implementation. "We support X" means "grep for X's handler."

12. **Provider abstractions must be complete.** When adding a second provider,
    grep for EVERY reference to the first provider. Each hardcoded reference
    is a bug waiting to happen.

13. **Use after() on serverless.** Fire-and-forget doesn't work on Vercel.
    The function freezes after the response. Use `after()` for post-response work.

14. **Timing-safe comparisons everywhere.** Never use `===` for secrets, tokens,
    or signatures. Always `crypto.timingSafeEqual()`. Always check length first.

15. **PHI scrubbing is defense-in-depth.** Even if upstream code fails to
    sanitize, the error logger scrubs PHI. Patterns for email, phone, SSN, DOB,
    address, and name.

16. **Pool expensive resources.** Don't release and re-purchase. Pool them.
    Faster, cheaper, and avoids provisioning delays.

17. **Cache with fallback.** Every DB-backed config should have a hardcoded
    fallback. The system must work even if the DB is empty.

18. **Deduplicate concurrent operations.** Token refreshes, cache fills, any
    expensive idempotent operation — use a promise map to deduplicate.

19. **Atomic resource claiming.** Use UPDATE...RETURNING, not
    SELECT-then-UPDATE. The latter has a race condition.

20. **Keep a deployment checklist.** Route migrations, webhook URL updates,
    secret synchronization — these are not complete until all external
    configurations are updated.

21. **Test safely.** Provide a testing path that doesn't affect production
    metrics or billing. Fear of testing leads to untested production code.

22. **CSS fails silently.** Code compiles, lints clean, but CSS doesn't match.
    React serializes to kebab-case. CSS variables can self-reference. Focus
    rings need outline, not box-shadow. Mobile needs overflow scroll and clamp().

23. **Email subjects must be unique.** Email clients thread by subject. Same
    subject = buried in a thread. Include unique identifying data.

24. **TTS has different rules than text.** Hyphens cause pauses. Test prompts
    with the actual TTS engine. Punctuation that's fine in writing can break
    speech.

25. **The audit never ends.** Pricing drifts. Claims become stale. Providers
    add assumptions. Schema and types drift. Make auditing an ongoing process,
    not a one-time event.

---

## 15. Quick Reference: Anti-Patterns to NEVER Do

| Anti-pattern | Why it's wrong | Do this instead |
|-------------|---------------|-----------------|
| `process.env.X` in any file other than env.ts | Scattered secrets, no centralization | Import from `@/lib/env` |
| `select('*')` on sensitive tables | Might return secrets | Explicitly list columns |
| `===` for secret comparison | Timing attack vulnerable | `crypto.timingSafeEqual()` |
| Fire-and-forget on serverless | Function freezes, code doesn't run | Use `after()` |
| Inline `isIncomplete` logic | Drifts from the shared helper | Import from `clientStatus.ts` |
| Add column to CREATE TABLE only | Existing databases don't get it | Also add ALTER TABLE migration |
| Create table without RLS policy | Table invisible to non-service-role | Add at minimum admin policy |
| `select('*')` then return all fields | Might leak secrets | Use `.select()` with explicit columns |
| Assume API field names | Might be wrong, silently breaks | Verify against actual API response |
| Duplicate pricing in marketing | Drifts from source of truth | Import from `PLAN_TIERS` |
| Hardcode Retell in new routes | Breaks ElevenLabs/Dograh clients | Use `getAgentId()` + provider abstraction |
| `rm -rf` or direct Twilio number release | Loses reusable resource | Use `moveNumberToPool()` |
| Silent catch blocks | Hides errors | At minimum `logError()` |
| `console.log` of secrets/PII | Security/compliance violation | Scrub PHI, never log secrets |
| Same email subject for all alerts | Buried in email thread | Include unique data in subject |
| Hyphens in TTS prompts | Unnatural pauses | Remove all hyphens from prompt text |
| Static prerender + CSP nonce | Buttons don't work (hydration fails) | `export const dynamic = 'force-dynamic'` |
| `any` type | Defeats TypeScript safety | Use `unknown` or proper types |
| `--no-verify` on git commit | Bypasses lint checks | Fix the lint errors and retry |
| npm instead of pnpm | No package-lock.json in repo | Always use `pnpm` |
| Separate migration files | Hard to track, order-dependent | Everything in `schema.sql` |

---

## 16. The Pre-Coding Ritual — Skills That Must Be Installed First

Before writing ANY code on a new SaaS project — especially before building any UI —
two skills MUST be installed and invoked. These are not optional. They are the
foundation that prevents the two most common AI-coding failures: **sloppy design**
and **security holes**.

### 16.1 Hallmark (Anti-AI-Slop Design Skill)

**Location:** `.devin/skills/hallmark/SKILL.md`
**Install:** Place in `.devin/skills/hallmark/` at project root
**Invoke:** `skill invoke hallmark` before any UI work

**What it does:** Makes AI-generated UIs look "made, not generated." Encodes rules
from the anti-AI-slop design field. Insists on structural variety — two pages for
two different briefs should feel like different sites, not color-swaps of one template.

**4 verbs:**
| Verb | When to use |
|------|-------------|
| *(default)* | Building a new page or app |
| `hallmark audit <target>` | Scoring existing UI against anti-patterns |
| `hallmark redesign <target>` | Redesigning visual structure in-place |
| `hallmark study <screenshot \| URL>` | Extracting DNA from a design you admire |

**6 cross-verb disciplines (ALWAYS apply):**

1. **Pre-emit self-critique.** Before output, score 1-5 on: Philosophy, Hierarchy,
   Execution, Specificity, Restraint, Variety. Anything <3 triggers revision.
   Stamp: `/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */`

2. **Honest copy.** No fabricated metrics. If the user didn't supply a number, use
   a placeholder (`—` plus "metric to confirm"), not an invented "+47% conversion."

3. **Locked tokens.** Every color and font must reference a named token
   (`var(--color-accent)`). No inline hex/rgb values. No `font-family: "Some Font"`.

4. **Re-drawn chrome forbidden.** No fake browser bars, phone frames, or code-block
   windows. Use real screenshots in `<figure>` or let content stand alone.

5. **Mobile responsiveness.** Verified at 320/375/414/768px. No horizontal scroll.
   Root `overflow-x: clip`. No two-line clickable text. `minmax(0, 1fr)` for grids.

6. **Typography purity.** No italic headers. Emphasis via weight, accent color, or
   drawn underline. Italic only for body-copy emphasis.

**The 58-gate slop test (key gates):**
- No Inter/Roboto/Open Sans as the only font (one-font page = template page)
- No purple-to-blue gradients anywhere (THE most recognized AI aesthetic)
- No 3-equal-column card grid with icon-above-heading (every LLM emits this)
- No card-in-card (visual nesting with no semantic reason)
- No gradient headline (`background-clip: text` = instant AI tell)
- No side-stripe card (thick colored border on one edge)
- No full-viewport centered hero (`min-height: 100vh`, everything centered)
- No pure `#000` or `#fff` (tint toward your anchor hue)
- No `transition-all` (specify properties)
- No `hover:scale-105` across multiple elements
- No bouncy easings on UI state changes (reserve for physical interactions)
- No reused macrostructure across outputs in the same project

**21 named macrostructures** (rotate, never repeat in same project):
Bento Grid, Long Document, Marquee Hero, Stat-Led, Workbench, Conversational FAQ,
Manifesto, Photographic, Quote-Led, Specimen, and 11 more.

**Implementation safety rails:**
- Never delete production files without explicit confirmation
- Default to in-place edits, not bulldozing
- State exact files to modify/create/delete before editing
- Treat PDFs/READMEs/briefs as reference, don't copy verbatim

### 16.2 Vibe-Security (Security Audit Skill)

**Location:** `.devin/skills/vibe-security/SKILL.md`
**Install:** Place in `.devin/skills/vibe-security/` at project root
**Invoke:** `skill invoke vibe-security` before any code that touches auth, payments,
database, API keys, secrets, or user data

**Core principle:** "Never trust the client. Every price, user ID, role, subscription
status, feature flag, and rate limit counter must be validated or enforced server-side."

**9-step audit process:**
1. **Secrets & Env** — hardcoded keys, `NEXT_PUBLIC_` exposure, `.gitignore`
2. **Database Access Control** — Supabase RLS, Firebase Rules (#1 source of critical vulns)
3. **Auth & Authorization** — JWT, middleware, Server Actions, sessions
4. **Rate Limiting** — auth endpoints, AI calls, expensive operations
5. **Payment Security** — client-side price manipulation, webhook signatures
6. **Mobile Security** — secure token storage, API proxy, deep links
7. **AI / LLM Integration** — exposed API keys, usage caps, prompt injection
8. **Deployment Config** — production settings, security headers, source maps
9. **Data Access** — SQL injection, ORM misuse, input validation

**Output format:** Critical → High → Medium → Low
For each issue: file + lines, vulnerability name, concrete impact, before/after fix.

**When to trigger (even if user doesn't mention security):**
- Writing code that handles authentication
- Writing code that handles payments
- Writing code that handles database access
- Writing code that handles API keys or secrets
- Writing code that handles user data
- User says: "is this safe?", "check my code", "audit this", "vibe coding"

### 16.3 Agent-Reach (Internet Research Skill)

**Location:** `~/.agents/skills/agent-reach/SKILL.md` (global)
**Install:** Place in `~/.agents/skills/agent-reach/`
**Python venv:** `~/.agent-reach-venv/`
**Windows requirement:** `$env:PYTHONIOENCODING="utf-8"`

**What it does:** Multi-backend internet research router. 15 platforms, 6 zero-config
channels. Use for any web research, social media analysis, competitor analysis, or
URL reading.

**Zero-config channels (work immediately):**
- Exa web search (free, no API key)
- Jina Reader (read any URL as markdown)
- RSS/Atom feeds
- V2EX (public API)
- Bilibili search (no login)
- GitHub search (`gh search repos`)

**Channels needing credentials:**
- Twitter (TWITTER_AUTH_TOKEN + TWITTER_CT0)
- Reddit (OpenCLI or rdt-cli cookies)
- YouTube (needs deno for full extraction)

**Quick commands:**
```powershell
# Exa web search (free)
npx mcporter call exa.web_search_exa query="your query" numResults=5

# Read any webpage as clean markdown
curl.exe -s "https://r.jina.ai/https://example.com"

# GitHub search
gh search repos "query" --sort stars --limit 10

# Health check (run before using multi-backend platforms)
& "$env:USERPROFILE\.agent-reach-venv\Scripts\agent-reach.exe" doctor
```

**Rules:**
1. Run `agent-reach doctor --json` before multi-backend platforms
2. Declare which platform/backend you're using
3. Follow retry chains in references, don't guess commands
4. For 全网调研: combine Exa + Twitter/Reddit + 小红书/B站
5. Run `agent-reach check-update` after large research tasks

### 16.4 The Ritual — Every Session

Before starting ANY new SaaS project or major UI work:

1. **Install Hallmark** → `.devin/skills/hallmark/`
2. **Install Vibe-Security** → `.devin/skills/vibe-security/`
3. **Install Agent-Reach** → `~/.agents/skills/agent-reach/`
4. **Invoke Hallmark** before designing any page
5. **Invoke Vibe-Security** before writing any auth/payment/database code
6. **Use Agent-Reach** for any competitive research or URL reading

These are not "nice to have." They are the difference between a SaaS that looks
made and a SaaS that looks generated. They are the difference between secure code
and a breach waiting to happen.

---

## 17. Sales Portal Architecture — Complete Component Breakdown

The sales portal is a self-contained system with its own auth, design system, and
26 API routes. This is the pattern for any multi-tenant SaaS that needs a separate
sales/agent portal alongside the main admin CRM.

### 17.1 Directory Structure

```
src/app/sales/
├── layout.tsx                    # Root layout (fonts, CSS tokens, PWA, force-dynamic)
├── sales-portal.css              # Brutalist design tokens + component styles
├── loading.tsx                   # Loading state
├── login/                        # Public login page
│   ├── page.tsx
│   └── SalesLoginForm.tsx
├── invite/[token]/               # Invitation acceptance (token-authenticated)
│   ├── page.tsx
│   ├── InviteAcceptForm.tsx
│   └── DeadlineAnimation.tsx     # Countdown to expiration
├── reset-password/[token]/       # Password reset (token-authenticated)
│   ├── page.tsx
│   └── ResetPasswordForm.tsx
└── (portal)/                     # Authenticated route group (auth gate in layout)
    ├── layout.tsx                # Auth gate + shell wrapper
    ├── error.tsx                 # Error boundary
    ├── not-found.tsx             # 404
    ├── loading.tsx
    ├── manifest.webmanifest/route.ts  # PWA manifest
    ├── leads/                    # Lead management
    ├── onboarding/               # Client onboarding tracking
    ├── scripts/                  # References (5 sub-tabs)
    ├── commissions/              # Earnings
    ├── sub-agents/               # Sub-agent management (conditional)
    ├── standings/                # Leaderboard
    └── settings/                 # Profile settings
```

**Key pattern:** The `(portal)/` route group is a Next.js App Router convention.
Parentheses create a route group that doesn't affect the URL. All pages inside
share the same layout (auth gate + shell) but the URL stays clean (`/sales/leads`,
not `/sales/(portal)/leads`).

### 17.2 The 7 Navigation Tabs

```typescript
// src/components/SalesAgentShell.tsx (lines 138-146)
const NAV = [
  { href: '/sales/leads', label: 'Leads', Icon: IconLeads },
  { href: '/sales/onboarding', label: 'Onboarding', Icon: IconBook },
  { href: '/sales/scripts', label: 'References', Icon: IconPhone },
  { href: '/sales/commissions', label: 'Earnings', Icon: IconDollar },
  { href: '/sales/sub-agents', label: 'Sub-Agents', Icon: IconUsers,
    showIf: (agent) => !!agent.hasSubAgents },  // Conditional tab
  { href: '/sales/standings', label: 'Standings', Icon: IconTrophy },
  { href: '/sales/settings', label: 'Settings', Icon: IconSettings },
];
```

**Conditional tabs:** The `showIf` function lets tabs appear only when relevant.
Sub-Agents only shows if the agent actually has sub-agents. This prevents confusion
(empty tabs) and keeps the nav clean.

**Prefetch all routes on mount:**
```typescript
// Prefetch all nav routes on mount so tab switching is instant
for (const { href } of NAV) {
  router.prefetch(href);
}
```

### 17.3 Responsive Shell — Desktop Sidebar + Mobile Drawer

**Desktop (≥768px):** Fixed 220px dark sidebar on the left
**Mobile (<768px):** Top header bar + left slide-in drawer (hamburger)
**No bottom nav bar** — maximizes content space

The drawer uses a CSS keyframe animation:
```css
@keyframes sales-drawer-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
```

**Why no bottom nav?** Bottom nav bars eat vertical space on mobile. For a
data-heavy portal (leads, commissions, onboarding), content space is more
valuable than persistent nav. The drawer pattern gives full-width content with
easy nav access.

### 17.4 The 5 Scripts Sub-Tabs

```typescript
type Tab = 'playbook' | 'mindset' | 'product' | 'faq' | 'recordings';

const TABS = [
  { id: 'playbook', label: 'Playbook', icon: '🎯' },
  { id: 'mindset', label: 'Mindset', icon: '🧠' },
  { id: 'product', label: 'Product', icon: '📦' },
  { id: 'faq', label: 'FAQ', icon: '💬' },
  { id: 'recordings', label: 'Recordings', icon: '🎙️' },
];
```

1. **PlaybookTab** — Cold call scripts (direct pitch, social proof, after hours,
   warm referral), niche-specific playbooks (HVAC, plumbing, electrical),
   objection handling (pre-close + closing), closing techniques, ROI math templates
2. **MindsetTab** — Sales psychology, motivation frameworks, discipline habits
3. **ProductTab** — Feature explanations, pricing structures, competitive positioning
4. **FaqTab** — Common objections, technical questions, billing questions
5. **RecordingsTab** — Reference cold-call recordings from Supabase Storage
   (`sales-recordings` bucket). Fetches signed URLs on demand from
   `/sales/api/recordings/[id]/url`

**Pattern:** Client-side tab switching with `useState`. Mobile-first pill-style
tab switcher. Sticky header with tabs. Content rendered conditionally.

---

## 18. Sales Agent Authentication — Custom Session System

The sales portal uses a SEPARATE auth system from the admin CRM. This is critical
for multi-portal SaaS: different user types need different auth systems.

### 18.1 Why Not Supabase Auth?

Sales agents are NOT Supabase Auth users. They live in a custom `sales_agents`
table with their own password hashes, sessions, and roles. Reasons:

1. **Different user model** — Sales agents have commission rates, badge levels,
   parent/sub-agent relationships. Supabase Auth's `auth.users` doesn't support these.
2. **No email confirmation flow** — Sales agents are invited by other agents, not
   self-registered. The invite flow is custom.
3. **Session isolation** — A sales agent session should never interact with admin
   CRM sessions. Separate cookies, separate tables, separate verification.
4. **Service-role queries** — Sales agent lookups use the service-role client
   because RLS policies are designed for admin/portal patterns, not sales agents.

### 18.2 Session Token Pattern

**File:** `src/lib/salesAgentSession.ts`

```typescript
// Cookie names — __Host- prefix in production for extra security
const COOKIE_NAME_DEV = 'sales_agent_session';
const COOKIE_NAME_PROD = '__Host-sales_agent_session';

// Session tokens: 256-bit random, SHA-256 hashed before storage
const tokenHash = hashSalesAgentSessionToken(sessionToken);

// Single query: join session + agent in one round-trip
const { data: result } = await supabase
  .from('sales_agent_sessions')
  .select(`
    id, session_token,
    agent:sales_agents!sales_agent_id (
      id, role, parent_agent_id, full_name, email, phone, login_email,
      status, commission_rate, commission_type, zelle_info,
      created_at, updated_at, tutorial_completed, agent_code
    )
  `)
  .eq('session_token', tokenHash)
  .eq('revoked', false)
  .gt('expires_at', new Date().toISOString())
  .maybeSingle();

// Constant-time re-verification (defense-in-depth)
const storedHashBuf = Buffer.from(result.session_token, 'hex');
if (storedHashBuf.length !== tokenHashBuf.length ||
    !timingSafeEqual(storedHashBuf, tokenHashBuf)) {
  return { salesAgent: null, error: 'Invalid session', status: 401 };
}

// Renew session activity AFTER response (best-effort)
after(async () => {
  await supabase.from('sales_agent_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', result.id);
});
```

**Why this pattern:**
- **`__Host-` prefix** — Forces Secure, HttpOnly, SameSite=strict, no path/domain
- **SHA-256 for tokens** — Fast hash, sufficient for high-entropy tokens (not passwords)
- **bcrypt for passwords** — Slow hash, resistant to brute force (10 rounds)
- **Single query join** — One round-trip instead of two (session → agent)
- **Constant-time re-verification** — Even after DB match, re-verify with
  `timingSafeEqual` to prevent timing attacks
- **`after()` for renewal** — Don't block the response on session activity update

### 18.3 Password Handling

```typescript
// Login: bcrypt compare
const valid = await bcrypt.compare(password, agent.password_hash);

// Reset: bcrypt hash
const passwordHash = await bcrypt.hash(password, 10);
await supabase.from('sales_agents')
  .update({ password_hash: passwordHash })
  .eq('id', agent.id);

// Revoke all sessions on password change
await revokeAllSalesAgentSessions(agent.id);
```

**Rules:**
- NEVER store plaintext passwords
- NEVER log passwords
- ALWAYS revoke all sessions on password change
- ALWAYS use bcrypt (or argon2) for passwords — never SHA-256
- 10 rounds is the minimum; increase for high-value systems

### 18.4 Rate Limiting on Auth Endpoints

```typescript
// Sales login: 5 attempts per 15 minutes per IP
if (!checkRateLimit('sales-login', clientIp, 5, 15 * 60_000)) {
  return NextResponse.json(
    { error: 'Too many login attempts. Please try again in 15 minutes.' },
    { status: 429, headers: { 'Retry-After': '900' } }
  );
}

// Forgot password: 3 requests per hour per IP
if (!checkRateLimit('forgot-password', clientIp, 3, 60 * 60_000)) {
  return NextResponse.json({ error: 'Too many reset requests.' }, { status: 429 });
}
```

### 18.5 Email Enumeration Prevention

```typescript
// Forgot password — same response whether email exists or not
if (!agent) {
  return NextResponse.json({ ok: true, sent: true });
  // Don't reveal that the email doesn't exist
}
```

**Why:** If the API returns different responses for existing vs non-existing emails,
an attacker can enumerate valid emails by trying different addresses. Always return
the same response.

---

## 19. Commission System — Calculation & Data Stripping

### 19.1 The Data Stripping Pattern

The commission API NEVER exposes cost, profit, or revenue data to sales agents.
Agents only see their commission amounts.

```typescript
// src/app/sales/api/commissions/route.ts
const safeClients = report.clients.map((c) => ({
  clientId: c.clientId,
  clientName: c.clientName,
  planType: c.planType,
  monthlyPrice: c.monthlyPrice,       // Client's plan price (needed for context)
  commissionType: c.commissionType,
  periods: c.periods.map((p) => ({
    periodLabel: p.periodLabel,
    commission: p.commission,          // Agent's commission amount
    commissionRate: p.commissionRate,  // Agent's rate
  })),
  totalCommission: c.totalCommission,
  // NOTE: No cost, no profit, no revenue fields
}));
```

**Why:** Sales agents should not know the company's profit margins. If they know
the client pays $599/month and the commission is $150, they can calculate the
margin. Data stripping prevents this.

### 19.2 Badge Progression System

9 badge levels based on lifetime onboardings:
starter → silver → gold → platinum → titanium → obsidian → ruby → sapphire → diamond

The layout fetches badge info in parallel with other data:
```typescript
const [subAgentResult, promoResult, badgeResult] = await Promise.all([
  supabase.from('sales_agents').select('id', { count: 'exact', head: true })
    .eq('parent_agent_id', salesAgent.id).limit(1),
  supabase.from('sales_agents').select('promotion_pending')
    .eq('id', salesAgent.id).maybeSingle(),
  supabase.from('sales_agents').select('badge_level, lifetime_onboardings, last_seen_badge_level')
    .eq('id', salesAgent.id).maybeSingle(),
]);
```

**Pattern:** `Promise.all` for parallel DB queries. If the layout needs 3 pieces of
data, fetch them simultaneously, not sequentially. This cuts layout render time by 3x.

### 19.3 Commission Calculation with Fallback

```typescript
// src/lib/commissionCalc.ts
const FALLBACK_PLAN_PRICING = {
  starter_150: { monthlyPrice: 150, includedMinutes: 150, overageRatePerMinute: 0.60 },
  flagship_599: { monthlyPrice: 599, includedMinutes: 700, overageRatePerMinute: 0.15 },
  unlimited_1200: { monthlyPrice: 1200, includedMinutes: 0, overageRatePerMinute: 0 },
};
```

**Why fallback?** The settings table might be empty (fresh install), missing a key
(schema updated but seed not run), or have a wrong type (manually edited). The
fallback ensures the system always works.

---

## 20. Lead Management — Dedup, Bulk Import, Status Flow

### 20.1 Phone Deduplication Across 4 Tables

When creating a new lead, check 4 tables to prevent duplicates:
1. `dedup_phone_numbers` — rejected leads from call logging
2. `sales_agent_leads` — existing sales agent leads
3. `leads` — admin CRM leads
4. `client_numbers` — existing client phone numbers

**Why 4 tables?** Different systems store phone numbers for different reasons.
A number might be a rejected lead (dedup), an active sales lead, an admin lead,
or an existing client. Checking all 4 prevents the same business from being
contacted by multiple agents or re-contacted after becoming a client.

### 20.2 Bulk Import — Two-Phase Preview/Confirm

```typescript
// Phase 1: Preview (parse + dedup, NO inserts)
if (body.raw_text) {
  return handleBulkPreview(body.raw_text, salesAgent.id);
  // Returns parsed leads with dedup flags, no DB writes
}

// Phase 2: Confirm (insert approved leads only)
if (body.confirmed_leads) {
  return handleBulkConfirm(body.confirmed_leads, salesAgent.id);
  // Only inserts leads the agent approved after preview
}
```

**Why two phases?** AI-parsed raw text might have errors. The preview lets the
agent review parsed leads, see which are duplicates, and approve only the valid
ones. This prevents garbage data from entering the system.

### 20.3 Lead Status Flow

```
lead → did_not_answer → want_callback → interested → converted
                    ↘ not_interested → lost
```

- `lead` — New lead, not yet contacted
- `did_not_answer` — Called, no answer
- `want_callback` — Requested callback
- `interested` — Interested, can be sent to onboarding
- `not_interested` — Not interested, phone added to dedup table
- `converted` — Became a paying client
- `lost` — Deal fell through

---

## 21. Sub-Agent Hierarchy — Invites & Approval Workflows

### 21.1 Invitation System

```typescript
// Only top-level agents can invite
if (salesAgent.role !== 'agent' || salesAgent.parent_agent_id) {
  return NextResponse.json(
    { error: 'Only top-level agents can create invitations' },
    { status: 403 }
  );
}

// 256-bit random token, SHA-256 hashed
const rawToken = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(rawToken).digest('hex');

// 7-day expiration, single-use
await supabase.from('sales_agent_invitations').insert({
  token_hash: tokenHash,
  created_by: salesAgent.id,
  role: 'sub_agent',
  parent_agent_id: salesAgent.id,
  status: 'pending',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
});

const url = `${env.appUrl}/sales/invite/${rawToken}`;
```

**Pattern:** The raw token is in the URL (user sees it). The HASH is in the DB.
An attacker who steals the DB can't use the tokens — they only have hashes.

### 21.2 Account Locking

```typescript
if (isAgentLocked(salesAgent)) {
  return NextResponse.json(
    { error: 'Your account is locked. You cannot create or edit leads.' },
    { status: 403 }
  );
}
```

Locked agents can't: create leads, send invitations, edit settings. They CAN view
their existing data. This is a "soft ban" — the agent can still see their history
but can't take new actions.

---

## 22. ClawCaptcha — Gamified Bot Protection

### 22.1 Why Not Traditional CAPTCHA?

Traditional CAPTCHAs (reCAPTCHA, hCaptcha) hurt conversion rates. Users hate
selecting traffic lights and crosswalks. Cloudflare Turnstile is invisible but
requires a Cloudflare account and adds a third-party dependency.

**ClawCaptcha** (playcaptcha) is a gamified alternative: a claw machine where the
user "grabs the right toy." It's:
- More user-friendly than image grids
- Self-hosted (no third-party dependency)
- Themed to match the portal's design tokens
- Memorable (24-hour remember me)

### 22.2 Implementation

**File:** `src/app/crm/onboard/[token]/ClawCaptchaGate.tsx`
**Package:** `playcaptcha` v0.1.0

```typescript
import { ClawCaptcha } from 'playcaptcha';
import 'playcaptcha/clawcaptcha.css';

const STORAGE_KEY = 'rp_claw_captcha_verified_at';
const REMEMBER_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// On mount, check localStorage for valid remember timestamp
useEffect(() => {
  setMounted(true);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const elapsed = Date.now() - parseInt(stored, 10);
      if (elapsed < REMEMBER_DURATION_MS) {
        setVerified(true); // Skip captcha — still within 24h
        return;
      }
    }
  } catch { /* localStorage not available — show captcha */ }
}, []);

// Render with themed CSS variables
<ClawCaptcha
  onVerify={handleVerify}
  title="Prove you're human"
  assetBase="/playcaptcha/toys/"
/>
```

### 22.3 The Three-State Pattern

```typescript
// State 1: Loading (covers both SSR hydration + captcha JS loading)
if (!mounted || captchaLoading) {
  return <LoadingScreen />;
  // Single loading screen prevents flash of empty content
}

// State 2: Verified (either remembered or just passed)
if (verified) {
  return <>{children}</>;
}

// State 3: Just completed — show success screen with "remember me" option
if (justVerified) {
  return <SuccessScreen onRemember={handleRemember} onSkip={handleSkipRemember} />;
}

// State 4: Show the claw machine captcha
return <ClawCaptcha onVerify={handleVerify} />;
```

**Why consolidate loading states?** Without consolidation, you get a flash:
SSR loading screen → empty content → captcha loading screen → captcha. Merging
`!mounted` and `captchaLoading` into one condition prevents this.

### 22.4 CSS Theming

```typescript
<div
  className="clawcap-gate"
  style={{
    '--clawcap-bg': 'var(--color-paper-2, #F0EDE5)',
    '--clawcap-ink': 'var(--color-ink)',
    '--clawcap-muted': 'var(--color-ink-muted)',
    '--clawcap-accent': 'var(--color-signal)',
    '--clawcap-action': 'var(--color-signal)',
  } as React.CSSProperties}
>
  <ClawCaptcha onVerify={handleVerify} />
</div>
```

The captcha inherits the portal's design tokens. It doesn't look like a bolted-on
third-party widget — it looks like part of the portal.

### 22.5 What the Captcha Does NOT Do

The captcha checks that someone is *playing*, not who they are. Real auth
(onboarding_token) remains behind it. The captcha is a bot filter, not an auth layer.

---

## 23. Spam Shield — AI Call Protection

### 23.1 Transcript-Based Spam Detection

**File:** `src/lib/spamShield.ts`

```typescript
const SPAM_PATTERNS = [
  { pattern: 'google listing', label: 'google_listing' },
  { pattern: 'google business profile', label: 'google_business_profile' },
  { pattern: 'lower your insurance', label: 'insurance_rates' },
  { pattern: 'credit card processing', label: 'credit_card_processing' },
  { pattern: 'merchant services', label: 'merchant_services' },
  { pattern: 'seo services', label: 'seo_services' },
  { pattern: 'solar panels', label: 'solar_panels' },
];

const ROBOTIC_INDICATORS = [
  { pattern: 'this is an automated message', label: 'automated_message' },
  { pattern: 'this is a recorded message', label: 'recorded_message' },
  { pattern: 'please listen carefully', label: 'robotic_greeting' },
  { pattern: 'do not hang up', label: 'robotic_greeting' },
];

// isSpam = 2+ signals OR 1 signal + AI not_genuine
```

**Why pattern matching?** It's fast, deterministic, and doesn't require an API
call. The AI's `call_outcome` field provides the second signal — if the AI says
"not_genuine" AND the transcript has spam patterns, it's definitely spam.

### 23.2 Auto-Blacklist with Forgiveness

**File:** `src/app/crm/api/webhooks/retell/integrations.ts`

```typescript
// Auto-blacklist after 4+ spam calls in 30 days
const { count: recentSpamCount } = await supabase
  .from('call_logs')
  .select('id', { count: 'exact', head: true })
  .eq('client_id', clientId)
  .eq('caller_phone', callerPhone)
  .eq('outcome', 'spam')
  .gte('call_timestamp', thirtyDaysAgo);

if (spamCount < 4) return; // Threshold not met

// Forgiveness: has this caller EVER had a legitimate outcome?
const legitimateOutcomes = ['booked', 'message_taken', 'callback_scheduled'];
const { count: legitCount } = await supabase
  .from('call_logs')
  .select('id', { count: 'exact', head: true })
  .eq('client_id', clientId)
  .eq('caller_phone', callerPhone)
  .in('outcome', legitimateOutcomes);

if (legitCount > 0) return; // Has legitimate interactions — don't blacklist
```

**Why forgiveness?** A caller might have had one spam call (wrong number, sales
pitch) and then become a legitimate customer. The forgiveness check prevents
blacklisting someone who had a one-time spam interaction.

### 23.3 AI Prompt Spam Instructions

The AI agent itself is instructed on how to handle spam:

```
HOW YOU HANDLE SPAM / SALES CALLS:
- Sales calls: "The owner's not available right now. Can I take a message?"
  Keep it short. Don't engage, don't transfer, don't give out personal info.
- Robocallers: if the caller sounds automated or doesn't respond naturally after
  two prompts: "Thanks for calling, but we're not interested. Have a good day."
  End the call.
- Solicitation signals: "extended warranty," "credit card services," "debt relief,"
  "SEO services," "Google listing," "insurance quote," "merchant services"
  — treat as sales, decline politely.
```

**Three layers of spam defense:**
1. **AI prompt** — The agent handles spam in real-time during the call
2. **Spam Shield** — Post-call transcript analysis detects missed spam
3. **Auto-blacklist** — Repeated spam callers are blocked from future calls

---

## 24. Onboarding Flow — 5-Step Wizard Architecture

### 24.1 State-Driven Step Navigation

```typescript
// computeInitialStep — determines where to resume based on DB state
const computeInitialStep = (): number => {
  const isProvisioned = !!(clientData.ringproofNumber && clientData.ringproofNumber !== 'pending');
  if (isProvisioned) return 5;  // Fully provisioned → setup step
  if (clientData.contractSigned) return 4;  // Contract signed → payment step
  if (clientData.ownerName && clientData.email && (clientData.trialOptedIn || clientData.monthlyPrice !== 150))
    return 3;  // Details + plan done → agreement step
  if (clientData.ownerName && clientData.email) return 2;  // Details done → plan step
  return 1;  // Nothing done → start at details
};
```

**Why this matters:** If a user closes the browser mid-onboarding and comes back
later, they should resume where they left off, not start over. The DB state
determines the step.

### 24.2 Gate-Based Navigation

```typescript
const canNavigateTo = (target: number) => {
  if (clientData.onboardingTokenTerminatedAt) return false;
  if (portalStep === 5) return false;
  if (target === 1) return true;
  if (target === 2) return !!(ownerName && businessName && phone && email && address);
  if (target === 3) return !!(/* step 2 fields */ && planType);
  if (target === 4) return !!(/* step 3 fields */ && isSigned);
  if (target === 5) return !!(clientData.ringproofNumber && clientData.ringproofNumber !== 'pending');
  return false;
};
```

Each step requires ALL previous steps to be complete. This is the gate-based
whitelist pattern — you can only navigate to a step if all gates before it pass.

### 24.3 The 5 Steps

| Step | Name | Fields | API |
|------|------|--------|-----|
| 1 | Details | ownerName, businessName, phone, email, address, tradeType | update-details |
| 2 | Plan | planType, billingCycle, trialOptedIn, promoCode | update-plan |
| 3 | Agreement | contractSigned, signName, contractVersion | sign-contract |
| 3.5 | Checkpoint | Review all previous steps | (client-side only) |
| 4 | Payment | Stripe checkout redirect | create-checkout |
| 5 | Setup | carrier, forwardingType, ringTime, codes, verification | save-forwarding, save-advanced |

### 24.4 Plan Selection with Annual/Monthly Toggle

```typescript
const STARTER_PRICE = billingCycle === 'annual' ? 100.5 : 150;
const FLAGSHIP_PRICE = billingCycle === 'annual' ? 401.33 : 599;
const UNLIMITED_PRICE = billingCycle === 'annual' ? 800 : 1200;
```

Annual billing saves 33%. The toggle is disabled after contract signing
(`isPlanLocked`) to prevent changing plans mid-flow.

### 24.5 Contract Signing — Electronic Signature

```typescript
// API: /crm/api/onboarding/sign-contract
await supabaseAdmin.from('clients').update({
  contract_signed: true,
  contract_signed_name: signatureName.trim(),
  contract_signed_at: new Date().toISOString(),
  contract_agreed_at: new Date().toISOString(),
  contract_version_shown: contractVersion || 'general_terms_v1'
}).eq('id', client.id);
```

**DB trigger backup:** `trg_guard_contract_before_payment` blocks any status change
to trial/active while `contract_signed` is false. Even if the API has a bug, the
DB prevents payment without a signed contract.

### 24.6 Stripe Checkout with Idempotency

```typescript
// Reuse session if <30 min old and price/promo unchanged
if (existingSession && existingSession.expires_at > now &&
    existingSession.amount === currentAmount &&
    existingSession.promo_code === currentPromo) {
  return NextResponse.json({ url: existingSession.url });
}
```

**Why idempotency?** If a user clicks "Pay" twice, they should get the same
checkout URL, not two different sessions. This prevents duplicate Stripe sessions
and confusing the user.

---

## 25. Landing Page — Server Render + Deferred Interactions

### 25.1 The Split Pattern

```typescript
// src/app/page.tsx
import './landing-critical.css';  // Inlined, above-the-fold styles
import './landing.css';           // Full stylesheet
import LandingInteractionsLazy from './LandingInteractionsLazy';

// Server component renders HTML immediately
const homeSections = [<HeroSection key="hero" />];

// Client interactions deferred (ssr: false)
<LandingInteractionsLazy />
```

**Why split?** The landing page needs to render FAST (first contentful paint).
Server-rendered HTML with critical CSS loads immediately. Client-side interactions
(tab switching, scroll reveal, sidebar) load after hydration via a lazy component
with `ssr: false`.

### 25.2 Tab System with Hash Support

```typescript
type ViewName = 'home' | 'pricing' | 'faq' | 'tools';

const hashToView = {
  '#tools': 'tools',
  '#pricing': 'pricing',
  '#faq': 'faq',
  '#home': 'home',
};

function showView(name: ViewName) {
  views.forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'instant' });
  refreshObserver();  // Re-trigger scroll reveal for new view
  closeSidebar();
}
```

**Hash support** means users can bookmark `getringproof.com/#pricing` and land
directly on the pricing tab. Shareable URLs for each tab.

### 25.3 Scroll Reveal with IntersectionObserver

```typescript
let observer: IntersectionObserver | null = null;

function refreshObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      entry.target.classList.toggle('in', entry.isIntersecting);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => {
    const view = el.closest('.view');
    if (view && !view.classList.contains('active')) return;
    observer.observe(el);
  });
}
```

**Why `refreshObserver()`?** When switching tabs, new elements become visible.
The observer needs to be refreshed to observe elements in the newly active view.
Without this, scroll reveal doesn't work on tab switch.

**CSS:**
```css
.reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s, transform 0.6s; }
.reveal.in { opacity: 1; transform: translateY(0); }
```

### 25.4 The 4 Calculators

| Calculator | Inputs | Outputs | Formula |
|-----------|--------|---------|---------|
| TierCalculator | calls/month, avg minutes | Cost per tier, recommended tier | Crossover at 965min (Starter=Flagship), 4707min (Flagship=Unlimited) |
| MissedCallCostCalculator | daily calls, missed %, job value, close rate | Monthly/annual lost revenue | `missedCalls × closeRate × jobValue` |
| SavingsCalculator | human cost, after-hours cost, RingProof tier | Monthly/annual savings | `(humanCost + afterHours) - ringproofCost` |
| RoiCalculatorSection | trade, missed calls, job value, close rate, tier | Recoverable revenue, net value | `missedCalls × 0.85 × closeRate × jobValue - monthlyPrice` |

**Pattern:** Calculators are lazy-loaded to keep the initial bundle small:
```typescript
const TierCalculator = lazy(() => import('./TierCalculator'), { ssr: false });
```

---

## 26. Proxy & CSP — The Complete Security Header Method

### 26.1 Per-Request Nonce Generation

```typescript
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}
```

**Why per-request?** A static nonce would be the same for every user, defeating
the purpose. Each request gets a unique nonce. Next.js extracts the nonce from
the CSP header and injects it into inline scripts during SSR.

### 26.2 Three Route Types

```typescript
const routeType: 'report' | 'crm' | 'public' =
  pathname.startsWith('/crm/report/') ? 'report' :
  pathname.startsWith('/crm/') || pathname.startsWith('/sales/') || pathname.startsWith('/login') ? 'crm' :
  'public';
```

| Route type | CSP script-src | Why |
|-----------|---------------|-----|
| `report` | `'nonce-xxx'` + LiveKit WebSocket + WebRTC | Test calls need WebRTC |
| `crm` | `'nonce-xxx'` | Authenticated, dynamic, nonce-based |
| `public` | `'unsafe-inline'` | Statically rendered, can't receive nonces |

**The critical rule:** Every root layout for a route prefix that receives
nonce-based CSP MUST have `export const dynamic = 'force-dynamic'`. Without this,
the page is statically prerendered at build time when no nonce exists. The CSP
blocks inline scripts, React hydration fails, and buttons don't work.

### 26.3 Geo-Location Re-Authentication

```typescript
// At login, store the user's geo location in a cookie
// On subsequent requests, compare current geo to login geo
if (currentGeo && !isSameLocation(loginGeo, currentGeo)) {
  await supabase.auth.signOut();
  redirect('/crm/login?reason=location_change');
}
```

**Why?** If a session is stolen and used from a different city, the geo change
triggers re-authentication. This is defense-in-depth against session hijacking.

**Geo lookup priority:**
1. Vercel edge headers (`x-vercel-ip-city`, `x-vercel-ip-country`)
2. Cloudflare headers (`cf-ipcountry`, `cf-ipcity`)
3. IP-API fallback (only if `ENABLE_IP_GEO_LOOKUP=true`)

### 26.4 Security Headers (next.config.ts)

```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Content-Security-Policy', value: [...] },
];
```

**COOP/COEP** prevent Spectre-class attacks by isolating the browsing context.
`credentialless` allows cross-origin resources without CORP headers but strips
credentials — safer than `unsafe-none`, less strict than `require-corp`.

### 26.5 X-Robots-Tag for CRM Routes

```typescript
if (pathname.startsWith('/crm/')) {
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
}
```

**Why HTTP header, not just meta tag?** Belt-and-suspenders. The meta tag can be
missed if a page renders without it. The HTTP header is always present for CRM
routes, regardless of page content.

---

## 27. CI/CD Pipeline — 11 Workflows + Cron Pattern

### 27.1 The Cron Workflow Template

All 10 cron workflows follow the same pattern:

```yaml
jobs:
  fire-[job-name]:
    runs-on: ubuntu-latest
    timeout-minutes: [2-10]
    steps:
      - name: Check secrets
        run: |
          if [ -z "$APP_URL" ] || [ -z "$CRON_SECRET" ]; then
            echo "::error::Missing GitHub repo secrets."
            exit 1
          fi
      - name: Trigger endpoint
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          RESPONSE=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Authorization: Bearer $CRON_SECRET" \
            "$APP_URL/crm/api/[endpoint]")
          STATUS=$(echo "$RESPONSE" | tail -1)
          if [ "$STATUS" != "200" ]; then
            echo "::error::Job failed with status $STATUS"
            exit 1
          fi
```

**Why this pattern?**
- **Secret check first** — Fail fast if secrets are missing
- **Bearer token auth** — `CRON_SECRET` must match between GitHub and Vercel
- **Status extraction** — `curl -w "%{http_code}"` appends status code to response
- **Exit 1 on failure** — Triggers GitHub Actions failure notification emails

### 27.2 The 11 Workflows

| Workflow | Schedule | Endpoint |
|----------|----------|----------|
| lint.yml | push/PR to main | (CI: ESLint + tsc) |
| audit-reports-cron | daily 03:00 UTC | /crm/api/cron/audit-reports |
| check-callbacks-cron | every 5 min | /crm/api/cron/check-callbacks |
| health-check-cron | daily 12:00 UTC | /crm/api/cron/check-health |
| monthly-standings-cron | 1st of month 00:05 | /crm/api/cron/monthly-standings-reset |
| retry-failed-provisioning | every 6 hours | /crm/api/jobs/retry-failed-provisioning |
| seasonal-context-cron | 1st of month 02:00 | /crm/api/cron/update-seasonal-context |
| seasonal-outreach-cron | 1st of month 03:00 | /crm/api/cron/seasonal-outreach |
| send-review-requests-cron | every 4 hours | /crm/api/cron/send-review-requests |
| slot-generation-cron | daily 02:00 UTC | /crm/api/jobs/generate-slots |
| webhook-cron | DISABLED | /crm/api/webhooks/process |

### 27.3 CI Lint Workflow

```yaml
- uses: actions/setup-node@v5
  with:
    node-version: 22
    cache: pnpm
- run: pnpm install --frozen-lockfile
- run: pnpm run lint
- run: npx tsc --noEmit
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```

**Why `--max-old-space-size=4096`?** The codebase is large. TypeScript's type
checker can exceed the default Node.js memory limit (typically 1.5-2GB). 4GB
prevents OOM during type-check.

**Why `--frozen-lockfile`?** Ensures dependencies match `pnpm-lock.yaml` exactly.
No surprise versions from a regenerated lockfile.

### 27.4 Dependabot Configuration

```yaml
- package-ecosystem: "npm"
  schedule:
    interval: "weekly"
    day: "monday"
  groups:
    minor-and-patch:
      update-types: ["minor", "patch"]
  ignore:
    - dependency-name: "next"
      update-types: ["version-update:semver-major"]
    # Same for react, react-dom, typescript, eslint
```

**Why group minor/patch?** Reduces PR noise. Instead of 10 PRs for 10 patch
updates, you get 1 PR with all of them.

**Why block major versions?** Major versions of Next.js, React, TypeScript, and
ESLint have breaking changes. They require manual review and testing before merge.

### 27.5 Husky + lint-staged

```json
// package.json
"lint-staged": {
  "*.{ts,tsx,js,jsx,mjs}": "eslint --max-warnings=0"
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

**Why `--max-warnings=0`?** Zero warnings enforced. A warning today becomes an
error tomorrow. Enforcing zero warnings keeps the codebase clean.

**Why only staged files?** Linting the entire codebase on every commit is slow.
Linting only staged files is fast and catches issues before they reach the remote.

---

## 28. Environment Variable Management — Centralized & Safe

### 28.1 The Two-File Pattern

**Server-only:** `src/lib/env.ts` — 50+ env vars, NEVER imported by client code
**Client-safe:** `src/lib/env.public.ts` — 4 env vars, safe for client bundles

**Why split?** `NEXT_PUBLIC_` prefix exposes env vars to the client bundle. If you
accidentally put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` var, it's
extractable from the browser. The split makes it clear which vars are safe.

### 28.2 The Golden Rule

**NEVER use `process.env` directly in any file other than `env.ts` or `env.public.ts`.**

```typescript
// WRONG — scattered, untraceable, might be client-exposed
const apiKey = process.env.RETELL_API_KEY;

// CORRECT — centralized, type-safe, clearly server-only
import { env } from '@/lib/env';
const apiKey = env.retellApiKey;
```

### 28.3 The 50+ Required Env Vars

Categories:
- **Supabase:** URL, anon key, service role key
- **Retell:** API key, webhook secret, demo agent ID
- **Twilio:** account SID, auth token, API key, from numbers, A2P brand/bundle
- **Stripe:** secret key, restricted key, webhook secret, recovery code
- **Email (Resend):** API key, from addresses (admin, leads, safety, notifications)
- **LLM:** OpenRouter API key + model, Anthropic HIPAA key
- **Voice:** ElevenLabs API key + webhook secret, Dograh API URL/key/secret
- **Calendar:** Cronofy client ID/secret, SDK identifier, token encryption key
- **Google:** Places API key, Maps API key, OAuth client ID/secret/refresh token
- **Other:** CRON_SECRET, APP_URL, admin email/phone, Mapbox token, Firecrawl key

---

## 29. The SaaS Starter Kit Checklist

Everything you need for a new SaaS, based on what was built in RingProof:

### 29.1 Must-Have Before Launch

- [ ] **Centralized env vars** (`env.ts` + `env.public.ts`)
- [ ] **Proxy/middleware** (CSP nonces, route protection, security headers)
- [ ] **Database schema** (idempotent, RLS on every table, policies)
- [ ] **Auth system** (separate admin vs user vs sales agent)
- [ ] **Rate limiting** (auth endpoints, form submissions, API routes)
- [ ] **Input validation** (UUID, email, phone, HTML escape)
- [ ] **Error logging** (DB-backed, PHI scrubbing, allowed context keys)
- [ ] **Stripe integration** (server-side pricing, webhook signatures, idempotency)
- [ ] **Email service** (unique subjects, templated, rate-limited)
- [ ] **CI/CD** (lint + typecheck on push, cron workflows for scheduled jobs)
- [ ] **Pre-commit hooks** (husky + lint-staged, zero warnings)
- [ ] **Dependabot** (weekly, grouped, major versions blocked)
- [ ] **Security headers** (HSTS, X-Frame-Options, CSP, COOP, COEP)
- [ ] **PWA manifest** (static + dynamic per-user)
- [ ] **SEO** (metadata, sitemap, robots.txt, JSON-LD, OG images)
- [ ] **Bot protection** (CAPTCHA on public forms, rate limiting)
- [ ] **Mobile responsiveness** (320/375/414/768px verified, touch targets)

### 29.2 Must-Have for Multi-Portal SaaS

- [ ] **Separate auth systems** (admin vs client vs sales agent)
- [ ] **Separate cookies** (`__Host-` prefix in production)
- [ ] **Route groups** (`(app)/`, `(portal)/` for shared layouts)
- [ ] **Provider abstraction** (if integrating multiple third-party services)
- [ ] **DB-save-first pattern** (external sync is best-effort)
- [ ] **Gate-based completeness logic** (whitelist, not blacklist)
- [ ] **Single source of truth** for business logic (no duplication)
- [ ] **Idempotent webhooks** (check before insert, unique constraints)

### 29.3 Must-Have for AI Voice SaaS

- [ ] **Provider abstraction** (Retell, ElevenLabs, future providers)
- [ ] **Spam detection** (transcript patterns + AI outcome + auto-blacklist)
- [ ] **Call logging** (idempotent, provider-aware)
- [ ] **Prompt builder** (single source of truth, no hyphens in TTS text)
- [ ] **Test call path** (excluded from metrics/billing)
- [ ] **Phone number pool** (reuse, don't release)
- [ ] **Calendar abstraction** (Cal.com + Cronofy)
- [ ] **Voicemail handling** (ffmpeg conversion for Twilio)

### 29.4 The Pre-Coding Ritual (Every Project)

1. Install **Hallmark** → `.devin/skills/hallmark/`
2. Install **Vibe-Security** → `.devin/skills/vibe-security/`
3. Install **Agent-Reach** → `~/.agents/skills/agent-reach/`
4. Invoke Hallmark before any UI work
5. Invoke Vibe-Security before any auth/payment/database code
6. Use Agent-Reach for any competitive research

---

*This document is maintained alongside the codebase. When you add a new pattern,
technique, or lesson, document it here so future AI coders can learn from it.
The audit never ends — every session adds new lessons.*

---

## 30. Rate Limiting — The Complete Method

Rate limiting is the most under-appreciated security control in SaaS. Without it,
every public endpoint is an open wallet for attackers to drain your AI API budget,
flood your SMS provider, brute-force your login, or enumerate your referral codes.
This section documents every rate limiting pattern in RingProof — 80+ endpoints,
4 specialized systems, and the lessons learned from getting it wrong.

### 30.1 The Core Utility — `src/lib/rateLimit.ts`

**Algorithm:** Fixed Window (in-memory Map)

**Storage:** In-memory `Map<string, Map<string, RateLimitEntry>>`

**Keying:** Namespace (e.g. `'sales-login'`) + IP address

```typescript
export function checkRateLimit(
  namespace: string,
  ip: string,
  maxRequests: number,
  windowMs: number
): boolean {
  let map = rateLimitMaps.get(namespace);
  if (!map) { map = new Map(); rateLimitMaps.set(namespace, map); }
  const key = `${namespace}:${ip}`;
  const now = Date.now();
  const entry = map.get(key);
  if (entry && now < entry.resetAt) {
    if (entry.count >= maxRequests) return false;
    entry.count++;
  } else {
    map.set(key, { count: 1, resetAt: now + windowMs });
  }
  return true;
}
```

**IP Extraction (security-critical):**

The utility uses `getClientIp()` which extracts IP **securely**:
- Prioritizes `x-vercel-ip` and `x-real-ip` (set by infrastructure, not spoofable)
- Uses the **LAST** value in `X-Forwarded-For` (not first — the first is client-controlled)
- Falls back to `x-forwarded-for` last entry, then connection remote address

**Why LAST not FIRST in X-Forwarded-For:**
The `X-Forwarded-For` header is a chain: `client, proxy1, proxy2`. The client
controls the first value (they can inject anything). The LAST value is set by
your own infrastructure (Vercel's load balancer), which you trust. Using the
first value means an attacker can rotate the header to bypass rate limits.

**Cleanup:** Expired entries pruned every 5 minutes via `setInterval`.

**The Cold Start Problem (HIGH severity):**

In-memory storage resets on serverless cold starts. Vercel may spin up a new
instance for each request, meaning each instance has its own rate limit state.
Attackers can bypass by:
1. Waiting for cold start (fresh counters)
2. Rotating IPs across instances
3. Hitting during deployment events (all instances restart)

**Migration path:** Move to Vercel KV (Redis) or Upstash for multi-instance safety.
The code has TODO comments acknowledging this. For now, the in-memory approach
is "good enough" because:
- Most attacks are single-IP brute force (caught by any instance)
- Auth endpoints have additional DB-backed lockout (see 30.3)
- AI usage caps are DB-backed (not affected by cold start)

### 30.2 The Endpoint Coverage Map

Every API route should be categorized by its rate limiting needs:

| Category | Rate Limit? | Keying | Example Limits |
|----------|-------------|--------|----------------|
| Auth endpoints | YES (critical) | IP | 5/15min |
| Public AI endpoints | YES (cost) | IP | 15/60s |
| Public form submissions | YES (spam) | IP | 5/min |
| Token-authenticated portals | YES (abuse) | IP | 10-20/min |
| Admin expensive ops | YES (resource) | IP or user | 5-20/hour |
| Webhook endpoints | NO (signature) | N/A | Signature verification |
| Cron endpoints | NO (secret) | N/A | CRON_SECRET Bearer |
| Health checks | NO | N/A | Low risk |

### 30.3 Auth Endpoint Rate Limiting (Brute Force Protection)

**Sales Agent Login** — `src/app/sales/api/login/route.ts`
- **Limit:** 5 attempts per 15 minutes per IP
- **On hit:** 429 "Too many login attempts. Please try again in 15 minutes."
- **Timing attack protection:** Always runs bcrypt.compare even for non-existent
  accounts (constant-work dummy comparison)

**Password Reset** — `src/app/sales/api/reset-password/route.ts`
- **Limit:** 5 attempts per hour per IP
- **On hit:** 429 "Too many reset attempts. Please try again later."

**Forgot Password** — `src/app/sales/api/forgot-password/route.ts`
- **Limit:** 3 requests per hour per IP
- **Enumeration protection:** Returns success even if email doesn't exist

**Portal Session Exchange** — `src/app/crm/api/portal/exchange-session/route.ts`
- **Limit:** 10 exchanges per minute per IP
- **Additional:** DB-backed lockout (configurable max attempts + lockout minutes)
- **Trusted-IP grace:** 30-minute signed cookie after successful password auth

**The DB-backed lockout pattern (defense in depth):**

In-memory rate limiting resets on cold start. For auth endpoints, add a DB-backed
lockout as a second layer:

```typescript
// Check DB lockout first (survives cold starts)
const { data: lockout } = await supabase
  .from('portal_auth')
  .select('failed_attempts, locked_until')
  .eq('client_id', client.id)
  .single();

if (lockout?.locked_until && new Date(lockout.locked_until) > new Date()) {
  return 429; // Still locked
}

// Then check in-memory rate limit (fast path)
if (!checkRateLimit('portal-exchange', ip, 10, 60_000)) {
  return 429;
}
```

### 30.4 Public Endpoint Rate Limiting (Cost & Spam Protection)

**Demo Call** — `src/app/api/demo-call/route.ts`
- **Limit:** 1 call per 5 minutes per IP (custom inline implementation)
- **Additional:** Blocks toll-free (800, 888) and premium (900) numbers
- **Why so strict:** Each demo call costs real money (Twilio + Retell)

**Landing Chat** — `src/app/api/landing-chat/route.ts`
- **Limit:** 15 messages per 60 seconds per IP
- **Additional:** Caps message length (1000 chars) and history (12 messages)
- **Why:** AI chat costs per token — unlimited = unlimited cost

**Lead Submission** — `src/app/crm/api/leads/submit/route.ts`
- **Limit:** 5 submissions per minute per IP
- **Why:** Public form, no auth, could be spammed

**Audit Signup** — `src/app/crm/api/audit/signup/route.ts`
- **Limit:** 3 signups per hour per IP
- **Why:** Creates DB records + triggers audit process

**Referral Code Validation** — `src/app/crm/api/onboarding/validate-referral/route.ts`
- **Limit:** 10 validations per minute per IP
- **Why brute-force matters:** 5-digit codes have only 10,000 combinations.
  Without rate limiting, an attacker could enumerate all codes in minutes.

### 30.5 The AI Usage Cap System (DB-Backed, Not Rate Limiting)

**File:** `src/lib/aiUsageCap.ts`

This is NOT rate limiting — it's a **monthly spending cap** per client. Different
problem, different solution.

**How it works:**
1. Checks `client_ai_usage.estimated_cost_cents` for current calendar month
2. Compares against cap (default $50/month, overridable per client)
3. Returns `{ allowed, estimatedCostCents, capCents, remainingCents }`

**Why DB-backed (not in-memory):**
- Must survive cold starts (it's a budget, not a throttle)
- Must be accurate across instances
- Must be auditable

**Integration points:**
- Portal AI chat (`/crm/api/portal/chat`)
- Agent data AI scanning (`/crm/api/portal/agent-data`)

**On cap hit:** 429 "AI usage budget exceeded for this billing period."

### 30.6 SMS Rate Limiting (Per-Client, Not Per-IP)

**File:** `src/lib/smsNotifications.ts`

SMS rate limiting is keyed by **client ID**, not IP — because SMS is triggered
by incoming calls (webhook), not by the client's browser.

**Limits:**
- 20 SMS per hour per client
- 100 SMS per day per client

**Storage:** In-memory `Map<string, number[]>` (timestamps)

**The cold start problem here is worse:** SMS sends are triggered by webhooks,
which can fire in rapid succession. If counters reset, a burst of calls could
send 100+ SMS before the counter rebuilds.

**TODO in code:** "persist rate-limit counters to DB for multi-instance safety."

### 30.7 Calendar Call-ID Rate Limiting (Anti-Enumeration)

**File:** `src/app/crm/api/calendar/check-availability/route.ts`

This is a unique pattern: rate limiting by **call_id**, not IP.

**Limit:** 3 availability checks per call_id per 10 minutes

**Why:** During a call, the AI agent can call `check-availability` multiple
times. Without limiting, a prompt-injected agent could enumerate the entire
schedule by requesting every day. The call_id is tied to a specific phone call,
so this limits how much schedule data any single call can extract.

**Implementation:** Custom inline (not shared utility) because the keying is
different (call_id, not IP).

### 30.8 Webhook Endpoints — Signature Verification, Not Rate Limiting

Webhook endpoints (Retell, Stripe, ElevenLabs) do NOT use rate limiting. Instead:

1. **Signature verification** — cryptographic proof the request is from the
   claimed sender (HMAC-SHA256 for Retell/ElevenLabs, Stripe SDK for Stripe)
2. **Idempotency guards** — unique constraints on `(event_type, call_id)` or
   `stripe_event_id` prevent duplicate processing
3. **Replay attack prevention** — timestamp tolerance (5 minutes for Stripe/Retell)

**Why not rate limit webhooks:**
- The sender is verified cryptographically (not anonymous like public endpoints)
- Stripe retries failed webhooks for up to 72 hours — rate limiting would block
  legitimate retries
- The threat model is different: not "too many requests" but "forged requests"

### 30.9 The Spam Shield System (Content Analysis, Not Rate Limiting)

**File:** `src/lib/spamShield.ts`

Spam Shield is NOT rate limiting — it's **content-based detection** of spam
calls from the transcript and call analysis.

**3 Layers of Detection:**

1. **Transcript Pattern Matching** — Scans for known spam phrases:
   - "google listing", "lower your insurance", "solar panels"
   - Robotic greetings: "this is an automated message", "do not hang up"
   - Long pause detection: 3+ consecutive ellipsis groups

2. **AI Signal** — Checks if Retell classified the call as `not_genuine`

3. **Decision Logic:**
   - 2+ transcript signals → spam
   - 1 transcript signal + AI `not_genuine` → spam
   - AI `not_genuine` alone (PHI clients with no transcript) → spam
   - Single transcript keyword alone → NOT spam (too many false positives)

**When spam detected:**
- `estimated_value_cents = 0`
- SMS notification skipped
- Email notification skipped
- Caller auto-added to bypass list

**Integration:** Called in Retell webhook during `call_analyzed` event processing.

### 30.10 ClawCaptcha (Bot Protection, Not Rate Limiting)

**File:** `src/app/crm/onboard/[token]/ClawCaptchaGate.tsx`

ClawCaptcha is a gamified CAPTCHA — a claw machine mini-game that the user must
play to prove they're human.

**How it works:**
1. Shows claw machine game (playcaptcha library)
2. User must grab the correct toy
3. After success, offers "Remember me for 24 hours"
4. Remember state stored in `localStorage` with timestamp

**Tamper risk (MEDIUM):** Client-side localStorage can be:
- Cleared by user
- Spoofed by modifying localStorage
- Bypassed in private browsing

**Mitigation:** The captcha gates the onboarding form, but the real auth
(onboarding_token in URL) is still server-validated. The captcha prevents
automated form submission, not authenticated access.

### 30.11 Rate Limiting Anti-Patterns (What NOT to Do)

**1. Using the FIRST value in X-Forwarded-For**
```typescript
// WRONG — client can inject any value
const ip = req.headers.get('x-forwarded-for')?.split(',')[0];

// RIGHT — use last value (set by your infrastructure)
const ip = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
```

**2. Client-side rate limiting as the only control**
```typescript
// WRONG — client can bypass by modifying the JS
if (attempts > 5) { alert('Too many attempts'); return; }

// RIGHT — server-side rate limiting, client-side is just UX
if (!checkRateLimit('login', ip, 5, 15 * 60_000)) {
  return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
}
```

**3. Rate limiting by user ID for public endpoints**
```typescript
// WRONG — public endpoints don't have a user ID yet
if (!checkRateLimit('signup', userId, 3, 3600_000)) { ... }

// RIGHT — use IP for public, user ID for authenticated
if (!checkRateLimit('signup', ip, 3, 3600_000)) { ... }
```

**4. Not rate limiting expensive admin operations**
Admin endpoints that trigger external API calls (Stripe sync, Retell publish,
prompt rebuild) MUST be rate limited. An admin account compromise should not
allow resource exhaustion.

**5. Custom inline implementations instead of shared utility**
4 endpoints have custom inline rate limiting instead of using `checkRateLimit()`:
- `src/app/sales/api/invitations/[token]/route.ts`
- `src/app/api/demo-call/route.ts`
- `src/app/crm/api/calendar/check-availability/route.ts`
- `src/lib/smsNotifications.ts`

Always use the shared utility unless you have a specific reason (like call_id
keying in the calendar route).

### 30.12 The Rate Limiting Checklist (For Every New Endpoint)

Before merging any new API route, answer these:

- [ ] Is this endpoint public (no auth)? → Rate limit by IP
- [ ] Is this endpoint auth-related (login, reset, OTP)? → Rate limit by IP + DB lockout
- [ ] Does this endpoint call an AI API? → Rate limit by IP + AI usage cap
- [ ] Does this endpoint send SMS/email? → Rate limit by client ID
- [ ] Does this endpoint trigger external API calls (Stripe, Retell)? → Rate limit by IP or user
- [ ] Is this a webhook endpoint? → Signature verification (not rate limiting)
- [ ] Is this a cron endpoint? → CRON_SECRET Bearer (not rate limiting)
- [ ] Did you use the shared `checkRateLimit()` utility? (Not custom inline)
- [ ] Did you use the correct IP extraction (last in X-Forwarded-For)?
- [ ] Is the 429 response message user-friendly?

### 30.13 Complete Rate Limit Reference Table

| Endpoint | Limit | Window | Key | Storage |
|----------|-------|--------|-----|---------|
| Sales login | 5 | 15min | IP | In-memory |
| CRM sales-login fallback | 5 | 15min | IP | In-memory |
| Password reset | 5 | 1hour | IP | In-memory |
| Forgot password | 3 | 1hour | IP | In-memory |
| Invitation accept | 10 | 1min | IP | In-memory (custom) |
| Demo call | 1 | 5min | IP | In-memory (custom) |
| Landing chat | 15 | 60s | IP | In-memory |
| Lead submit | 5 | 1min | IP | In-memory |
| Audit signup | 3 | 1hour | IP | In-memory |
| Audit convert | 5 | 1hour | IP | In-memory |
| Onboarding initiate | 10 | 1hour | User ID | In-memory |
| Onboarding resend SMS | 5 | 10min | IP | In-memory + DB cap |
| Onboarding chat | 10 | 1min | IP | In-memory |
| Onboarding scrape website | 5 | 1hour | IP | In-memory + DB cap |
| Onboarding save KB | 5 | 1min | IP | In-memory |
| Onboarding verify forwarding | 5 | 10min | IP | In-memory + DB lockout |
| Onboarding places autocomplete | 30 | 1min | IP | In-memory |
| Onboarding places details | 30 | 1min | IP | In-memory |
| Onboarding validate referral | 10 | 1min | IP | In-memory |
| Onboarding apply promo | 10 | 1min | IP | In-memory |
| Onboarding create checkout | 5 | 1hour | IP | In-memory |
| Onboarding provisioning status | 60 | 1min | IP | In-memory |
| Onboarding provision telephony | 5 | 1hour | User ID | In-memory |
| Onboarding complete | 5 | 1hour | User ID | In-memory |
| Portal chat | 10 | 1min | IP | In-memory + AI cap |
| Portal test call | 5 | 1min | IP | In-memory |
| Portal exchange session | 10 | 1min | IP | In-memory + DB lockout |
| Portal billing | 10 | 1min | IP | In-memory |
| Portal settings | 10 | 1min | IP | In-memory |
| Portal contacts (GET) | 20 | 1min | IP | In-memory |
| Portal contacts (POST/DELETE) | 10 | 1min | IP | In-memory |
| Portal calls | 20 | 1min | IP | In-memory |
| Portal voicemail greeting | 5 | 1min | IP | In-memory |
| Portal agent data | 10 | 1min | IP | In-memory + AI cap |
| Portal agent data upload | 5 | 1min | IP | In-memory |
| Portal growth settings | 10 | 1min | IP | In-memory |
| Portal on-call schedule | 10 | 1min | IP | In-memory |
| Portal on-call staff | 10 | 1min | IP | In-memory |
| Calendar check availability | 3 | 10min | Call ID | In-memory (custom) |
| Calendar book appointment | 30 | 1min | IP | In-memory |
| Calendar cancel | 10 | 1min | IP | In-memory |
| Calendar reschedule | 10 | 1min | IP | In-memory |
| Admin AI generate prompt | 10 | 1hour | IP | In-memory |
| Admin update prompt | 20 | 1hour | IP | In-memory |
| Admin diagnose agent | 20 | 1hour | IP | In-memory |
| Admin rebuild all prompts | 1 | 1hour | IP | In-memory |
| Admin backfill webhook | 5 | 1hour | IP | In-memory |
| Admin growth settings | 10 | 1min | IP | In-memory |
| Admin update details | 10 | 1min | IP | In-memory |
| Admin calendar settings | 10 | 1min | IP | In-memory |
| Admin client addons | 10 | 1min | IP | In-memory |
| Sales leads | 60 | 1hour | IP | In-memory |
| Sales check phone | 100 | 1hour | IP | In-memory |
| Sales settings | 10 | 1min | IP | In-memory |
| Webhook test | 10 | 1min | IP | In-memory |
| Webhook replay | 10 | 1min | IP | In-memory |
| Cronofy authorize | 10 | 1min | IP | In-memory |
| Cronofy disconnect | 10 | 1min | IP | In-memory |
| Client rotate token | 10 | 1min | IP | In-memory |
| Client migrate provider | 5 | 1hour | IP | In-memory |
| Client hard delete | 5 | 1hour | IP | In-memory |
| SMS notifications | 20/hr, 100/day | rolling | Client ID | In-memory |

---

## 31. Authentication & Session Security — Deep Dive

RingProof has **5 distinct authentication systems**. Getting any of them wrong
means exposing client data, payment flows, or admin access. This section
documents every system, the security patterns, and the vulnerabilities found.

### 31.1 The 5 Authentication Systems

| System | Auth Method | Cookie | Used By |
|--------|-------------|--------|---------|
| Admin | Supabase Auth + role check | `sb-*` | CRM admin pages |
| Portal session | Custom SHA-256 hashed token | `__Host-portal_session` | Client portal |
| Onboarding token | UUID in URL | None | Onboarding wizard |
| Sales agent | Custom SHA-256 hashed token | `__Host-sales_agent_session` | Sales portal |
| Webhook | HMAC signature | None | Retell/Stripe/ElevenLabs |

Plus cron endpoints use `CRON_SECRET` Bearer token (not a session system).

### 31.2 Admin Authentication

**Middleware:** `src/proxy.ts` (Next.js 16 renames `middleware.ts` to `proxy.ts`)

**How it works:**
1. Supabase session cookie refresh on every request
2. Route protection — redirects unauthenticated users to `/crm/login`
3. Geo-location change re-authentication (signs out if location changes)

**Admin role check:**
```typescript
async function requireAdmin() {
  const supabaseServer = await getSupabaseServer();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return { error: 401 };
  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile } = await supabaseAdmin
    .from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 403 };
  return { supabaseAdmin };
}
```

**The DB function:** `is_admin()` in schema.sql
```sql
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from user_profiles
    where id = auth.uid() and role = 'admin');
$$;
```

**Geo-location re-authentication:**
- Detects city/region/country changes via Vercel geo headers
- Signs user out server-side if location changes
- Clears geo cookie, redirects to login with `reason=location_change`
- Prevents session hijacking from a different location

**Cookie flags:**
- `httpOnly: true` — JS can't read the cookie (prevents XSS theft)
- `secure: true` (production) — only sent over HTTPS
- `sameSite: 'lax'` — allows CSRF on GET (see vulnerability below)
- `path: '/'`

**VULNERABILITY: `sameSite: 'lax'` on admin cookies**

`lax` allows CSRF attacks on GET requests. A malicious site could embed
`<img src="https://getringproof.com/crm/api/admin/delete-all">` and the cookie
would be sent. **Recommendation:** Upgrade to `sameSite: 'strict'` for admin routes.

### 31.3 Portal Session Authentication

**File:** `src/lib/portalSession.ts`

This is a **custom session system** (not Supabase Auth) for client portals.

**Security features:**
1. **SHA-256 hashing** — tokens are hashed before DB storage (DB compromise
   doesn't expose live sessions)
2. **Timing-safe comparison** — `crypto.timingSafeEqual` prevents timing attacks
3. **`__Host-` prefix** (production) — enforces Secure, Path=/, no Domain
4. **30-day expiry** with activity-based renewal
5. **Revocation** via `revoked` flag
6. **Client status check** — deleted/churned clients rejected

**Session exchange flow (token → session):**
```
User visits /crm/report/[token]
  → Server validates report_token in DB
  → If password-protected: show password gate
  → User enters password → bcrypt.compare (constant-work)
  → Create portal_session (SHA-256 hashed token)
  → Set __Host-portal_session cookie (sameSite: strict)
  → Subsequent requests: verifyPortalSession()
```

**The trusted-IP grace cookie:**

After successful password auth, a 30-minute grace cookie is set so the user
doesn't re-enter the password on every page. The cookie is HMAC-signed and
includes an IP hash:

```typescript
// Cookie format: <ipHash>.<timestamp>.<hmac>
function signGrant(ipHash: string, timestamp: number): string {
  const data = `${ipHash}.${timestamp}`;
  const hmac = createHmac('sha256', getHmacSecret()).update(data).digest('hex');
  return `${data}.${hmac}`;
}
```

**Session renewal via `after()`:**
```typescript
after(async () => {
  await supabase.from('portal_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id);
});
```
This updates `last_used_at` AFTER the response is sent, so it doesn't add latency.

**VULNERABILITY: No report_token expiration**

`report_token` values are valid indefinitely until manually rotated. If a token
leaks (e.g., in a forwarded email), it's valid forever. **Recommendation:** Add
`report_token_expires_at` column.

### 31.4 Onboarding Token Authentication

**Token generation:** `crypto.randomUUID()` with 15-day expiry

**Validation pattern (used in every onboarding route):**
```typescript
const { data: clientRow } = await supabase
  .from('clients')
  .select('id, status, onboarding_token_terminated_at, onboarding_token_expires_at')
  .eq('onboarding_token', token)
  .maybeSingle();

if (!clientRow) return 401;
if (clientRow.onboarding_token_expires_at < new Date()) return 403;
if (clientRow.onboarding_token_terminated_at) return 403;
```

**Token termination:** After onboarding completes, `onboarding_token_terminated_at`
is set, preventing reuse. The token must also be paid and have forwarding confirmed
before termination is allowed.

### 31.5 Sales Agent Authentication

**File:** `src/lib/salesAgentSession.ts`

Parallel to portal sessions but for sales agents (who are NOT Supabase Auth users):

- SHA-256 hashed tokens
- 30-day expiry
- `__Host-sales_agent_session` cookie (production)
- Uses service-role client (sales_agents table has no RLS for anon key)
- Session includes `parent_agent_id` for hierarchy-based auth

**Login flow:**
1. Rate limited: 5 attempts per 15 minutes per IP
2. Timing-safe password comparison
3. Constant-work bcrypt for non-existent accounts (prevents enumeration)
4. Status check (active/suspended/pending)

**VULNERABILITY: Login endpoint is fully public**

`/sales/api/login` has no additional auth beyond rate limiting. Consider adding
a shared secret or IP whitelist for the sales portal.

### 31.6 Webhook Signature Verification

**Stripe webhooks** — `src/app/crm/api/webhooks/stripe/route.ts`
```typescript
const event = stripe.webhooks.constructEvent(
  rawBody, signature, webhookSecret, 300 // 5-min tolerance
);
```
- Uses raw body (not parsed JSON) — critical for signature validity
- 5-minute tolerance for replay attack prevention
- Test-mode guard: rejects test events on live key

**Retell webhooks** — `src/lib/retellVerify.ts`
```typescript
// Format: v=timestamp,d=digest
// HMAC-SHA256(rawBody + timestamp, secret)
// Clock skew: 5 minutes max
// Timing-safe comparison
```
- Dual secret support (tries `RETELL_API_KEY` then `RETELL_WEBHOOK_SECRET`)
- Rejects if secret contains placeholder text

**ElevenLabs webhooks** — Same HMAC pattern with `ELEVENLABS_WEBHOOK_SECRET`

### 31.7 Cron Endpoint Authentication

**File:** `src/lib/cronAuth.ts`

```typescript
export function verifyCronAuth(authHeader: string | null, isVercelCron = false): boolean {
  const cronSecret = env.cronSecret;
  if (cronSecret && authHeader) {
    const expected = `Bearer ${cronSecret}`;
    if (authHeader.length === expected.length) {
      try {
        return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
      } catch { return false; }
    }
  }
  // Dev-only bypass
  if (!cronSecret && isVercelCron && !env.isProduction) return true;
  return false;
}
```

**GitHub Actions pattern:**
```yaml
env:
  APP_URL: ${{ secrets.APP_URL }}
  CRON_SECRET: ${{ secrets.CRON_SECRET }}
run: |
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/crm/api/cron/..."
```

### 31.8 API Route Protection Patterns (Categorization)

Every route.ts falls into one of these categories:

| Pattern | Auth Method | Example Routes |
|---------|-------------|----------------|
| Admin auth | Supabase Auth + role check | `/crm/api/clients/*`, `/crm/api/admin/*` |
| Portal session | `verifyPortalSession()` | `/crm/api/portal/*` |
| Onboarding token | Token in request | `/crm/api/onboarding/*` |
| Webhook signature | HMAC verification | `/crm/api/webhooks/*` |
| Cron secret | Bearer token | `/crm/api/cron/*`, `/crm/api/jobs/*` |
| Dual auth | Admin OR portal session | `/crm/api/calendar/owner-block-time` |
| Public | No auth | `/crm/api/leads/submit`, `/sales/api/login` |

**Dual auth pattern (prevents IDOR):**
```typescript
// Path 1: Try admin auth
try {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (user) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles').select('role').eq('id', user.id).single();
    if (profile?.role === 'admin') isAdmin = true;
  }
} catch { /* continue */ }

// Path 2: Try portal session
if (!isAdmin) {
  const session = await verifyPortalSession(req.headers.get('cookie'));
  portalClientId = session.clientId;
  if (!portalClientId) return 401;
}

// Force client_id to match session (prevents IDOR)
const effectiveClientId = isAdmin ? client_id : portalClientId;
```

### 31.9 Cookie Security Summary

| System | Cookie Name (Prod) | httpOnly | secure | sameSite | maxAge |
|--------|-------------------|----------|--------|----------|--------|
| Admin | `sb-*` | true | true | lax | - |
| Portal | `__Host-portal_session` | true | true | strict | 30 days |
| Sales | `__Host-sales_agent_session` | true | true | strict | 30 days |
| Portal grace | `__Host-portal_auth_grant` | true | true | strict | 30 min |

**The `__Host-` prefix** is a browser security feature that enforces:
- `Secure=true` (HTTPS only)
- `Path=/`
- No `Domain` attribute (can't be set for subdomains)
- Prevents subdomain cookie injection attacks

### 31.10 Secret Masking in API Responses

**Pattern:** Return only first 8 characters as `signing_secret_prefix`

```typescript
// Webhook endpoint save
return NextResponse.json({
  success: true,
  signing_secret_prefix: secret.slice(0, 8)
});

// Webhook endpoint list
const maskedEndpoints = endpoints.map((e) => {
  const { signing_secret, ...rest } = e;
  return { ...rest, signing_secret_prefix: signing_secret?.slice(0, 8) || '' };
});
```

**Rule:** Any API route authenticated by a client-facing token (report_token,
onboarding_token, portal_session) MUST NOT return raw secrets in JSON responses.

### 31.11 Session Security Vulnerabilities Found

1. **`sameSite: 'lax'` on admin cookies** — CSRF on GET. Fix: `'strict'`
2. **No report_token expiration** — tokens valid forever. Fix: add expiry column
3. **Sales agent login is fully public** — no shared secret. Fix: add IP whitelist
4. **No session fixation prevention** — session IDs not regenerated on login
5. **No CSRF tokens** — relies on SameSite cookies only
6. **No IP binding to sessions** — can't detect session hijacking across IPs
7. **No session inactivity timeout** — 30-day hard expiry only

### 31.12 The Auth Security Checklist

- [ ] All cookies use `httpOnly: true`
- [ ] All production cookies use `secure: true`
- [ ] All production cookies use `__Host-` prefix where possible
- [ ] Session tokens are hashed (SHA-256) before DB storage
- [ ] Token comparison uses `crypto.timingSafeEqual` (not `===`)
- [ ] Auth endpoints have rate limiting + DB-backed lockout
- [ ] Login runs constant-work bcrypt for non-existent accounts
- [ ] Webhook signatures use raw body (not parsed JSON)
- [ ] Webhook signatures have timestamp tolerance (replay prevention)
- [ ] Secrets are masked in API responses (first 8 chars only)
- [ ] No service role key in client components or NEXT_PUBLIC_ env vars
- [ ] Dual-auth routes force client_id to match session (prevent IDOR)

---

## 32. Database Security & RLS — The Complete Method

The database is the crown jewels. Every client record, call transcript, payment
ID, and API key lives here. This section documents the complete RLS strategy,
the service role usage audit, and the patterns that keep data safe.

### 32.1 Schema Overview

**File:** `.sql/schema.sql` (~4,800 lines) — the SINGLE source of truth

**64 tables** organized by domain:
- Core: `user_profiles`, `clients`, `client_numbers`, `client_locations`
- Calls: `call_logs`, `agent_data_entries`, `client_ai_usage`
- Billing: `billing_events`, `addon_catalog`, `client_addons`, `discount_codes`
- Calendar: `client_calendar_settings`, `calendar_slots`, `calendar_owner_blocks`
- Auth: `portal_sessions`, `portal_auth`, `sales_agent_sessions`
- Sales: `sales_agents`, `sales_agent_leads`, `sales_agent_commission_payments`
- Logging: `activity_log`, `error_logs`, `email_logs`
- Onboarding: `onboarding_chats`, `audit_sessions`

### 32.2 RLS Strategy — Every Table Protected

**All 64 tables have RLS enabled.** No table has RLS without policies (which
would make it invisible to non-service-role clients).

**The `is_admin()` function:**
```sql
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from user_profiles
    where id = auth.uid() and role = 'admin');
$$;
```

**Helper functions:**
- `is_admin()` — checks `user_profiles.role = 'admin'`
- `is_active_worker()` — checks for active worker role
- `is_authenticated()` — checks if user is logged in
- `get_rls_audit()` — returns RLS status for all tables (admin-only)

**Policy categories:**

| Category | Pattern | Used For |
|----------|---------|----------|
| Admin-only | `using (is_admin()) with check (is_admin())` | 60+ tables |
| Public read | `using (true)` | `addon_catalog` only |
| Worker read | `using (assigned_worker_id = auth.uid())` | `clients`, `call_logs`, etc. |
| Service-role-only | `using (auth.role() = 'service_role')` | `review_requests`, `no_show_events` |

**Worker policies (read-only, assignment-based):**
- Workers can SELECT assigned clients (via `assigned_worker_id`)
- Workers can UPDATE only specific columns (defense-in-depth GRANTs)
- Example: `user_profiles` — workers can only UPDATE `full_name`, `worker_label`

**Column-level GRANTs (defense in depth):**
```sql
-- Workers can only update these columns on clients
grant update (business_name, owner_name, owner_phone, email,
  business_address, business_city, business_state, business_zip,
  trade_type, pronunciation_overrides, sms_notification_prefs)
on clients to authenticated;
```

### 32.3 Supabase Client Creation

**Two clients, two purposes:**

```typescript
// getSupabaseServer() — RLS-respecting (anon key + cookies)
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() { /*...*/ } },
    cookieOptions: { secure: env.isProduction, httpOnly: true, sameSite: 'lax', path: '/' },
  });
}

// getSupabaseAdmin() — bypasses RLS (service role key)
export function getSupabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

**When to use which:**
- `getSupabaseServer()` — Server Components, API routes with user session
- `getSupabaseAdmin()` — Webhooks, cron jobs, portal routes (token-authed),
  admin routes (after role check), service-to-service operations

### 32.4 Service Role Key Audit (CRITICAL)

**The service role key bypasses ALL RLS.** If it leaks, every row is exposed.

**Audit results:**
- NOT in any client component (no `'use client'` files use it)
- NOT in any `NEXT_PUBLIC_` env var
- NOT returned in any API response
- Used legitimately in 200+ server-side files

**The env var:**
```typescript
// src/lib/env.ts
supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // NO NEXT_PUBLIC_ prefix
```

**Rule:** NEVER prefix the service role key with `NEXT_PUBLIC_`. Any env var
with that prefix is bundled into the client JavaScript and visible to anyone
who opens browser dev tools.

### 32.5 The DB Trigger Pattern (Contract Before Payment)

```sql
create or replace function guard_contract_before_payment()
returns trigger as $$
begin
  if NEW.status in ('trial', 'active', 'churned', 'paused')
     and NEW.contract_signed is not true then
    raise exception 'Cannot mark client as trial/active without a signed contract. Client ID: %', NEW.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_guard_contract_before_payment
  before update on clients
  for each row execute procedure guard_contract_before_payment();
```

**Defense in depth:**
1. Application-level: `canMarkAsPaid()` check in every API route
2. DB-level: Trigger blocks the write even if app code is bypassed

**Other triggers:**
- `handle_client_deletion_move_numbers` — moves phone numbers to reuse pool
- `handle_number_deletion_move_to_pool` — same for individual numbers
- `set_*_updated_at` — auto-update timestamps
- `prune_onboarding_chats` — cron-triggered cleanup

### 32.6 Idempotent Schema Pattern

The entire schema.sql is designed to be **run repeatedly** against any database:

```sql
-- Tables: CREATE IF NOT EXISTS
create table if not exists clients (...);

-- Columns: ALTER TABLE ADD COLUMN IF NOT EXISTS
alter table clients add column if not exists paid_at timestamptz;

-- Policies: DROP + CREATE
drop policy if exists "admin_all_clients" on clients;
create policy "admin_all_clients" on clients for all using (is_admin());

-- Seed data: ON CONFLICT
insert into settings (key, value) values (...) on conflict do nothing;
insert into addon_catalog (...) values (...) on conflict (slug) do update set ...;

-- Triggers: DROP + CREATE
drop trigger if exists trg_guard_contract_before_payment on clients;
create trigger trg_guard_contract_before_payment ...;
```

**The #1 migration pitfall:** Forgetting the ALTER TABLE. `CREATE TABLE IF NOT
EXISTS` does NOT add columns to an existing table. The ALTER section is what
updates existing databases. Forgetting it causes "Database Update Required" /
"Client Not Found" errors in production.

### 32.7 Sensitive Columns & Masking

| Table | Column | Protection |
|-------|--------|------------|
| `webhook_endpoints` | `signing_secret` | Masked to first 8 chars in API |
| `clients` | `cal_com_api_key` | Server-side only, never returned |
| `clients` | `cronofy_access_token_encrypted` | AES-256-GCM encrypted at rest |
| `clients` | `cronofy_refresh_token_encrypted` | AES-256-GCM encrypted at rest |
| `clients` | `report_token` | Intentionally public (URL auth) |
| `clients` | `onboarding_token` | Intentionally public (URL auth) |
| `portal_sessions` | `session_token` | SHA-256 hashed (not plaintext) |
| `sales_agent_sessions` | `session_token` | SHA-256 hashed (not plaintext) |
| `clients` | `stripe_customer_id` | Not a secret (visible in Stripe dashboard) |

**Encryption at rest:** `src/lib/crypto.ts` provides AES-256-GCM encryption
for OAuth tokens (Cronofy). Keys derived from `ENCRYPTION_KEY` env var.

### 32.8 TypeScript Types — Manual Maintenance

**File:** `src/lib/supabase/types/` (modular, not auto-generated)

```
types/
├── index.ts    — barrel export
├── user.ts     — user_profiles, sales_agents
├── billing.ts  — billing_events, discount_codes
├── addon.ts    — addon_catalog, client_addons
├── call.ts     — call_logs, client_ai_usage
├── calendar.ts — calendar_slots, client_calendar_settings
├── sales.ts    — sales_agent_leads, commission_payments
└── client.ts   — clients, client_numbers, client_locations
```

**Drift risk:** Types are manually maintained, not auto-generated via
`supabase gen types typescript`. If schema changes without updating types,
TypeScript won't catch the mismatch. **Recommendation:** Set up auto-generation
in CI.

### 32.9 Query Patterns

**Single-row fetch with error handling:**
```typescript
const { data: client, error } = await supabase
  .from('clients').select('id, business_name').eq('id', clientId).maybeSingle();
if (error) throw error;
if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

**Upsert with conflict resolution:**
```typescript
await supabase.from('client_addons').upsert({
  client_id: client.id, addon_slug: slug, status: 'active',
}, { onConflict: 'client_id,addon_slug' });
```

**Batch fetch with `.in()`:**
```typescript
const { data } = await supabase.from('addon_catalog')
  .select('*').in('slug', uniqueSlugs).eq('active', true);
```

### 32.10 The Database Security Checklist

- [ ] Every table has `ENABLE ROW LEVEL SECURITY`
- [ ] Every table has at least one policy (no RLS-without-policy holes)
- [ ] Service role key is NOT in any `NEXT_PUBLIC_` env var
- [ ] Service role key is NOT used in any client component
- [ ] Secrets are masked in API responses (first 8 chars)
- [ ] OAuth tokens are encrypted at rest (AES-256-GCM)
- [ ] Session tokens are hashed (SHA-256) before DB storage
- [ ] DB triggers enforce business rules as backstop (contract-before-payment)
- [ ] Schema is idempotent (CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS)
- [ ] New columns added to BOTH CREATE TABLE and ALTER TABLE sections
- [ ] TypeScript types match schema (or auto-generated)
- [ ] Column-level GRANTs restrict worker write access

---

## 33. Multi-Provider Voice Stack Architecture

RingProof supports 3 voice AI providers: Retell AI (primary), ElevenLabs
(secondary), and Dograh (self-hosted). The abstraction layer enables switching
providers without rewriting business logic. This section documents the complete
architecture.

### 33.1 The Three-Layer Architecture

```
┌─────────────────────────────────────────────┐
│         Provider-Agnostic Layer              │
│  src/lib/voice/provider.ts (interface)       │
│  src/lib/voice/types.ts (shared types)       │
│  src/lib/voice/callProcessor.ts (shared)     │
│  src/lib/promptBuilder/index.ts (prompts)    │
└──────────────┬──────────────────────────────┘
               │ getVoiceProvider(provider)
┌──────────────┴──────────────────────────────┐
│         Provider Adapter Layer               │
│  RetellVoiceProvider  │ ElevenLabsProvider   │
│  (thin adapter)       │ (full REST impl)     │
│                       │ DograhProvider       │
│                       │ (workflow-based)     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────┴──────────────────────────────┐
│         SDK / API Layer                      │
│  retell-sdk  │  fetch() to ElevenLabs  │     │
│               │  fetch() to Dograh      │     │
└─────────────────────────────────────────────┘
```

### 33.2 The Interface & Factory

**File:** `src/lib/voice/provider.ts`

```typescript
export interface VoiceAgentProvider {
  createAgent(client: Client, config: AgentConfig): Promise<{ agentId: string }>;
  updateAgent(client: Client, agentId: string, updates: Partial<AgentConfig>): Promise<void>;
  deleteAgent(client: Client, agentId: string): Promise<void>;
  publishAgent(client: Client, agentId: string): Promise<void>;
  updateLlmModel(client: Client, agentId: string, modelId: string): Promise<void>;
  syncKnowledgeBase(client: Client): Promise<void>;
  getAgentStatus(agentId: string): Promise<AgentStatus>;
  listVoices(): Promise<ProviderVoice[]>;
  updateVoice(client: Client, agentId: string, voiceId: string, voiceSettings?: Record<string, unknown>): Promise<void>;
  normalizeWebhookPayload(payload: Record<string, unknown>): NormalizedCallEvent | null;
}

export async function getVoiceProvider(provider: VoiceProvider): Promise<VoiceAgentProvider> {
  switch (provider) {
    case 'retell': { const { RetellVoiceProvider } = await import('./retellProvider'); return new RetellVoiceProvider(); }
    case 'elevenlabs': { const { ElevenLabsVoiceProvider } = await import('./elevenLabsProvider'); return new ElevenLabsVoiceProvider(); }
    case 'dograh': { const { DograhVoiceProvider } = await import('./dograhProvider'); return new DograhVoiceProvider(); }
    default: throw new Error(`Unknown voice provider: ${provider satisfies never}`);
  }
}
```

**Why dynamic imports:** Prevents loading unused provider SDKs. A Retell client
doesn't load ElevenLabs code into memory. Reduces bundle size and cold start time.

### 33.3 Agent ID Resolution (Backward Compatibility)

```typescript
export function getAgentId(
  client: Pick<Client, 'voice_provider' | 'voice_provider_agent_id' | 'retell_agent_id'>,
): string | null {
  const provider = client.voice_provider ?? 'retell';
  if (provider === 'retell') {
    return client.voice_provider_agent_id || client.retell_agent_id || null;
  }
  return client.voice_provider_agent_id || null;
}
```

**Why this matters:** Existing Retell clients have `retell_agent_id` but not
`voice_provider_agent_id`. This helper resolves the correct ID regardless of
which column it's in. Every route that needs the agent ID should use this helper.

### 33.4 DB Schema for Provider Selection

```sql
-- clients table
voice_provider text default 'retell'
  constraint clients_voice_provider_check
  check (voice_provider in ('retell','elevenlabs','dograh')),
voice_provider_agent_id text,
voice_provider_config jsonb default '{}'::jsonb,
migration_status text check (migration_status in ('pending','in_progress','completed','failed')),
migration_error text,
migration_started_at timestamptz,

-- call_logs table
provider_call_id text,
voice_provider text default 'retell',
```

### 33.5 Retell AI (Primary Provider)

**Adapter:** `src/lib/voice/retellProvider.ts` — thin adapter that delegates to
existing `src/lib/provision/*` functions. Does NOT reimplement logic.

**Provision layer:** `src/lib/provision/`
- `agentCreation.ts` — `createRetellLlmAndAgent()` (LLM + agent creation)
- `voiceConfig.ts` — `buildAgentVoiceConfig()` (voice settings)
- `analysisConfig.ts` — `buildAgentAnalysisConfig()` (post-call analysis)
- `agentPublishing.ts` — `publishRetellAgent()`, `updateAndPublishRetellAgent()`
- `kbSync.ts` — `syncAgentDataToRetellKB()` (knowledge base sync)
- `phoneManagement.ts` — `moveNumberToPool()`, `releaseTwilioNumber()`

**Key agent creation settings:**
- Default LLM: `gpt-4.1-mini` (fast latency, cheap)
- `model_temperature: 0.4` (instruction adherence)
- `model_high_priority: true` (reduced latency)
- `data_storage_setting: 'basic_attributes_only'` (no recordings on Retell)
- HIPAA: adds `pii_config` with redaction policies

**Voice config settings:**
- `enable_backchannel: true` (affirming sounds during caller speech)
- `backchannel_frequency: 0.5` (reduced from 0.8 — was too cartoonish)
- `responsiveness: 1.0` (maximum)
- `interruption_sensitivity: 0.6` (lowered from 0.7 for noise tolerance)
- `enable_dynamic_responsiveness: true` (adapts to caller speech rate)
- Expressive mode: only for Retell Platform voices (not third-party)
- Voice emotion: only for Cartesia/Minimax voices

### 33.6 ElevenLabs (Secondary Provider)

**Adapter:** `src/lib/voice/elevenLabsProvider.ts` (529 lines) — full REST API
implementation using `fetch()` (no SDK).

**Key differences from Retell:**
- `publishAgent()` is a **no-op** — ElevenLabs agents are live immediately
- `updateAgent()` sends full `conversation_config` (ElevenLabs replaces nested
  objects, doesn't merge)
- Recording URLs come in a separate `post_call_audio` event (not in transcription)

**LLM model mapping:**
```typescript
const LLM_MODEL_MAP: Record<string, string> = {
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'anthropic/claude-3.5-sonnet': 'claude-3-5-sonnet',
  'google/gemini-2.0-flash': 'gemini-2.0-flash',
};
const DEFAULT_EL_LLM_MODEL = 'gemini-2.0-flash';
```

**Built-in system tools:**
- `end_call` — always included
- `transfer_to_number` — only if client has `owner_phone` (human escalation)

### 33.7 Dograh (Self-Hosted Provider)

**Adapter:** `src/lib/voice/dograhProvider.ts` (545 lines)

**Key difference:** Dograh models agents as "workflows" (graph of nodes + edges),
not single agents. The adapter builds a minimal 2-node workflow: `startCall` →
`endCall`.

- `deleteAgent()` sets status to `archived` (no hard delete)
- `publishAgent()` validates workflow (no separate publish step)
- KB sync stores metadata in `voice_provider_config` (no API upload)
- No webhook handler exists yet (provider implemented but not wired)

### 33.8 The Call Processor (Shared Webhook Logic)

**File:** `src/lib/voice/callProcessor.ts`

Extracts common call-logging logic so all webhook handlers can use it:

```typescript
export async function processCallEvent(event: NormalizedCallEvent): Promise<void> {
  // 1. Idempotency guard (check duplicate provider_call_id + event_type)
  // 2. Fetch client context (business name, HIPAA, trade type)
  // 3. Determine outcome + flags (short calls = not_genuine)
  // 4. Calculate estimated value
  // 5. Insert into call_logs
  // 6. Send lead capture email
  // 7. Post-insert integrations (Sheets, webhooks, Stripe metered, escalation)
}
```

**HIPAA handling:**
```typescript
const isPhiEligible = clientRow?.data_class === 'phi_eligible';
transcript_summary: isPhiEligible ? null : event.transcriptSummary,
transcript: isPhiEligible ? null : event.transcript,
```

### 33.9 Provider Migration (Safe, No Downtime)

**File:** `src/app/crm/api/clients/[id]/migrate-provider/route.ts`

**Safe ordering:**
1. Mark `migration_status = 'in_progress'`
2. Create new agent on target provider
3. Verify new agent is healthy (`getAgentStatus`)
4. Update client row with new provider + agent ID
5. Deactivate (delete) old agent on source provider
6. Mark `migration_status = 'completed'`

**On failure:** `migration_status = 'failed'`, `migration_error` is set. Old
agent is NOT deactivated until new one is verified (no downtime).

**Phone number rebinding:**
- Retell: `phoneNumber.update()` with new agent
- ElevenLabs: Import Twilio number via API
- Dograh: No API rebind (configured in Dograh dashboard)

### 33.10 The Prompt Builder (Provider-Agnostic)

**File:** `src/lib/promptBuilder/index.ts` (~970 lines)

**Main function:** `buildFullClientPrompt()` — the single source of truth for
AI prompts. Never duplicate prompt text in other files.

**Prompt sections:**
1. Recording disclosure (legally required)
2. Persona & conversational style
3. Mandatory sequencing
4. Critical rules (includes `{{current_time}}` dynamic variable)
5. Returning caller recognition
6. Safety escalation branches
7. Emergency phrases
8. Triage tiers
9. Trade-specific dispatch
10. Intent detection
11. Booking-mode logic
12. Fallback-callback instruction
13. Closing

**Provider-specific variations:** None. All providers receive the same prompt.
**HIPAA mode:** No prompt differences — HIPAA is handled at LLM routing level.

### 33.11 HIPAA LLM Routing

**File:** `src/lib/llm/hipaa-router.ts`

```typescript
if (client.data_class === 'phi_eligible') {
  // Anthropic direct API (BAA-covered)
  // Model: claude-3-5-haiku-20241022
  // Only BAA-covered features: Messages API, prompt caching, structured outputs
  // NO: Batch API, Files API, Skills API, Code Execution, Computer Use
} else {
  // OpenRouter (existing behavior)
  return callOpenRouter(messages, tools, modelOverride);
}
```

**HIPAA is separate from voice provider.** A client can be on Retell with
Anthropic direct LLM, or on ElevenLabs with OpenRouter. The two are orthogonal.

### 33.12 Partially Migrated Routes (Still Retell-Only)

These routes need provider abstraction but don't have it yet:
- `src/app/crm/api/clients/calendar-settings/route.ts` — direct Retell SDK
- `src/app/crm/api/portal/test-call/route.ts` — uses `retell.call.createWebCall()`
- `src/app/crm/report/[token]/AgentVoiceTab.tsx` — ambient previews are Retell S3 URLs

**Pattern for migrating a route:**
```typescript
// Before (Retell-only)
const retell = new Retell({ apiKey: env.retellApiKey });
await updateRetellLlm(retell, agentId, { model: modelId });

// After (provider-agnostic)
const provider = client.voice_provider ?? 'retell';
if (provider === 'retell') {
  const retell = new Retell({ apiKey: env.retellApiKey });
  await updateRetellLlm(retell, agentId, { model: modelId });
} else {
  const voiceProvider = await getVoiceProvider(provider);
  await voiceProvider.updateLlmModel(client, agentId, modelId);
}
```

---

## 34. Payment Security & Subscription Lifecycle

Payment bugs cost real money — either yours (price manipulation) or your
customers' (double charges, missing refunds). This section documents the
complete Stripe integration, the security controls, and the subscription
state machine.

### 34.1 Stripe Client Setup

**File:** `src/lib/stripe.ts`

- Singleton client (cached instance)
- Validates `STRIPE_SECRET_KEY` is configured and not a placeholder
- API version pinned to `2023-10-16`
- Throws if key missing or contains `'REPLACE_WITH'`

**Exported helpers:**
- `getStripe()` — singleton client
- `updateStripeSubscriptionPrice()` — updates subscription price for plan changes
- `getUnlimitedStripePriceIds()` — loads pre-created Price IDs from settings

### 34.2 The Price Manipulation Audit (CRITICAL)

**The #1 payment vulnerability in vibe-coded apps:** accepting prices from the
client request body. An attacker sets `price: 1` (1 cent) and buys your $599
plan for a penny.

**RingProof's approach — ALL prices from server-side DB:**

| Flow | Price Source | Client Input |
|------|-------------|--------------|
| Onboarding checkout | `clients.monthly_price` from DB | `{ token }` only |
| Add-on checkout | `addon_catalog.price_cents` from DB | `{ slugs: string[] }` only |
| Admin plan change | Hardcoded price mapping | `{ planType }` only |
| Plan upgrade/downgrade | DB + whitelist validation | `{ price }` (validated) |

**Onboarding checkout price calculation:**
```typescript
// ALL from DB — nothing from request body
const monthlyPrice = client.monthly_price || 150;        // from clients table
const trialPrice = settings.trial_price;                  // from settings table
const adminDiscount = client.admin_discount_percent;      // from clients table
const promoDiscount = await getPromoDiscount(promoCode);  // from discount_codes table
const finalPrice = monthlyPrice * (1 - adminDiscount/100) * (1 - promoDiscount/100);
// unit_amount: finalPrice * 100  ← always server-calculated
```

**VULNERABILITY (mitigated): Plan upgrade/downgrade accepts `price` from body**
- Mitigation: strict whitelist validation against `getAllowedPlanTiers()`
- Legacy tier prices ($99-$249 in $10 increments) + current tier prices
- **Recommendation:** Accept `plan_type` instead of `price`, derive server-side

### 34.3 Checkout Flow Security

**Onboarding checkout** — `src/app/crm/api/onboarding/create-checkout/route.ts`

**Security controls:**
1. Rate limited: 5 sessions per hour per IP
2. Contract signature REQUIRED before checkout
3. Prevents double-payment (checks `paid_at`, `payment_manually_overridden`)
4. Onboarding token expiration + termination checks
5. Customer ID validation (verifies existing customer belongs to this Stripe account)
6. Idempotency: reuses pending sessions within 30 minutes
7. Stripe idempotency key includes token, price, promo, and 30-min bucket

**Customer creation/reuse:**
```typescript
// Validate existing customer
const existing = await stripe.customers.retrieve(client.stripe_customer_id);
if (!existing || existing.deleted) {
  // Clear stale ID, create new
  await supabase.from('clients').update({ stripe_customer_id: null }).eq('id', client.id);
  const customer = await stripe.customers.create({ email: client.email, ... });
}
```

**All checkouts are subscriptions** (`mode: 'subscription'`) with 7-day trial.
Paid trials create an invoice item for the trial price.

### 34.4 Stripe Webhook Handler

**File:** `src/app/crm/api/webhooks/stripe/route.ts` (1024 lines)

**Signature verification:**
```typescript
const event = stripe.webhooks.constructEvent(
  rawBody, signature, webhookSecret, 300 // 5-min tolerance
);
```

**Test-mode guard:**
```typescript
if (event.livemode === false && env.stripeSecretKey.startsWith('sk_live_')) {
  return NextResponse.json({ received: true, ignored: 'test_mode' });
}
```

**Idempotency:**
- Fast-path: check `billing_events.stripe_event_id` before processing
- Atomic claim: unique constraint on insert (handles race conditions)
- Returns 200 on conflict (another delivery won the race)

**Event types handled:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Mark paid, provision agent, commission, referral |
| `invoice.payment_succeeded` | Trial → active, paused → active |
| `invoice.payment_failed` | Count failures, dunning email, pause after 3 |
| `customer.subscription.created` | Set status (trial or active) |
| `customer.subscription.deleted` | Deactivate line, churn status |
| `customer.subscription.updated` | Sync pause/cancel/resume |
| `customer.subscription.trial_will_end` | Send trial-ending email |
| `invoice.upcoming` | Send invoice reminder |
| `checkout.session.expired` | Clean up pending add-on rows |
| `charge.refunded` | Commission clawback |
| `charge.dispute.created` | Commission clawback |

### 34.5 Subscription State Machine

```
incomplete → (contract + payment) → trial → (first payment) → active
                                     ↓                           ↓
                              (token expires)           (3 failed payments)
                                     ↓                           ↓
                                unfinished                  paused
                                                               ↓
                                                    (payment succeeds)
                                                           → active
                                                    (subscription deleted)
                                                           → churned
```

**Status values:** `incomplete`, `unfinished`, `trial`, `active`, `paused`,
`canceling_at_period_end`, `churned`

**Conditional updates prevent race conditions:**
```typescript
// Only update if status is still 'trial' (prevents race with subscription.deleted)
await supabase.from('clients').update({ status: 'active' })
  .eq('id', clientId).eq('status', 'trial');
```

### 34.6 Dunning (Failed Payment Recovery)

1. **1st failure:** Send dunning email, status stays `active`
2. **2nd failure:** Send dunning email, status stays `active`
3. **3rd failure:** Send escalated email ("Action required — service paused"),
   set status to `paused`
4. **Recovery:** `invoice.payment_succeeded` → status back to `active`

### 34.7 Commission Clawback on Refunds

**File:** `src/lib/commissionCalc.ts` — `recordCommissionClawback()`

- Looks up all commission payments for the client
- Calculates net paid per agent
- Inserts negative `payment_type = 'clawback'` rows
- Idempotency key: `clawback_${clientId}_${salesAgentId}`
- Full reversal (not prorated) — conservative approach

### 34.8 Manual Payment Override

**The `canMarkAsPaid()` guard:**
```typescript
export function canMarkAsPaid(client: { contract_signed?: boolean | null }) {
  if (!client.contract_signed) {
    return { ok: false, reason: 'Contract must be signed before payment.' };
  }
  return { ok: true };
}
```

**Defense in depth:**
1. Application: `canMarkAsPaid()` in every payment route
2. DB trigger: `trg_guard_contract_before_payment` blocks the write

**Manual override flow:**
- Admin sets `payment_manually_overridden = true` + `paid_at = now()`
- Activity log entry created for audit trail
- Treated equivalently to `paid_at` in completeness checks

### 34.9 Add-on Purchase Security

**File:** `src/app/crm/api/portal/addons/checkout/route.ts`

**Recurring add-ons:**
1. Creates Stripe price from catalog (`addon.price_cents` from DB)
2. Attaches to existing subscription via `stripe.subscriptionItems.create()`
3. Inserts `client_addons` row with `status='active'`
4. **Compensating rollback:** if DB insert fails, removes the Stripe subscription item

**One-time add-ons:**
1. Creates Stripe Checkout session with `mode: 'payment'`
2. Pre-creates `client_addons` row with `status='pending'`
3. Webhook sets `status='active'` on `checkout.session.completed`

**Duplicate prevention:**
- Checks existing `client_addons` before purchase
- Blocks auto-included add-ons for Unlimited tier

### 34.10 The Payment Security Checklist

- [ ] ALL prices come from server-side DB (never request body)
- [ ] Webhook uses raw body (not parsed JSON) for signature verification
- [ ] Webhook has timestamp tolerance (replay attack prevention)
- [ ] Test-mode events rejected on live key
- [ ] Idempotency: unique constraint on `stripe_event_id`
- [ ] Customer ID validated before reuse (belongs to this Stripe account)
- [ ] Contract signed before payment (app check + DB trigger)
- [ ] Conditional updates prevent race conditions (`.eq('status', 'trial')`)
- [ ] Commission clawback on refunds/chargebacks (idempotent)
- [ ] Compensating rollback on partial failures (add-on checkout)
- [ ] Rate limiting on checkout and plan change endpoints

---

## 35. Cron Jobs, Operations & Reliability

Scheduled tasks keep the system healthy: cleaning up stale data, retrying
failed provisioning, sending reminders, and catching missed webhooks. This
section documents every cron job, the error logging system, and the
reliability patterns.

### 35.1 Cron Job Endpoints (10 total)

**`/crm/api/cron/` routes (7 endpoints):**

| Endpoint | Schedule | Purpose | Max Duration |
|----------|----------|---------|--------------|
| `audit-reports` | Daily 03:00 UTC | Generate ROI reports for expired audits | 60s |
| `check-callbacks` | Every 5 min | Check expired callback promises, escalation SMS | 60s |
| `check-health` | Daily 12:00 UTC | Health check Retell/ElevenLabs/Dograh/Twilio | 60s |
| `migration-check` | Daily | Validate DB schema columns exist | 60s |
| `monthly-standings-reset` | Monthly 1st 00:05 | Calculate standings, rewards, reset | 60s |
| `seasonal-outreach` | Monthly 1st 03:00 | Find inactive customers, generate outreach | 60s |
| `send-review-requests` | Every 4 hours | Mark completed appts, send review SMS | 300s |
| `update-seasonal-context` | Monthly 1st 02:00 | Update seasonal risk profiles, sync KB | 300s |

**`/crm/api/jobs/` routes (3 endpoints):**

| Endpoint | Schedule | Purpose | Max Duration |
|----------|----------|---------|--------------|
| `daily-cleanup` | Daily 02:00 | Number recycling, expired trials, stale data | 300s |
| `generate-slots` | Daily 02:00 | Generate calendar slots for booking mode | 60s |
| `retry-failed-provisioning` | Every 6 hours | Retry failed provisioning (max 10/run) | 300s |

### 35.2 GitHub Actions Cron Workflows (11 total)

All workflows use the same auth pattern:
```yaml
env:
  APP_URL: ${{ secrets.APP_URL }}
  CRON_SECRET: ${{ secrets.CRON_SECRET }}
run: |
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/crm/api/cron/..."
```

**Required GitHub secrets:**
- `CRON_SECRET` — must match Vercel env var
- `APP_URL` — e.g. `https://getringproof.com` (no trailing slash)

**If these don't match:** cron workflows return 401 and send failure emails.

### 35.3 The Daily Cleanup Job (Comprehensive)

**File:** `src/app/crm/api/jobs/daily-cleanup/route.ts` (875 lines)

**Tasks:**
1. **Churned client number recycling** — moves Twilio numbers to reuse pool
   after grace period (default 3 days), with reuse buffer (default 5 days)
2. **Canceling-at-period-end fallback** — safety net for missed Stripe
   `subscription.deleted` webhooks (queries Stripe directly)
3. **Expired trial check** — safety net for missed `subscription.updated`
   webhooks (transitions trial → active or deactivates)
4. **Cronofy sandbox capacity check** — warns when approaching limit
5. **Per-client spend ceiling check** — compares today's spend vs 1.5x
   trailing 7-day average, sends admin alert
6. **Stale onboarding cleanup** — deletes sessions >14 days old
7. **Stale verification session cleanup** — restores prompts stuck in
   "test verification call" mode

**The safety net pattern:** Cron jobs catch missed webhooks. If Stripe's
webhook delivery fails, the daily cleanup queries Stripe directly and
syncs the status. This prevents data drift between Stripe and the DB.

### 35.4 Error Logging System

**File:** `src/lib/errorLogger.ts`

**Schema:**
```sql
create table if not exists error_logs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  error_message text not null,
  error_stack   text,
  context       jsonb default '{}',
  severity      text not null default 'error'
    constraint el_severity_check check (severity in ('error', 'warning')),
  resolved      boolean default false,
  created_at    timestamptz default now()
);
```

**PHI scrubbing (defense in depth):**
```typescript
const PHI_PATTERNS = [
  { pattern: /email regex/g, replacement: '[EMAIL]' },
  { pattern: /phone regex/g, replacement: '[PHONE]' },
  { pattern: /SSN regex/g, replacement: '[SSN]' },
  { pattern: /DOB regex/gi, replacement: '[DOB]' },
  { pattern: /address regex/g, replacement: '[ADDRESS]' },
  { pattern: /name regex/gi, replacement: '[NAME]' },
];
```

**Context allowlist:** Only safe keys allowed in context (no PII):
```typescript
const allowedKeys = [
  'client_id', 'step', 'twilio_error_code', 'stripe_event_id',
  'status', 'onboardingToken', 'severity', 'action', 'event_type',
  'chargedAmount', 'expectedAmount', 'callLogId',
];
```

### 35.5 The `after()` Pattern (Next.js 16)

**File:** Various webhook handlers + session verifiers

```typescript
import { after } from 'next/server';

// Return 200 immediately, process in background
after(() => processWebhookInBackground(rawBody).catch(async (err) => {
  console.error('Error processing webhook in background:', err);
  try {
    await logError('webhook/retell/after-callback', err, { step: 'background_processing' });
  } catch {
    console.error('Failed to log webhook processing error:', err);
  }
}));
```

**Why this matters:** The old fire-and-forget pattern (`.catch()` without
`await`) allowed Vercel to freeze the function before DB inserts and email
sending completed. `after()` guarantees execution continues after response.

**Usage locations:**
- Retell webhook — process webhook in background after 200
- ElevenLabs webhook — same pattern
- Dograh webhook — same pattern
- `portalSession.ts` — renew `last_used_at` after response
- `salesAgentSession.ts` — renew `last_used_at` after response

### 35.6 Webhook Reliability — Dead Letter Queue

**File:** `src/app/crm/api/webhooks/process/route.ts`

**Backoff schedule:** 30s, 2m, 10m, 30m, 2h, 6h, 24h, then dead-lettered

**Retry logic:**
- 5xx + network errors: retriable with exponential backoff
- 4xx: terminal — dead-lettered immediately
- 3xx: retriable (SSRF protection — redirects not followed)
- Exhausted retries: dead-lettered after 8 attempts

**Circuit breaker:**
- Pauses endpoint after 20 consecutive failures for 30 minutes
- Admin email sent when circuit breaker triggers

### 35.7 Idempotency Patterns

| System | Idempotency Key | Unique Constraint |
|--------|----------------|-------------------|
| Calendar booking | `${clientId}:${callId}:${slot_id}` | `booking_idempotency_key` |
| Stripe operations | `{prefix}:{clientId}:{discriminator}` (hourly bucket) | Stripe built-in |
| Commission clawback | `clawback_${clientId}_${salesAgentId}` | `idempotency_key` |
| Webhook processing | `stripe_event_id` | `billing_events.stripe_event_id` |
| Call logging | `(event_type, provider_call_id)` | `call_logs` unique |

### 35.8 Retry Logic

**Provisioning retry** — `src/lib/provisionRetry.ts`
- 3 attempts with exponential backoff (2s, 4s)
- Final failure: log critical error + send admin alert email

**Webhook queue retry**
- 8 attempts with exponential backoff (30s to 24h)
- Circuit breaker after 20 consecutive failures

**External services:**
- Stripe: automatic retries (SDK built-in)
- Retell: no explicit retry (relies on webhook queue)
- Resend/Twilio: best-effort only (no retry)

### 35.9 The DB-Save-First Pattern

**Rule:** API routes that update both DB and external services MUST save to DB
first, then attempt external sync as best-effort.

```typescript
// 1. Save to DB first (critical)
await supabase.from('clients').update({ voice_settings: newSettings }).eq('id', clientId);

// 2. External sync (best-effort, non-blocking)
fireBookingWebhook(clientId, { ... }).catch((err) => {
  console.warn(`Webhook failed for ${clientId}:`, err);
});

// 3. SMS (best-effort, non-blocking)
supabase.from('sms_queue').insert({ ... }).catch((err) => {
  console.warn(`SMS queue insert failed:`, err);
});
```

**Why:** The user's selection must always persist. If Retell is down, the DB
still has the correct state. When Retell comes back, the next sync will catch up.

### 35.10 Health Check Endpoint

**File:** `src/app/crm/api/cron/check-health/route.ts`

Checks:
- Retell API: reachability, auth, rate limits, credits
- ElevenLabs API: reachability, auth, rate limits
- Dograh API: reachability (optional self-hosted)
- Twilio API: reachability, account status (suspended/closed detection)

Returns structured JSON with `ok: boolean` and per-service details.

### 35.11 Monitoring Gaps

**No external monitoring:** No Sentry, Datadog, LogRocket, or Vercel Analytics.
All alerting is via email to `ADMIN_EMAIL`.

**Recommendations:**
1. Add Sentry for error aggregation (catches errors that don't reach `error_logs`)
2. Add Slack webhook for critical alerts (email can be missed)
3. Add dedicated `/health` endpoint for uptime monitoring
4. Add jitter to webhook backoff (prevent thundering herd)
5. Re-enable `webhook-cron.yml` (currently disabled due to secret mismatch)

---

## 36. Add-on Gating & Client Status State Machine

The add-on system and client status machine are the business logic core. Getting
either wrong means showing features to non-paying clients or hiding them from
paying ones. This section documents both systems completely.

### 36.1 The Add-on System — `src/lib/addons.ts`

**The single gating function:**
```typescript
export async function hasAddon(
  supabase: SupabaseClient,
  clientId: string,
  slug: string
): Promise<boolean>
```

**Two-tier check:**
1. **Unlimited tier auto-inclusion** — if client is on `unlimited_1200` plan and
   the slug is in `UNLIMITED_AUTO_ADDONS`, returns `true` without DB query
2. **Standard check** — queries `client_addons` for active row matching
   `client_id` + `addon_slug` + `status='active'`

**Unlimited auto-included add-ons:**
```typescript
const UNLIMITED_AUTO_ADDONS = new Set([
  'sms_follow_up', 'native_crm_sync', 'outbound_reminder_calls',
  'priority_support_sla', 'dedicated_concurrency_slot',
  'review_automation', 'no_show_recovery',
]);
```

**Rule:** ALL add-on checks go through `hasAddon()`. Never inline the logic.
Never query `client_addons` directly in a route. This prevents logic drift.

### 36.2 Add-on Catalog (19 add-ons)

**One-time add-ons:**
- `full_voice_library_unlock` ($25) — gates full voice library
- `full_ambient_sound_library_unlock` ($15) — sets ambient sound defaults
- `voice_emotion_presets_unlock` ($12) — enables expressive mode
- `white_glove_onboarding` ($15) — flags admin to schedule session
- `emergency_phrases` ($10) — TODO (not implemented)
- `secondary_trade_type` ($20) — sets secondary trade
- `priority_support` ($10) — sets priority flag

**Recurring add-ons:**
- `multilingual_switching` ($8/mo) — sets `agent_language='multi'`
- `additional_language_pack` ($5/mo) — sets `agent_language='es-ES'`
- `elevenlabs_premium_voice` ($15/mo) — client chooses via portal
- `voice_cloning` ($15/mo) — client records via portal
- `claude_reasoning_upgrade` ($12/mo) — switches LLM to Claude
- `faster_responsiveness_tuning` ($6/mo) — sets `responsiveness=0.95`
- `dedicated_concurrency_slot` ($8/mo) — increments count
- `branded_caller_id` ($5/mo) — telephony config
- `verified_number_status` ($4/mo) — telephony config
- `outbound_reminders` ($10/mo) — TODO
- `live_transfer` ($12/mo) — TODO
- `sms_follow_up` ($8/mo) — sets `sms_follow_up_enabled=true`
- `recording_retention` ($5/mo) — TODO
- `post_call_analysis` ($10/mo) — TODO
- `weekly_digest` ($3/mo) — TODO
- `sentiment_analysis` ($6/mo) — TODO

### 36.3 Add-on Effect Application

**Function:** `applyAddonToClient()` in `src/lib/addons.ts`

**Rule:** Only update DB columns that already exist. For everything else, the
presence of an active `client_addons` row IS the gate.

**Effect mappings (switch on `retell_field_affected`):**

| Field | Effect |
|-------|--------|
| `voice_library` | No DB change — gates access in portal |
| `ambient_sounds` | Sets `ambient_sound='coffee-shop'`, volume=0.3 |
| `expressive_mode` | Enables emotion presets, calls Retell API |
| `multilingual_switching` | Sets `agent_language='multi'` |
| `llm_model` | Switches to Claude via `updateClientLlmModel()` |
| `responsiveness` | Sets `responsiveness=0.95` |
| `concurrency_slot` | Increments `concurrency_slots_purchased` |
| `sms_follow_up` | Sets `sms_follow_up_enabled=true` |

**TODO effects (log only, not implemented):**
`live_transfer`, `recording_retention`, `post_call_analysis`, `weekly_digest`,
`sentiment_analysis`, `emergency_phrases`, `crm_sync`, `batch_outbound`

### 36.4 Client Status State Machine — `src/lib/clientStatus.ts`

**The 7 statuses:**
```sql
status text check (status in (
  'incomplete', 'unfinished', 'trial', 'active',
  'paused', 'canceling_at_period_end', 'churned'
))
```

| Status | Meaning |
|--------|---------|
| `incomplete` | Still in onboarding (telephony setup not done) |
| `unfinished` | Onboarding token expired (15-day window passed) |
| `trial` | 7-day trial period active |
| `active` | Fully active, paying client |
| `paused` | Paused after 3 payment failures |
| `canceling_at_period_end` | Cancellation scheduled |
| `churned` | Subscription canceled/deactivated |

**State transitions:**
```
incomplete → trial/active (provisioning completes, gates pass)
trial → active (first payment succeeds)
active → paused (3 consecutive payment failures)
paused → active (payment method updated, payment succeeds)
any → canceling_at_period_end (cancel scheduled)
canceling_at_period_end → churned (subscription deleted)
incomplete → unfinished (token expires)
```

### 36.5 The Gate-Based Completeness Check

**`isIncompleteOnboarding()` — the 4 gates:**

```typescript
export function isIncompleteOnboarding(client: ClientStatusFields): boolean {
  // Gate 1: Contract signed
  if (!client.contract_signed) return true;

  // Gate 2: Payment received
  if (!client.paid_at && !client.payment_manually_overridden) return true;

  // Gate 3: Status is trial or active
  if (client.status !== 'trial' && client.status !== 'active') return true;

  // Gate 4: No incomplete marker in notes
  if (client.notes && client.notes.includes('[INCOMPLETE ONBOARDING]')) return true;

  return false;
}
```

**Why gate-based (whitelist) not blacklist:**

The old approach was a blacklist: "if paid_at, then complete." This kept getting
bypassed by new routes that set `paid_at` without checking other prerequisites.
A bug shipped TWICE where clients were marked complete despite missing contract
or incomplete provisioning.

**The fix:** Switch to whitelist — ALL gates must pass. No short-circuit returns
like `if (paid_at) return false`. Every gate is checked.

### 36.6 The Contract-Before-Payment Guard

**Application level:** `canMarkAsPaid()`
```typescript
export function canMarkAsPaid(client: { contract_signed?: boolean | null }) {
  if (!client.contract_signed) {
    return { ok: false, reason: 'Contract must be signed before payment.' };
  }
  return { ok: true };
}
```

**DB level:** `trg_guard_contract_before_payment` trigger
```sql
if NEW.status in ('trial', 'active', 'churned', 'paused')
   and NEW.contract_signed is not true then
  raise exception 'Cannot mark client as trial/active without a signed contract.';
end if;
```

**Defense in depth:** Even if a code path forgets `canMarkAsPaid()`, the DB
trigger blocks the write. Both enforce the same rule.

### 36.7 The Onboarding Bubble System

**5-step wizard:** Details → Plan → Agreement → Payment → Setup

**Step 5 (Setup) has sub-steps:**
- `5a` — Spinner for number provisioning
- `5path` — Choose setup path (manual vs guided)
- `5b` — Carrier selection
- `5c` — Forwarding type selection
- `5d` — Ring time (GSM conditional carriers)
- `5e` — Forwarding codes
- `5guided` — Guided path phone call
- `5f` — Verification complete
- `website` — Website scrape
- `finish` — All done

**Setup tab bubbles (4 required + 1 optional):**
1. **Calendar** — done when `calComConfigured` or `bookingMode='capture_only'`
2. **Phone** — done when `forwardingConfirmed` (the final telephony bubble)
3. **Website** — done when `kbScraped` or `knowledgeBaseText` set
4. **Scenarios** (OPTIONAL) — done when `callerScenarios` is not null

**Routing logic:**
```typescript
export function routesToOnboardingPortal(client: ClientStatusFields): boolean {
  return isIncompleteOnboarding(client) && !!client.onboarding_token;
}
// If incomplete + has token → onboarding portal
// If incomplete + no token → detail page (can't route to onboarding)
// If complete → detail page
```

### 36.8 Plan/Tier System

**Three tiers:**

| Plan | Price | Included Minutes | Overage | Concurrency |
|------|-------|-----------------|---------|-------------|
| Starter | $150/mo | 150 | $0.60/min | 1 |
| Flagship | $599/mo | 700 | $0.15/min | 1 |
| Unlimited | $1200/mo | Unlimited | $0 | 5 |

**Unlimited tier auto-includes 7 add-ons** (see 36.1).
**Metered billing:** Starter and Flagship use Stripe usage records for overage.
Unlimited has no metered billing.

### 36.9 Where `hasAddon()` Is Called

1. `src/app/crm/api/webhooks/retell/route.ts` — gates SMS triggers
2. `src/lib/reviewRequests.ts` — gates review automation
3. `src/app/crm/api/portal/growth-settings/route.ts` — gates growth features
4. `src/app/crm/api/portal/addons/checkout/route.ts` — prevents duplicate purchases
5. `src/app/crm/api/portal/set-preloaded-voice/route.ts` — gates voice selection
6. `src/app/crm/api/portal/preloaded-voices/route.ts` — gates voice library
7. `src/lib/provision/voiceConfig.ts` — gates voice config options
8. `src/app/crm/api/portal/agent-voice-config/route.ts` — gates voice settings
9. `src/app/crm/api/clients/pronunciation/route.ts` — gates pronunciation
10. `src/lib/callMetrics.ts` — gates metric calculations

### 36.10 The Add-on & Status Checklist

- [ ] ALL add-on checks go through `hasAddon()` (never inline)
- [ ] Unlimited tier auto-inclusion handled in `hasAddon()` (not in each route)
- [ ] `isIncompleteOnboarding()` uses gate-based whitelist (all gates must pass)
- [ ] No short-circuit returns in completeness checks
- [ ] `canMarkAsPaid()` called before every payment status change
- [ ] DB trigger `trg_guard_contract_before_payment` as backstop
- [ ] All client queries select `contract_signed` (helpers need it)
- [ ] Add-on effects only update DB columns that exist
- [ ] TODO add-ons log to console (don't silently no-op)
- [ ] Duplicate add-on purchases prevented (check `client_addons` first)

---

## 37. Calendar, Email, Telephony & LLM Integrations

RingProof integrates with 8+ external services. Each integration has its own
auth, rate limits, and failure modes. This section documents the patterns for
keeping them all working without leaking data or budget.

### 37.1 Calendar Provider Abstraction

**File:** `src/lib/calendar/provider.ts`

**4 calendar modes:**

| Mode | Provider | Real-time? | Auth |
|------|----------|-----------|------|
| `full` | Cronofy | Yes (polling) | OAuth + encrypted tokens |
| `full` | Cal.com | Yes (API) | API key |
| `capture_only` | None | No | N/A (captures only) |
| `webhook` | Zapier | Yes (webhook) | HMAC signature |

**Cronofy integration:**
- OAuth flow: `/crm/api/cronofy/authorize` → callback → token storage
- Access/refresh tokens encrypted at rest (AES-256-GCM)
- Refresh locking: only one refresh at a time per client (prevents race)
- Profile selection: user picks which calendar to sync
- Availability: `cronofy.availability()` API with participant constraints
- Booking: `cronofy.upsertEvent()` with smart conflict detection
- Cancellation: `cronofy.deleteEvent()`

**Cal.com integration:**
- v2 API: `/v2/event-types`, `/v2/slots`, `/v2/bookings`
- API key stored in `clients.cal_com_api_key` (server-side only)
- Booking: POST to `/v2/bookings` with `rescheduleUid` for reschedules
- Cancellation: POST to `/v2/bookings/{uid}/cancel`
- Availability: GET `/v2/slots` with `startTimeBefore` / `startTimeAfter`

**Capture-only mode:**
- No external calendar
- AI captures caller's preferred date/time
- Stored in `calendar_slots` with `status='pending'`
- Client manually books in their own calendar

### 37.2 Calendar Data Trimming (Privacy)

**File:** `src/lib/calendar/trim.ts`

**What gets trimmed:**
- Phone numbers: masked to `+1 (***) ***-1234`
- Email addresses: removed entirely
- Notes containing PII: removed

**Why:** Calendar events may be visible to the client's staff. Don't expose
caller contact info in the calendar event description.

### 37.3 Call-Context-Based Client Resolution

**The IDOR prevention pattern:**

When a webhook fires (Retell/ElevenLabs), it includes `call_id` and
`agent_id`. The handler resolves the client from the agent ID, NOT from
any client-supplied ID in the request body.

```typescript
// WRONG — client could supply any client_id
const clientId = body.client_id;

// RIGHT — resolve from agent_id (verified by provider)
const { data: client } = await supabase
  .from('clients')
  .select('id, business_name, data_class')
  .eq('voice_provider_agent_id', agentId)
  .single();
```

**This prevents IDOR:** An attacker can't send a webhook with a different
`client_id` to log calls against another client's account.

### 37.4 Voice Tool Endpoint Rate Limiting

**File:** `src/app/crm/api/voice-tool/route.ts`

AI agents call this endpoint during a call to perform actions (check
availability, book appointment, etc.). Rate limiting is by `call_id`, not IP:

- **Limit:** 3 calls per `call_id` per 10 minutes
- **Why:** Prevents prompt-injected agents from enumerating schedules
- **Storage:** In-memory `Map<string, number[]>`

### 37.5 Email System — Resend

**File:** `src/lib/email.ts`

**Purpose-specific sender addresses:**
- `team@getringproof.com` — general notifications
- `billing@getringproof.com` — payment/dunning emails
- `support@getringproof.com` — support chat notifications
- `alerts@getringproof.com` — admin alerts (errors, provisioning failures)

**Why separate senders:** Improves deliverability and lets users filter by
purpose. Billing emails won't get lost in support notifications.

**Email types:**
- Lead capture (immediate, to client)
- Dunning (1st, 2nd, 3rd failure — escalating urgency)
- Trial ending (3 days before)
- Invoice upcoming (3 days before)
- Provisioning failure (admin alert)
- Health check failure (admin alert)
- Daily summary (admin)

**Failure handling:** Best-effort only. If Resend fails, log to `error_logs`
but don't block the user action. Email is not critical path.

### 37.6 SMS System — Twilio

**File:** `src/lib/smsNotifications.ts`

**Two SMS paths:**

1. **Lead capture SMS** — sent to client when a lead comes in
   - Rate limited: 20/hour, 100/day per client (in-memory)
   - Cooldown: 5 minutes between SMS to same phone number
   - Suppressed for spam calls (Spam Shield)
   - Suppressed for test/personal calls

2. **Review request SMS** — sent after completed appointments
   - Sent by `send-review-requests` cron (every 4 hours)
   - Only for clients with `review_automation_enabled` add-on
   - Only for appointments 24-72 hours ago (not too fresh, not too old)
   - Only if no review already exists for that appointment

**HIPAA handling:**
- PHI-eligible clients: SMS suppressed entirely
- SMS content: no PHI (just "You have a new lead from [name]")

### 37.7 Telephony — Twilio

**Number management:**
- `src/lib/twilioNumbers.ts` — purchase, release, port numbers
- Number reuse pool: released numbers go to `client_numbers` with
  `status='available'` for reuse by other clients
- Reuse buffer: 5 days before a recycled number can be reassigned
  (prevents wrong-number calls to previous owner's callers)

**Call forwarding:**
- Forwarding codes stored in `clients.forwarding_codes`
- Verification: system calls the forwarding number, user enters code
- Verification status: `forwarding_verified_at` timestamp

**Recording download SSRF protection:**
- Recording URLs are validated against Twilio's domain whitelist
- Prevents SSRF attacks via manipulated recording URLs
- Only `api.twilio.com` and `com.twilio.com` domains allowed

### 37.8 LLM Routing

**File:** `src/lib/llm/hipaa-router.ts`

**Two paths:**

1. **Standard (OpenRouter):**
   - Default model: `openai/gpt-4.1-mini`
   - Premium model: `anthropic/claude-3.5-sonnet`
   - Used for: portal AI chat, agent data scanning, onboarding chat

2. **HIPAA (Anthropic direct):**
   - Model: `claude-3-5-haiku-20241022`
   - BAA-covered features only: Messages API, prompt caching, structured outputs
   - NO: Batch API, Files API, Skills API, Code Execution, Computer Use
   - Used for: PHI-eligible clients only

**The routing decision:**
```typescript
if (client.data_class === 'phi_eligible') {
  return callAnthropicDirect(messages, tools);
}
return callOpenRouter(messages, tools, modelOverride);
```

**HIPAA is orthogonal to voice provider.** A client can be on Retell with
Anthropic direct LLM, or on ElevenLabs with OpenRouter.

### 37.9 The Safety Event Fallback Chain

When a critical event happens (urgent call, escalation), the system tries
multiple notification channels in order:

```
1. Email (Resend)
   ↓ (failure)
2. SMS (Twilio)
   ↓ (failure)
3. Error log (DB)
   ↓ (failure)
4. Console.error (last resort)
```

**Why this order:**
- Email is cheapest and most reliable
- SMS is more urgent (push notification) but costs money
- Error log ensures auditability even if all notifications fail
- Console.error is the developer's safety net

### 37.10 Outcome Suppression Logic

**Suppressed outcomes (no SMS, no email, no revenue):**
- `test_call` — system test calls
- `personal_call` — personal/non-business calls
- `not_genuine` — spam/robocalls (Spam Shield)

**Why suppress:** These calls don't represent real leads. Sending SMS for
spam calls would drain the SMS budget and annoy the client.

### 37.11 The Integration Checklist

- [ ] External API keys stored server-side only (no NEXT_PUBLIC_)
- [ ] OAuth tokens encrypted at rest (AES-256-GCM)
- [ ] Refresh token locking prevents race conditions
- [ ] Calendar data trimmed (no PII in event descriptions)
- [ ] Client resolution from agent_id (not request body) — prevents IDOR
- [ ] Voice tool endpoints rate-limited by call_id
- [ ] Email senders are purpose-specific
- [ ] SMS rate-limited per client (not per IP)
- [ ] SMS suppressed for spam/test/personal calls
- [ ] HIPAA clients: SMS suppressed, LLM routed to Anthropic direct
- [ ] Recording download URLs validated (SSRF protection)
- [ ] Number reuse has buffer period (prevents wrong-number calls)
- [ ] Safety event fallback chain (email → SMS → log → console)

---

## 38. Landing Page, SEO, PWA & Performance

The landing page is the first impression. It must load fast, rank well, and
convert. This section documents the performance, SEO, and PWA patterns.

### 38.1 Server-Rendered Landing Page

**File:** `src/app/page.tsx` + `src/app/landing/`

**Architecture:**
- Server Component renders above-the-fold HTML/CSS
- Client interactions loaded via `dynamic(() => import(...), { ssr: false })`
- Above-the-fold content available before any JavaScript executes
- No loading spinner for initial page load (content is immediately visible)

**Why this matters:** Core Web Vitals. LCP (Largest Contentful Paint) measures
when the main content appears. Server-rendered HTML shows content immediately;
client-rendered pages show a blank screen until JS loads.

### 38.2 Dynamic Import Pattern for Client Components

```typescript
import dynamic from 'next/dynamic';

const LandingHero = dynamic(() => import('@/app/landing/Hero'), { ssr: false });
const PricingCalculator = dynamic(() => import('@/app/landing/PricingCalc'), { ssr: false });
const DemoCallWidget = dynamic(() => import('@/app/landing/DemoCallWidget'), { ssr: false });
```

**When to use `ssr: false`:**
- Components with heavy client-side state (calculators, widgets)
- Components that depend on `window` or `localStorage`
- Components with third-party libraries that aren't SSR-safe

**When NOT to use `ssr: false`:**
- Static content (text, images, layout)
- SEO-critical content (search engines need it in HTML)

### 38.3 Content Security Policy (CSP)

**File:** `src/proxy.ts` (Next.js 16 middleware)

**Route-specific CSP:**

| Route | CSP Policy | Why |
|-------|-----------|-----|
| `/crm/*` (admin) | Nonce-based, strict | Admin has interactive widgets |
| `/crm/report/*` (portal) | Nonce-based, strict | Portal has dynamic content |
| `/` (landing) | More permissive inline | Static marketing page |

**Nonce-based CSP pattern:**
```typescript
const nonce = crypto.randomBytes(16).toString('base64');
response.headers.set('Content-Security-Policy',
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ...`);
```

**Why nonce-based:** Each request gets a unique nonce. Inline scripts with the
matching nonce are allowed. This prevents XSS-injected scripts from running
(they won't have the nonce).

### 38.4 Security Headers (next.config.ts)

```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },           // no iframes
  { key: 'X-Content-Type-Options', value: 'nosniff' }, // no MIME sniffing
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
```

### 38.5 PWA — Service Worker

**File:** `src/app/crm/report/[token]/sw.ts`

**Scope:** `/crm/report/` only (not the entire site)

**Why scoped:** The service worker caches portal pages for offline access.
Admin pages shouldn't be cached (they have real-time data). Scoping prevents
the SW from intercepting admin requests.

**Cache strategy:**
- Cache-first for static assets (CSS, JS, fonts)
- Network-first for API calls (always get fresh data)
- Stale-while-revalidate for images

**PWA manifest:** `src/app/crm/report/[token]/manifest.webmanifest/route.ts`
- Dynamically generated (includes client name)
- Icons in multiple sizes
- Display: `standalone` (no browser chrome)
- Theme color matches portal theme

### 38.6 SEO — Comprehensive Metadata

**Files:**
- `src/app/layout.tsx` — global metadata
- `src/app/page.tsx` — landing page metadata
- `src/app/sitemap.ts` — dynamic sitemap
- `src/app/robots.ts` — robots.txt
- `src/app/blog/[slug]/page.tsx` — blog post metadata

**Metadata includes:**
- Title, description, keywords
- OpenGraph (Facebook, LinkedIn)
- Twitter Card
- Canonical URL
- JSON-LD structured data (LocalBusiness, Service, FAQPage)

**Sitemap:**
```typescript
export default async function sitemap() {
  const staticPages = ['', '/pricing', '/about', '/contact'].map(...);
  const blogPosts = await fetchBlogSlugs();
  return [...staticPages, ...blogPosts.map(...)];
}
```

**Robots:**
```typescript
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/crm/', '/sales/'] },
    sitemap: 'https://getringproof.com/sitemap.xml',
  };
}
```

### 38.7 No Analytics or Tracking Scripts

**Audit result:** No Google Analytics, no Plausible, no Vercel Analytics, no
Facebook Pixel, no tracking scripts of any kind.

**Why:** Privacy-first approach. The landing page loads faster without tracking
scripts. No cookie consent banner needed (only essential auth cookies used).

**Future recommendation:** If analytics are added, use privacy-focused tools
(Plausible, Fathom) with consent. Add cookie consent banner at that point.

### 38.8 Responsive Design Patterns

**Mobile-first CSS:**
- Base styles target mobile
- `@media (min-width: 768px)` for tablet
- `@media (min-width: 1024px)` for desktop

**Portal-specific CSS scoping:**
```css
/* client-portal.css */
.client-portal-root { /* portal styles */ }
```
Scopes CSS to `.client-portal-root` to prevent leakage to admin CRM.

**Font loading:**
- `next/font/google` self-hosts fonts (no CDN requests)
- `display: 'swap'` — text visible immediately with fallback font
- Preload critical fonts

### 38.9 The Landing Page Performance Checklist

- [ ] Above-the-fold content is server-rendered (no JS required)
- [ ] Client components use `dynamic(..., { ssr: false })`
- [ ] CSP is route-specific (strict for admin, permissive for static)
- [ ] Nonce-based CSP for routes with inline scripts
- [ ] Security headers set (X-Frame-Options, HSTS, etc.)
- [ ] PWA service worker scoped to portal only
- [ ] Sitemap is dynamic (includes blog posts)
- [ ] Robots.txt disallows auth routes
- [ ] JSON-LD structured data for SEO
- [ ] No tracking scripts (or privacy-focused with consent)
- [ ] Fonts self-hosted via next/font
- [ ] CSS scoped per route group

---

## 39. Client Portal UI Patterns

The client portal (`/crm/report/[token]`) is the main user-facing interface.
This section documents the UI architecture, tab system, and interaction patterns.

### 39.1 Tab-Based Navigation

**File:** `src/app/crm/report/[token]/ReportPageClient.tsx`

**Tab state:**
```typescript
const initialTab = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('tab') || 'home'
  : 'home';
const [activeTab, setActiveTab] = useState<'home' | 'performance' | 'calendar' | 'agent_voice' | 'addons' | 'settings' | string>(initialTab);
```

**Tabs:**
| Tab | Always Visible | Requires Session |
|-----|---------------|-------------------|
| Home | Yes | No |
| Calls | Yes | No |
| Performance | Yes | No |
| Calendar | If integration configured | Yes |
| [Integration] | Dynamic per webhook endpoint | Yes |
| Voice | Yes | No |
| Agent Data | Yes | Yes |
| Emergency Team | Yes | Yes |
| Settings | Yes | Yes |

**Deep linking:** `?tab=calendar` opens directly to calendar tab. URL parameter
read on initial load only (not reactive to URL changes).

**Dynamic integration tabs:** Generated from `webhook_endpoints` table. Each
endpoint gets its own tab showing delivery status and recent events.

### 39.2 Two-Layer Authentication (Token + Session)

**Layer 1: Token (URL)**
- `report_token` in URL path
- Server validates in `page.tsx` before rendering
- Sufficient for read-only tabs (Home, Calls, Performance, Voice)

**Layer 2: Session (Cookie)**
- `__Host-portal_session` cookie
- Required for sensitive tabs (Calendar, Agent Data, Emergency Team, Settings)
- Password-protected portals show password gate
- Public portals skip the gate (session auto-created)

**Why two layers:**
- Token-only access is shareable (forward the link)
- Session-protected tabs require intentional authentication
- Prevents casual access to sensitive settings via shared link

### 39.3 Visibility-Aware Polling

**Pattern:** Poll less frequently when tab is in background.

```typescript
useVisibilityAwareInterval(
  () => { if (portalSessionActive) fetchSupportMessages(); },
  5000,   // active: 5 seconds
  30000,  // backgrounded: 30 seconds
);
```

**Why:** Saves bandwidth and battery on mobile. Background tabs don't need
real-time updates. Only polls when `portalSessionActive` is true.

### 39.4 The Onboarding Wizard State Machine

**File:** `src/app/crm/onboard/[token]/OnboardPortalClient.tsx` (~7300 lines)

**5 steps:** Details → Plan → Agreement → Checkpoint → Payment → Setup

**Resume logic:**
```typescript
const computeInitialStep = (): number => {
  if (isProvisioned) return 5;        // telephony done
  if (contractSigned) return 4;       // payment step
  if (hasDetails && hasPlan) return 3; // agreement step
  if (hasDetails) return 2;           // plan step
  return 1;                           // details step
};
```

**State persistence:** All state in DB (not localStorage). On reload,
`computeInitialStep()` reads DB state and jumps to correct step.

**Step 5 sub-steps:** `5a` (spinner) → `5path` (path selection) → `5b-5e`
(carrier/forwarding config) → `5f` (verification) → `website` (KB scrape) →
`finish`

**Validation:** `canNavigateTo(target)` checks all prerequisite fields before
allowing step navigation. Prevents skipping steps with incomplete data.

### 39.5 Progressive Disclosure Pattern

**Collapsible sections:** `CollapsibleSection.tsx`
- Used for complex settings (voice, calendar, integrations)
- Reduces visual overwhelm
- Remembers expanded state per session

**Expandable cards:** Used in admin dashboard
- Click to see breakdown (MRR by client, calls by client)
- Default collapsed to show summary first

**Mobile drawer / desktop modal:**
- Lead details: drawer on mobile, modal on desktop
- Responsive breakpoint: 768px

### 39.6 Status Badge System

| Status | Color | Meaning |
|--------|-------|---------|
| trial | blue | 7-day trial active |
| active | green | Paying client |
| paused | orange | Payment failures |
| churned | red | Canceled |
| incomplete | gray | Still onboarding |
| deleted | red (strikethrough) | Soft-deleted |

### 39.7 Error Handling Patterns

**Error boundary:** `error.tsx`
- Client component catches render errors
- Shows error digest for debugging
- "Try again" button calls `reset()`

**Loading state:** `loading.tsx`
- Full-screen overlay during route transitions
- Hides sidebar/layout during loading
- Animated pulse + spinner

**Silent failure:** Non-critical features (revenue widget, tutorial)
- Return `null` if no data
- Don't show error to user
- Log to console for debugging

### 39.8 Tutorial Overlay System

**File:** `src/app/crm/report/[token]/PortalTutorialOverlay.tsx`

**12-step guided tour:**
1. Welcome → 2. Home Dashboard → 3. Call History → 4. Performance →
5. Calendar → 6. Voice → 7. Agent Knowledge → 8. Call Screening →
9. Add-ons → 10. Plan & Billing → 11. Chat Widget → 12. You're All Set

**Features:**
- Spotlight with backdrop blur
- Auto-switches to relevant tab for each step
- Auto-scrolls to highlighted feature
- `localStorage` tracks completion (`rp_portal_tutorial_done`)
- Auto-opens 1.2s after first portal load
- Reopenable via "?" button in header

**Responsive:** Card placement adapts to screen size (mobile <480px, tablet
<768px, desktop). Uses `requestAnimationFrame` for smooth positioning.

### 39.9 The Unified Chat Widget

**File:** `src/app/crm/report/[token]/UnifiedChatWidget.tsx`

**Two modes in one widget:**
1. **AI Assistant** (orange header) — AI chat for portal questions
2. **Support Team** (green header) — Human support chat with reactions

**Features:**
- Floating button (56px) when closed
- 380×520px panel when open
- Emoji reactions (👍, ❤️, 🙏, 😊)
- Reply-to functionality
- Message deletion
- Click-outside-to-close
- Auto-scroll to bottom

**Auth:** Relies on parent's `portalSessionActive` state. No separate auth.

### 39.10 The Portal UI Checklist

- [ ] Tab state supports deep linking (`?tab=`)
- [ ] Sensitive tabs require session (not just token)
- [ ] Polling is visibility-aware (slower when backgrounded)
- [ ] Onboarding wizard state is DB-backed (survives reload)
- [ ] `computeInitialStep()` restores correct step on reload
- [ ] Progressive disclosure for complex settings
- [ ] Status badges consistent across admin and portal
- [ ] Error boundary with reset button
- [ ] Loading state doesn't flash layout
- [ ] Tutorial is dismissible and reopenable
- [ ] Chat widget only renders when session active

---

## 40. The Security Audit Methodology

This section documents the **methodology** used to audit RingProof's security.
Future AI coders should follow this approach when auditing any SaaS codebase.

### 40.1 The Core Principle

**Every client-controlled value is attacker-controlled.**

This includes:
- Prices, amounts, plan IDs
- User IDs, client IDs, account IDs
- Roles, flags, subscription states
- Rate-limit counters (if client-side)
- Tokens, cookies, headers
- File uploads, URLs, redirect targets

If the client sends it, assume an attacker will manipulate it. Server-side
validation is the only defense.

### 40.2 The 9 Audit Categories

Every SaaS security audit should cover these categories:

1. **Secrets & Environment Variables**
   - Are secrets in `NEXT_PUBLIC_` env vars? (visible in client JS)
   - Are secrets returned in API responses?
   - Are secrets logged to console or error logs?
   - Are secrets in git history?

2. **Database & RLS**
   - Is RLS enabled on every table?
   - Does every table have at least one policy?
   - Is the service role key used in client components?
   - Are sensitive columns masked in API responses?

3. **Authentication**
   - Are session tokens hashed before storage?
   - Are comparisons timing-safe?
   - Are cookies `httpOnly` + `secure` + `sameSite`?
   - Is there session fixation prevention?
   - Are auth endpoints rate-limited?

4. **Rate Limiting**
   - Are public endpoints rate-limited by IP?
   - Are auth endpoints rate-limited + DB-locked?
   - Are AI endpoints rate-limited + cost-capped?
   - Is the IP extraction secure (last in X-Forwarded-For)?
   - Are expensive admin operations rate-limited?

5. **Payments**
   - Are ALL prices server-side? (never from request body)
   - Are webhook signatures verified with raw body?
   - Is there idempotency on webhook processing?
   - Are there replay-attack protections (timestamp tolerance)?
   - Is there a contract-before-payment guard?

6. **AI / LLM**
   - Are AI endpoints cost-capped (monthly budget)?
   - Are AI endpoints rate-limited (per-minute)?
   - Is PHI routed to BAA-covered providers?
   - Are prompt injections defended against?
   - Are AI tool endpoints rate-limited by call_id?

7. **Deployment**
   - Are webhook URLs configured correctly in provider dashboards?
   - Do GitHub Actions secrets match Vercel env vars?
   - Is the correct package manager used (pnpm, not npm)?
   - Are security headers set (CSP, HSTS, X-Frame-Options)?

8. **Data Access**
   - Is client resolution from verified context (not request body)?
   - Are there IDOR vulnerabilities (client_id from body)?
   - Is calendar data trimmed (no PII in event descriptions)?
   - Are recording download URLs validated (SSRF)?

9. **Input Validation**
   - Are all inputs validated server-side?
   - Are file uploads restricted by type and size?
   - Are URLs validated against allowlists (SSRF)?
   - Are SQL injection vectors closed (parameterized queries)?

### 40.3 Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| **Critical** | Direct exploit, data breach, or financial loss | Price from request body |
| **High** | Significant risk, requires specific conditions | No rate limiting on AI endpoint |
| **Medium** | Hardening opportunity, not directly exploitable | `sameSite: 'lax'` on admin cookies |
| **Low** | Best practice, minimal risk | No session inactivity timeout |

**Rule:** Don't label something "Critical" unless you can describe the exact
attack path. "Could be a problem" is not Critical — it's Medium at most.

### 40.4 The Audit Process

**Step 1: Map the attack surface**
- List every API route
- Categorize by auth type (public, token, session, webhook, cron)
- Identify which routes handle money, AI calls, or sensitive data

**Step 2: Grep for anti-patterns**
```bash
# Price from request body
grep -r "price" src/app/crm/api/ --include="*.ts" | grep "body\|json"

# Service role key in client components
grep -r "SUPABASE_SERVICE_ROLE_KEY" src/ --include="*.tsx"

# NEXT_PUBLIC_ secrets
grep -r "NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*KEY" src/

# Non-timing-safe comparisons
grep -r "===.*token\|===.*secret" src/lib/
```

**Step 3: Read the critical paths**
- Webhook handlers (signature verification, idempotency)
- Payment routes (price source, customer validation)
- Auth routes (token handling, cookie flags)
- AI routes (cost caps, rate limiting)

**Step 4: Verify with subagents**
- Launch parallel subagents for each category
- Each subagent reports findings with file:line references
- Distinguish confirmed vulnerabilities from hardening recommendations

**Step 5: Document findings**
- File and line references (not vague descriptions)
- Severity classification
- Attack path (for confirmed vulnerabilities)
- Fix recommendation (for handbook documentation)

### 40.5 The Vibe Security Mindset

**The #1 cause of security bugs in AI-generated code:** The AI trusts the client.

AI models are trained on tutorials and documentation that often show simplified
examples with client-sent prices, IDs, and flags. When generating production
code, the AI replicates these patterns without adding server-side validation.

**The fix:** Always ask "what if the client sends a malicious value?" for every
parameter. If the answer is "they could get free stuff" or "they could access
another user's data," that's a vulnerability.

### 40.6 Confirmed Vulnerabilities Found in This Audit

1. **`sameSite: 'lax'` on admin cookies** (Medium)
   - File: `src/lib/supabase/server.ts`
   - Risk: CSRF on GET requests to admin endpoints
   - Fix: Change to `sameSite: 'strict'`

2. **No `report_token` expiration** (Medium)
   - File: `.sql/schema.sql` (clients table)
   - Risk: Leaked tokens valid forever
   - Fix: Add `report_token_expires_at` column

3. **Sales agent login fully public** (Low-Medium)
   - File: `src/app/sales/api/login/route.ts`
   - Risk: Credential stuffing (mitigated by rate limiting)
   - Fix: Add IP whitelist or shared secret

4. **Plan upgrade accepts `price` from body** (Low — mitigated)
   - File: `src/app/crm/api/portal/billing/route.ts`
   - Risk: Price manipulation (mitigated by whitelist validation)
   - Fix: Accept `plan_type` only, derive price server-side

5. **In-memory rate limiting resets on cold start** (Medium)
   - File: `src/lib/rateLimit.ts`
   - Risk: Rate limit bypass during cold starts
   - Fix: Migrate to Vercel KV / Upstash

6. **No session fixation prevention** (Low)
   - Risk: Session ID reuse after login
   - Fix: Regenerate session ID on login

7. **No CSRF tokens** (Low — mitigated by SameSite)
   - Risk: CSRF attacks (mitigated by `sameSite: 'strict'` on portal/sales)
   - Fix: Add CSRF tokens for admin routes

8. **No session inactivity timeout** (Low)
   - Risk: Stolen sessions valid for 30 days
   - Fix: Add inactivity-based expiry

### 40.7 The Audit Methodology Checklist

- [ ] Map every API route and categorize by auth type
- [ ] Grep for anti-patterns (price from body, NEXT_PUBLIC_ secrets, etc.)
- [ ] Read critical paths (webhooks, payments, auth, AI)
- [ ] Verify findings with code evidence (file:line)
- [ ] Classify severity (Critical/High/Medium/Low)
- [ ] Distinguish vulnerabilities from hardening
- [ ] Document attack paths for confirmed vulnerabilities
- [ ] Document fix recommendations
- [ ] Re-audit after fixes are implemented
- [ ] Schedule regular re-audits (codebase changes introduce new risks)

---

## Maintenance Note

This handbook now contains **40 sections** covering:
- Security & access control (Sections 1, 9, 30, 31, 32, 40)
- Architecture & abstractions (Sections 2, 3, 33)
- Integrations (Sections 4, 34, 37)
- Operations (Sections 5, 13, 14, 35)
- Philosophy & mindset (Sections 6, 11, 12, 15, 16)
- Bug prevention (Sections 7, 8)
- UI & design (Sections 10, 38, 39)
- Sales & commission (Sections 17-21)
- Spam & bot protection (Sections 22, 23)
- Onboarding & landing (Sections 24, 25)
- Proxy & CI/CD (Sections 26, 27)
- Environment (Section 28)
- SaaS checklist (Section 29)
- Add-ons & lifecycle (Section 36)

**The audit never ends.** Every new feature, every new integration, every new
route adds potential vulnerabilities. Future AI coders should:
1. Read this handbook before writing code
2. Follow the checklists at the end of each section
3. Add new sections when they learn new patterns
4. Re-audit periodically (codebase changes introduce new risks)
5. Never trust the client — validate everything server-side
