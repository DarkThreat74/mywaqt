# Waqt — Architecture, Security & Engineering Audit

> Written from a three-part code audit of this repository. Every claim below was
> verified against source — file paths included so you can check each one.

---

## 1. Security

### 1.1 Content Security Policy — three layers, kept in sync

| Layer | File | What it does |
|---|---|---|
| Static fallback CSP | `next.config.ts` | `default-src 'self'`; tight `connect-src` whitelist (nominatim, OSRM, openfreemap, cartocdn, Cloudflare, R2, overpass only); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` |
| Dynamic per-request CSP | `src/proxy.ts` | For session pages: `script-src 'nonce-<16 random bytes>' 'strict-dynamic'` — stronger than the fallback, so inline script injection is dead on every app page |
| Stale-cache CSP repair | `public/sw.js` (`CURRENT_CSP`) | Re-stamps CSP only on stale *cached* script responses that predate a policy change — cached code keeps booting instead of stranding users |

The nonce flows `x-nonce` header → `src/app/layout.tsx` theme boot script. Static marketing pages keep `'unsafe-inline'` deliberately (documented — their prerendered HTML can't carry a per-request nonce).

Other headers: `X-Content-Type-Options: nosniff`, `CORP: same-origin`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo = self only), `poweredByHeader: false`, `no-store` on all `/api/*`. `/quran-tester` gets a scoped COOP/COEP + `'unsafe-eval'` variant — SharedArrayBuffer isolated to that one route instead of app-wide.

### 1.2 Authentication & sessions — `src/lib/auth/session.ts`

- HS256 JWT (`jose`), 7-day expiry; `assertKey()` **fails closed** if `SESSION_SECRET` is unset.
- `httpOnly` + `secure` + `sameSite: lax` cookies; separate `waqt-uid` cookie lets the service worker scope page cache per account (no cross-account cache bleed).
- **Global revocation**: `sessionsValidAfter` DB cutoff checked per request via 60s `unstable_cache`; password reset invalidates via `revalidateTag`.
- **CSRF defense-in-depth**: non-GET requests rejected when `Origin` host mismatches, with an explicit allowlist for `capacitor:`/`ionic:`/`app:` WebView schemes.
- `src/proxy.ts` middleware *verifies* the JWT (not just cookie presence) and strips invalid cookies to prevent redirect loops.
- `bcryptjs` cost-10; dummy-hash comparison on unknown emails so login time doesn't leak which accounts exist.
- **Per-account brute-force lockout**: `loginAttempts` table — 10 failures / 15 min, cleared on success.
- Admin routes all behind `requireAdmin` → DB `role === 'admin'` check (verified in all 11 admin routes).

### 1.3 Token hygiene — everything sensitive is hashed at rest

| Token | Generation | Storage | Notes |
|---|---|---|---|
| Friend share | `randomBytes(32)` base64url | SHA-256 | lookup by hash + `revokedAt IS NULL` |
| Password reset | `randomBytes(32)` hex | SHA-256, 30-min TTL | **atomically consumed** via `UPDATE … WHERE usedAt IS NULL RETURNING` — kills TOCTOU replay |
| Signup verify | random | SHA-256, 24h | `DELETE … RETURNING` |
| Public share codes | `randomInt` over 32-char unambiguous alphabet | DB | 8 chars; legacy 6/32 accepted |
| Cron | `CRON_SECRET` Bearer | `crypto.timingSafeEqual` + length check first | dev bypass gated on `!isProduction` |

### 1.4 Rate limiting — `src/lib/rateLimit.ts`

- IP extraction order: `x-vercel-ip` → `x-real-ip` → **last** X-Forwarded-For value (spoof-resistant — the client-supplied entries are the *first* ones).
- In-memory fixed window, upgraded to **Upstash Redis INCR/PEXPIRE pipeline** when configured (`checkRateLimitAsync`); fails open to in-memory on Redis error.
- ~80+ routes verified rate-limited: login 5/15min, signup 5/15min + 3/hr + per-email 3/hr, reset 5/15min, share-generate 5/hr, scroll sync 30/min, public endpoints 60/min.

### 1.5 Validation, IDOR, injection

- `src/lib/validation.ts`: UUID/email/token/fingerprint-hash regexes, E.164 phone normalization, `escapeHtml`, honeypot + time-trap helpers.
- Ownership scoping verified on spot-checked routes — `session.userId` is always in the WHERE clause (friends, events, scroll sync, share settings). Friend share: owner check before token create/revoke.
- `api/scroll/sync`: days capped at 40, strict `YYYY-MM-DD` regex, all numbers floored ≥0, sessions capped at 250 with string truncation — malicious payloads can't write garbage.
- `api/public/[token]/events`: owner visibility window clamped server-side, 31-day range cap, event titles masked to "Busy" when the owner disabled detail sharing.
- **SQL**: all Drizzle — `sql` template params are bound; every `sql.raw` in the repo is a compile-time literal (verified). No string-concatenated queries.
- **XSS**: only two `dangerouslySetInnerHTML` — JSON-LD (safe) and the nonce'd theme script (safe). Everything else is React-escaped JSX.

### 1.6 Honest gaps (worth knowing, not hiding)

1. In-memory rate limit is advisory without Upstash — cold starts reset counters.
2. `isSessionActive` fails open on DB error — revoked tokens stay valid during a DB outage (commented, deliberate availability trade-off).
3. Turnstile bypass string passes if `TURNSTILE_SECRET_KEY` unset in prod (mitigated by honeypot/time-trap/rate limits only).
4. SW `CURRENT_CSP` repair stamps a *weaker* CSP (`'unsafe-eval'`) on stale cached scripts than the server would.
5. Friend-share public page exposes `phone` + `notes` to anyone holding the link — probably intended but notes are often private.
6. `proxy.ts` matcher excludes `/api/*` — API auth is entirely per-route `getSessionFromRequest` (verified present, but no centralized guardrail).
7. Sirat SW `addAll` precache fails wholesale if any icon 404s.
8. `scroll_days` upserts are last-write-wins across devices (no merge/max for same date).

---

## 2. Offline-First & PWA

### 2.1 The main service worker — `public/sw.js` (~2,300 lines, the real offline brain)

A nine-route fetch router with per-destination strategies:

| Destination | Strategy |
|---|---|
| `/_next/static/*` | cache-first, CSP re-stamp, 2 retries on critical, honest 503 on miss |
| `/qt/*` Quran engine | dedicated version-stable bucket + background refresh |
| `/models` `/mediapipe` `/xray` `/exercise-art` | `waqt-pose-assets-v1` — survives SW version bumps AND user-cache clears (~60MB) |
| Page navigations | uid-stamped cache; <15min → instant serve + background revalidate + build-fingerprint diff → `SW_RELOAD` toast; older → network vs 2.5s fallback race |
| RSC/Flight payloads | uid+build stamped, prefetch passthrough |
| API GETs | per-endpoint TTLs (prayer-times 1h, talks 6h, events/prayer-log 1min) + session-gated |
| Talks audio (R2) | explicit-download only, **HTTP Range slicing** so seeking works on iOS, survives logout |
| Same-origin statics | cache-first, 12s critical / 6s cosmetic fetch budgets |

Precache: manifest, icons, offline page, Quran page/surah data, sirat places. Offline navigation renders an inline page listing *actually-cached* routes (not a dead end).

### 2.2 The outbox — offline writes that don't lose data

`sw.js` IndexedDB `waqt-offline`: every non-whitelisted `/api/*` mutation that fails queues in `event-outbox` with an `Idempotency-Key`, a `clientId` UUID injection for entity creates, and **uid stamping so account A's queued writes can never replay as account B**. FIFO replay via Background Sync + online/visibility triggers; 401 halts replay; synthetic 202 responses let the UI render `_pending` objects instantly offline.

### 2.3 Client offline store — `src/lib/offline/db.ts`

Dexie `waqt-offline-data`, schema v6, **17 object stores** (events, prayer logs/times, analytics, friends, qadaa, goals, homework, habits, notes, talk downloads, workout sessions/sets/photos) with age-based pruning (30–90d per store).

### 2.4 Android shell

- Capacitor + `WaqtWebViewClient` serves `/_next/static/**` from bundled APK assets — the JS/CSS shell works with zero connectivity.
- `ShieldAccessibilityService.java`: during unmarked prayer windows it draws an accessibility overlay over ~19 feed apps — **fully offline** (schedule pushed to SharedPreferences). Also the feed-scroll counter: per-app rules, 1.2s debounce, sessions, hour buckets, 14-day local archive.
- `SalahShieldPlugin`: status, permission deep-links, scroll stats bridge, push-ready check.
- SW registration is deliberately **disabled inside the shell** (the native cache owns offline there).

### 2.5 Sirat sub-app

Own SW (`fa-v14`): network-first nav with 3s cached fallback, and a **data-version mechanism** — diffs the fetched `index.html` against the cached copy byte-for-byte; on change it posts `sirat:new-data` and the page reloads itself once (30s throttle). Offline streets: grid-tiled Overpass downloads into IndexedDB, resumable, error-kind diagnostics (offline/busy/storage/big), three fallback endpoints.

### 2.6 Push

`web-push` + VAPID; subscription endpoint has an SSRF guard; SW `push` handler supports tags, silent/vibrate, deep-link focus. Android uses native FCM via `pushReady()`.

---

## 3. Performance

### 3.1 Load-time

- `next/dynamic` + `ssr:false` for the heaviest screens: `MuscleBody`, `XRayVisualizer`, `GuidedCamera`, the ~1,200-line `AdvancedAudioPlayer`.
- Runtime `import()` for the heaviest deps — `three`, `@mediapipe/tasks-vision`, `maplibre-gl`, `onnxruntime-node`, all Capacitor plugins — nothing ships in the initial bundle.
- `optimizePackageImports: ["lucide-react", "date-fns"]`; `serverExternalPackages` keeps native binaries out of webpack; `outputFileTracingIncludes` only bundles onnx binaries into the one function needing them.
- Self-hosted fonts via `next/font` (Spectral + Amiri) — zero external font requests (`font-src 'self'`).
- Singleton pose-model promise + `requestIdleCallback` preload — the camera opens instantly after the first visit.
- Images: `image/avif` + `image/webp` formats, all local.

### 3.2 The clever stuff

- **RSC warm**: the client fires real `RSC:1` fetches for the 8 app routes on idle (max once/hour) — since every app page is `force-dynamic`, this is what makes tab taps feel instant instead of paying a full server render each time.
- **Prayer-times fan-out dedup**: the daily cron groups users by rounded ~1km coords + method + madhab — ~100k users costs ~1k AlAdhan calls. 10-way concurrency, 240s deadline, 500-row upsert batches.
- **Deterministic cron slotting**: checkin-scheduler assigns each user a slot by FNV-1a hash — one hourly cron covers the original per-5-minute spec without thundering herd, and it's idempotent by design (`checkin_stage` guard).
- **BRIN indexes on time-ordered tables** (`prayer_log`, `prayer_times_cache`, `events`) — near-zero write cost vs B-tree for append-mostly data; 91 indexes total, `inArray` batching used in 111 places.
- **Auto-archival**: prayer_log rows older than ~200 days pack into `prayer_log_archive` during the monthly sync — the hot table stays small forever.
- `prayerTimes` Dexie + server `prayer_times_cache` means the prayer UI renders with no network at all after onboarding.

### 3.3 Runtime / mobile

- Camera feed drops to 640×480 on small screens (XRay); render loops are rAF-driven; Qibla compass throttles state to ~4/sec; `MuscleBody` is demand-rendered; tools-menu/onboarding persistence debounced.
- Sirat SW races network vs 3s cached copy — a weak signal never hangs the app.

### 3.4 Honest perf gaps

1. ~60MB of models/mediapipe + ~90MB mushaf data download on first feature use — no Wi-Fi-only gate yet.
2. `GuidedCamera` requests 1080p unconditionally (XRay's screen-size check should be copied over).
3. `staleTimes` router cache is mostly dead code — force-dynamic pages bypass it; the RSC-warm hack works but costs ~8 server renders/user/hour.
4. `sw.js` is `waqt-v127` but `sw-register.tsx` still registers `?build=126` — a real one-reload-per-session bug until bumped.

---

## 4. The two things to fix today

1. **Bump `sw-register.tsx` build constant to 127** — every client is currently paying an unregister+reload.
2. **Wi-Fi/size gate for the ~150MB of downloadable assets** — biggest real-world cost for metered users.

Everything else in this document is already shipped and verified.
