/**
 * Waqt Service Worker
 * 
 * Strategy:
 * - Precache the app shell on install
 * - Stale-while-revalidate for navigations (instant paint from a ≤12h
 *   same-account cached page; background revalidate keeps it fresh)
 * - Cache-first for static assets (_next/static, images, fonts)
 * - Stale-while-revalidate for API GET requests (events, prayer times)
 * - Offline event writes: store in IndexedDB, sync when back online
 * - On update: skip waiting, notify client, client auto-reloads + clears old caches
 * 
 * The "no crash on update" rule:
 * - New SW installs in parallel (doesn't kill the old one)
 * - Old caches are deleted on activate (only after new SW takes control)
 * - Client is notified via postMessage, then does a hard reload
 * 
 * Offline event support:
 * - POST/PUT/DELETE to /api/events while offline → stored in IndexedDB outbox
 * - 'sync' event (Background Sync API) → replay outbox when online
 * - Fallback: replay on 'online' event from client
 */

const CACHE_VERSION = "waqt-v91";
// Stamped onto cached _next/static responses when served — a cached Response
// freezes its original headers, so a chunk cached before a CSP change can
// birth workers under the old policy. Keep in sync with next.config.ts CSP.
const CURRENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://tiles.openfreemap.org https://fonts.openfreemap.org",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://tiles.openfreemap.org",
  "font-src 'self' data: https://fonts.openfreemap.org https://tiles.openfreemap.org",
  "connect-src 'self' https://nominatim.openstreetmap.org https://api.latlng.work https://router.project-osrm.org https://tiles.openfreemap.org https://fonts.openfreemap.org https://*.basemaps.cartocdn.com https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https:",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const RSC_CACHE = `${CACHE_VERSION}-rsc`;
const AUDIO_CACHE = "waqt-audio";
// AUDIO_CACHE stores talk MP3s for offline playback.
// It is intentionally not cleaned on logout (talks are shared content).

// App shell — the minimal set of files for offline boot
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/icon-badge.png",
  "/offline.html",
  "/data/ayah-pages.json",
  "/data/surah-meta.json",
  "/worklets/qt-capture.js",
];

// Core app pages — prefetched on install for offline boot.
// Only the 3 most-visited pages; the rest are cached on-demand when visited.
// Warming all 13 pages on install contends with critical hydration requests.
const APP_PAGES = [
  "/calendar/day",
  "/prayer",
  "/quran",
  "/mutashabihat",
  "/settings",
  "/subscriptions",
  "/birthdays",
  "/quran-tester",
  "/recite",
];

// ─── IndexedDB helpers for offline event outbox ───
const DB_NAME = "waqt-offline";
const DB_VERSION = 2;
const OUTBOX_STORE = "event-outbox";
const META_STORE = "meta";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      // Close when a page or another context asks to delete/upgrade the DB —
      // otherwise deleteDatabase blocks forever and cross-account data leaks.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

// Key-value meta store: persists the uid + session flag across SW restarts.
// Cookies are forbidden headers inside a SW, so the client posts these via
// the SET_SESSION / CLEAR_USER_CACHE messages instead.
async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addToOutbox(operation) {
  const db = await openDB();
  // Generate an idempotency key so retries don't double-apply mutations.
  // The server can use this to deduplicate replays of the same operation.
  const idempotencyKey = "off-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.add({ ...operation, timestamp: Date.now(), idempotencyKey });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOutbox() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromOutbox(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Broadcast the pending-write count so the client can render a persistent
// sync-status indicator. Fires after queue/remove/sync changes.
async function broadcastOutboxCount() {
  try {
    const outbox = await getOutbox();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "OUTBOX_COUNT", count: outbox.length }));
  } catch {
    // non-critical
  }
}

// ─── Sync offline outbox ───
// Concurrency guard: prevent duplicate syncs from overlapping triggers
let isSyncing = false;

async function syncOutbox() {
  if (isSyncing) return; // Already syncing — don't duplicate
  isSyncing = true;
  try {
    const outbox = await getOutbox();
    if (outbox.length === 0) return;

    let syncedCount = 0;
    const syncedPrefixes = new Set();

    for (const item of outbox) {
      // A synced prayer-log write also changes derived state cached under
      // /api/qadaa — bust it so counters don't serve pre-sync numbers.
      if (item.pathname && item.pathname.startsWith("/api/prayer-log")) {
        syncedPrefixes.add("/api/qadaa");
      }
      try {
        // Add _offlineTimestamp to the body so the server can check windows
        // against when the action was originally performed, not sync time
        const bodyToSend = item.body
          ? JSON.stringify({ ...item.body, _offlineTimestamp: item.timestamp })
          : undefined;

        // Include idempotency key so the server can deduplicate replays
        const headers = { ...(item.headers || { "Content-Type": "application/json" }) };
        if (item.idempotencyKey) {
          headers["Idempotency-Key"] = item.idempotencyKey;
        }

        const res = await fetch(item.url, {
          method: item.method,
          headers,
          body: bodyToSend,
          credentials: "include",
        });

        if (res.ok) {
          await removeFromOutbox(item.id);
          syncedCount++;
          if (item.pathname) syncedPrefixes.add(item.pathname);
        } else if (res.status === 401 || res.status === 403) {
          // Session expired — keep the item in the outbox so it can retry
          // after the user re-authenticates. Don't drop queued writes.
          const clients = await self.clients.matchAll({ type: "window" });
          clients.forEach((c) => c.postMessage({
            type: "EVENT_SYNC_FAILED",
            operation: item,
            status: res.status,
          }));
          break; // Stop — remaining items will also fail with 401
        } else if (res.status >= 500) {
          // Server error — stop replay to preserve FIFO ordering (later items
          // may depend on this one, e.g. PATCH on a POSTed entity)
          break;
        } else {
          // 4xx (validation error, conflict) — remove from outbox to avoid
          // retrying forever, but notify client so UI can surface the failure
          await removeFromOutbox(item.id);
          const clients = await self.clients.matchAll({ type: "window" });
          clients.forEach((c) => c.postMessage({
            type: "EVENT_SYNC_FAILED",
            operation: item,
            status: res.status,
          }));
        }
      } catch {
        // Network error — stop replay to preserve FIFO ordering and retry
        // the whole queue on the next sync
        break;
      }
    }

    // Invalidate stale API cache entries for synced endpoints so the next
    // read doesn't serve pre-sync data (stale-while-revalidate could
    // otherwise show the old state for up to the TTL). We bust the whole
    // collection prefix (e.g. a write to /api/events/123 busts /api/events*).
    if (syncedCount > 0) {
      await Promise.all([...syncedPrefixes].map((p) => bustApiCache(p)));
    }

    // Notify client that sync is complete so it can refetch fresh data
    if (syncedCount > 0) {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "EVENT_SYNCED", count: syncedCount }));
    }
    await broadcastOutboxCount();
  } finally {
    isSyncing = false;
  }
}

// ─── Warm cache: prefetch all app pages so they're available offline ───
// Called on install/activate and when the client sends WARM_CACHE.
// Fetches each app page and caches the HTML. If a page fails, it's skipped
// (will be cached on next visit). This is critical for offline-first:
// without it, pages the user hasn't visited won't load offline.
// Concurrency guard: prevent overlapping warmCache calls from multiple triggers
// (install + activate + WARM_CACHE messages can fire in quick succession).
let isWarming = false;
let lastWarmTime = 0;
async function warmCache() {
  // Deduplicate: if we warmed within the last 10 minutes, skip
  if (isWarming || (Date.now() - lastWarmTime < 10 * 60 * 1000)) return;
  isWarming = true;
  try {
    const cache = await caches.open(PAGE_CACHE);
    // Prune stale page + RSC entries — every ?date= navigation writes one,
    // and without a cap the caches grow forever. 14 days is plenty.
    const PRUNE_AFTER = 14 * 24 * 60 * 60 * 1000;
    for (const c of [cache, await caches.open(RSC_CACHE)])
    for (const key of await c.keys()) {
      const res = await c.match(key);
      const cachedAt = Number(res?.headers.get("x-waqt-cached-at") || 0);
      if (cachedAt && Date.now() - cachedAt > PRUNE_AFTER) {
        await c.delete(key);
      }
    }
    const results = await Promise.allSettled(
      APP_PAGES.map(async (page) => {
        const res = await fetch(page, {
          credentials: "include",
          redirect: "manual", // Don't follow redirects to /login
        });
        // Only cache successful responses (not redirects to /login)
        if (res.ok || res.status === 304) {
          // Clone and add a custom header for cache freshness tracking
          const body = await res.blob();
          const headers = new Headers(res.headers);
          headers.set("x-waqt-cached-at", String(Date.now()));
          const cachedRes = new Response(body, {
            status: res.status,
            statusText: res.statusText,
            headers,
          });
          await cache.put(page, cachedRes);
        }
      })
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    lastWarmTime = Date.now();
    return succeeded;
  } finally {
    isWarming = false;
  }
}

// ─── Install: precache app shell ───
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // If precache fails (e.g. offline), still install
      })
      .then(() => self.skipWaiting())
  );
  // NOTE: warmCache is NOT awaited here — blocking install on 7 page fetches
  // leaves the new SW stuck "installing" on slow connections. Activate warms.
});

// ─── Enable navigation preload for instant page loads ───
// This lets the browser start fetching the navigation request while the
// SW is still booting up, making page loads significantly faster.
if ("navigationPreload" in self.registration) {
  self.registration.navigationPreload.enable();
}

// ─── Activate: clear old caches, claim clients ───
self.addEventListener("activate", (event) => {
  // quran-tester-engine-v1: on-demand model/mushaf assets, owned by the
  // feature — versioned independently, never wiped on SW updates.
  const validCaches = [STATIC_CACHE, RUNTIME_CACHE, API_CACHE, PAGE_CACHE, RSC_CACHE, AUDIO_CACHE, "quran-tester-engine-v1"];

  event.waitUntil(
    caches
      .keys()
      .then(async (cacheNames) => {
        const legacyAudioCaches = cacheNames.filter((name) => /^waqt-v\d+-audio$/.test(name));
        if (legacyAudioCaches.length > 0) {
          const audioCache = await caches.open(AUDIO_CACHE);
          for (const cacheName of legacyAudioCaches) {
            const legacyCache = await caches.open(cacheName);
            for (const request of await legacyCache.keys()) {
              const response = await legacyCache.match(request);
              if (response) await audioCache.put(request, response);
            }
          }
        }
        await Promise.all(
          cacheNames
            .filter((name) => !validCaches.includes(name))
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
      .then(() => syncOutbox())          // Replay pending offline writes
      .then(() => warmCache().catch(() => {}))  // Warm all app pages for offline
      .then(() => {
        // Notify all clients that a new SW is active
        return self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED" });
          });
        });
      })
  );
});

// ─── Background Sync — replay offline outbox ───
self.addEventListener("sync", (event) => {
  if (event.tag === "waqt-event-sync") {
    event.waitUntil(syncOutbox());
  }
});

async function audioRangeResponse(request, response) {
  const range = request.headers.get("range");
  if (!range) return response;
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) return response;
  // Opaque cached responses (older downloads stored the cross-origin R2
  // redirect result) can't be read — arrayBuffer() would be empty and we'd
  // return a bogus 416. Hand it back whole; the element can still play it.
  if (response.type === "opaque") return response;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) return response;
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : buffer.byteLength - 1, buffer.byteLength - 1);
  if (start > end || start >= buffer.byteLength) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${buffer.byteLength}` },
    });
  }
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${buffer.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers });
}

// Drop cached GETs for a collection after a write — otherwise the client's
// immediate refetch serves the pre-write response for up to the TTL, which
// reads as "my entry didn't save" (sadaqah, events, …). Busts the whole
// collection prefix: /api/sadaqah/123 clears /api/sadaqah*.
async function bustApiCache(pathname) {
  try {
    const collection = pathname.split("/").slice(0, 3).join("/");
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((key) => {
          try {
            const p = new URL(key.url).pathname;
            return p === collection || p.startsWith(collection + "/");
          } catch {
            return false;
          }
        })
        .map((key) => cache.delete(key))
    );
  } catch {
    // non-critical — next TTL expiry heals it
  }
}

// The account a navigation request belongs to. Cookie headers are forbidden
// inside a service worker — the value arrives via the SET_SESSION postMessage
// (sent by UserStamp on mount) and is persisted in the meta store so it
// survives SW restarts. Cached in memory for hot-path reads.
let cachedUid = null;
let uidLoaded = false;
async function requestUid() {
  if (uidLoaded) return cachedUid;
  try {
    cachedUid = await getMeta("uid");
  } catch {
    cachedUid = null;
  }
  uidLoaded = true;
  return cachedUid;
}

// Whether a live session flag was posted. Cached private API responses must
// never be served to an unauthenticated session.
let cachedSession = null;
let sessionLoaded = false;
async function hasSession() {
  if (sessionLoaded) return cachedSession === true;
  try {
    cachedSession = (await getMeta("hasSession")) === true;
  } catch {
    cachedSession = false;
  }
  sessionLoaded = true;
  return cachedSession;
}

// Serve a cached page only if it was rendered for THIS account. Cached HTML
// is server-rendered with user data — serving account A's page to account B
// (or to a logged-out session) is both a privacy leak and the "frozen zombie
// app" bug: the page hydrates with one account's data while API calls run
// under another session. Entries missing the stamp (pre-stamp caches) are
// treated as mismatched.
async function matchStampedPage(cache, key, uid) {
  const cached = await cache.match(key);
  if (!cached) return null;
  const stamped = cached.headers.get("x-waqt-uid");
  if (!uid || stamped !== uid) return null;
  return cached;
}

// fetch() with a hard timeout — on a flaky network a bare fetch can hang for
// 30s+, which feels like the app froze. Abort so callers can fall back to cache.
function timedFetch(request, ms, bypassHttpCache = false) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // no-store: HTML pages must never come from the browser HTTP cache — a
  // stale cached document carries its birth CSP forever (headers are part
  // of the cached response), and no amount of reloading escapes it.
  const init = { signal: ctrl.signal };
  if (bypassHttpCache) init.cache = "no-store";
  return fetch(request, init).finally(() => clearTimeout(t));
}

// A cached Response is a frozen body+headers snapshot — a dedicated worker
// born from a stale chunk inherits its CSP from THESE headers, not the
// page's. Only re-stamp when the served policy lacks wasm-unsafe-eval, so a
// future CSP change in next.config never gets overwritten by this copy.
function withFixedCSP(response) {
  const csp = response.headers.get("content-security-policy") ?? "";
  if (csp.includes("wasm-unsafe-eval")) return response;
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", CURRENT_CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── Fetch: route by request type ───
self.addEventListener("fetch", (event) => {
  const { request } = event;

  const url = new URL(request.url);

  // ── Cache _next/static JS/CSS chunks (immutable, hashed filenames) ──
  // These are critical for offline: without them, cached HTML can't hydrate.
  // Use CacheFirst — these files are content-hashed and never change.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return withFixedCSP(cached);
        try {
          // timedFetch: a cache miss on lie-fi would otherwise hang the
          // whole hydration — chunks must fail fast so the page retries
          // instead of silently freezing.
          const response = await timedFetch(request, 6000);
          if (response.ok) {
            // Vercel's edge cache can replay stale headers for unchanged
            // hashed chunks — fix the wire copy too before storing/serving.
            const stamped = withFixedCSP(response);
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, stamped.clone());
            return stamped;
          }
          return response;
        } catch {
          // Offline and no cache — fail honestly with 503. Returning a fake
          // empty 200 for a missing JS chunk makes hydration silently dead
          // (page looks loaded, nothing works) instead of visibly retrying.
          return new Response("", { status: 503, statusText: "Service Unavailable" });
        }
      })()
    );
    return;
  }

  // ── Skip other _next/ requests (HMR, RSC payloads, etc.) ──
  // These are dev-only or client-navigation internals — don't intercept.
  if (url.pathname.startsWith("/_next/")) return;

  // ── Quran Tester engine assets (/qt/*) — cache-first from the dedicated
  // engine bucket. These are large binary assets (ONNX model, WASM runtime,
  // phoneme corpus) installed on demand; they must never hit the generic
  // runtime cache or the network once installed. ──
  if (url.pathname.startsWith("/qt/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open("quran-tester-engine-v1");
        const hit = await cache.match(url.pathname) ?? await cache.match(url.href);
        if (hit) return hit;
        // Static ort wasm lives at /qt/* in public/ — write through so a
        // fetched runtime file is offline-ready too. timedFetch so lie-fi
        // doesn't stall the engine boot indefinitely.
        const res = await timedFetch(request, 9000);
        if (res.ok) await cache.put(url.pathname, res.clone());
        return res;
      })()
    );
    return;
  }

  // ── Handle ALL API writes (POST/PATCH/PUT/DELETE) ──
  // When online: pass through to server. When offline: queue in IndexedDB.
  if (
    request.method !== "GET" &&
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/api/auth/") &&
    !url.pathname.startsWith("/api/admin/") &&
    !url.pathname.startsWith("/api/notifications/") &&
    !url.pathname.startsWith("/api/cron/") &&
    !url.pathname.startsWith("/api/goals/share") &&
    !url.pathname.startsWith("/api/goals/shared") &&
    !url.pathname.startsWith("/api/learn/") &&
    !url.pathname.startsWith("/api/prayer-times/sync") &&
    // Talk progress writes fire on a timer — a queued old position would
    // overwrite newer progress on replay, so let them fail when offline.
    !url.pathname.startsWith("/api/talks/progress") &&
    // Prayer reminders are time-sensitive pushes — a queued reminder replayed
    // hours later would nudge a friend who may have already prayed.
    !url.pathname.startsWith("/api/prayer-friends/remind") &&
    // Cheers, invites, and group actions are time-sensitive social writes —
    // replaying them later sends stale pushes or claims expired tokens.
    !url.pathname.startsWith("/api/prayer-friends/cheer") &&
    !url.pathname.startsWith("/api/prayer-friends/invite") &&
    // Snoozing a request toast while offline would be silently ignored
    // server-side anyway — let it fail visibly instead.
    !url.pathname.startsWith("/api/prayer-friends/snooze") &&
    // A dua reply belongs to a live 2-minute toast — queueing it would send
    // a thank-you the friend never typed in context.
    !url.pathname.startsWith("/api/prayer-friends/dua") &&
    // Chat sends/marks are live-thread writes — a queued replay would
    // duplicate or reorder messages; let them fail visibly instead.
    !url.pathname.startsWith("/api/messages") &&
    // Quran 1v1 match writes are time-sensitive — rounds resolve in ~90s and
    // invites expire in 5min, so a queued answer/ready/respond replayed later
    // would be meaningless (or corrupt the round). Let them fail offline.
    // Solo rating writes (/api/quran/rating) DO stay queueable — offline Elite
    // answers should count once you're back online.
    !url.pathname.startsWith("/api/quran/match")
  ) {
    // Clone the request body before consuming it
    const bodyPromise = request.clone().json().catch(() => null);

    event.respondWith(
      (async () => {
        try {
          // Try online first — timed so a hung connection still falls through
          // to the outbox queue instead of spinning forever.
          const response = await timedFetch(request, 12000);
          // Await before responding — the client refetches right after this,
          // so the stale entry must be gone first.
          if (response.ok) {
            await bustApiCache(url.pathname);
            // A prayer-log write also changes derived state cached under other
            // prefixes — the qadaa counter and weekly analytics would otherwise
            // show the pre-check-in numbers for up to their TTL.
            if (url.pathname.startsWith("/api/prayer-log")) {
              await bustApiCache("/api/qadaa");
            }
          }
          return response;
        } catch {
          // Offline — store in outbox for later sync
          const body = await bodyPromise;

          // For entity-creating POSTs, generate a REAL uuid and inject it into
          // the queued body as clientId. The server uses it as the row's actual
          // primary key, so the id never changes between offline and synced
          // states — a queued PATCH/DELETE on /api/events/<uuid> replays
          // correctly after the POST, with no tempId→realId mapping needed.
          const isEntityPost =
            request.method === "POST" &&
            (url.pathname === "/api/events" ||
              url.pathname === "/api/goals" ||
              url.pathname === "/api/homework" ||
              url.pathname === "/api/classes" ||
              url.pathname === "/api/subscriptions" ||
              url.pathname === "/api/birthdays" ||
              url.pathname === "/api/birthday-categories" ||
              url.pathname === "/api/blocks");
          const tempId = isEntityPost && body
            ? (() => {
                const uuid = crypto.randomUUID();
                body.clientId = uuid;
                return uuid;
              })()
            : "offline-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
          await addToOutbox({
            method: request.method,
            url: request.url,
            pathname: url.pathname,
            body: body,
            headers: { "Content-Type": "application/json" },
            tempId: tempId,
          });
          // Bust the collection's cached GETs now — the client already applied
          // this change optimistically, so a stale cached list (e.g. still
          // showing a deleted event or an unmarked prayer) must not resurface.
          await bustApiCache(url.pathname);
          // Offline prayer-log writes change the derived qadaa counter too.
          if (url.pathname.startsWith("/api/prayer-log")) {
            await bustApiCache("/api/qadaa");
          }
          broadcastOutboxCount();

          // Notify client that the write was queued offline
          const clients = await self.clients.matchAll({ type: "window" });
          clients.forEach((c) =>
            c.postMessage({
              type: "EVENT_QUEUED_OFFLINE",
              method: request.method,
              pathname: url.pathname,
              body: body,
              tempId: tempId,
            })
          );

          // Register background sync if supported
          if ("sync" in self.registration) {
            self.registration.sync.register("waqt-event-sync");
          }

          // Return a synthetic success response
          const responseData = {
            ok: true,
            offline: true,
            tempId: tempId,
            message: "Saved offline. Will sync when online.",
          };

          // For event POSTs, echo back event data so the calendar can render it
          if (request.method === "POST" && body) {
            if (url.pathname.startsWith("/api/events")) {
              responseData.id = tempId;
              responseData.title = body.title || "Untitled";
              responseData.startAt = body.startAt;
              responseData.endAt = body.endAt;
              responseData.type = body.type || "block";
              responseData.color = body.color || null;
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/goals")) {
              // For goals POST, echo back a synthetic goal object
              responseData.goal = {
                id: tempId,
                userId: null,
                parentId: body.parentId ?? null,
                title: body.title || "Untitled",
                description: body.description || null,
                status: "active",
                sortOrder: 0,
                color: body.color || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completedAt: null,
                _pending: true,
              };
            } else if (url.pathname.startsWith("/api/homework")) {
              // For homework POST, echo back a synthetic homework object
              responseData.id = tempId;
              responseData.title = body.title || "Untitled";
              responseData.description = body.description || null;
              responseData.classId = body.classId || null;
              responseData.dueDate = body.dueDate;
              responseData.dueTime = body.dueTime || null;
              responseData.priority = body.priority || "medium";
              responseData.status = "pending";
              responseData.kind = body.kind || "homework";
              responseData.completedAt = null;
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/classes")) {
              // For classes POST, echo back a synthetic class object
              responseData.id = tempId;
              responseData.name = body.name || "Untitled";
              responseData.color = body.color || "#c2410c";
              responseData.archived = false;
              responseData.sortOrder = 0;
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/subscriptions")) {
              responseData.subscription = {
                id: tempId,
                company: body.company || "Subscription",
                plan: body.plan || null,
                amountCents: body.amountCents ?? Math.round((body.amount || 0) * 100),
                currency: body.currency || "USD",
                cycle: body.cycle || "monthly",
                startDate: body.startDate,
                remindDaysBefore: body.remindDaysBefore ?? 3,
                color: body.color || "#c2410c",
                cancelledAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/birthdays")) {
              responseData.birthday = {
                id: tempId,
                name: body.name || "Birthday",
                birthMonth: body.birthMonth || 1,
                birthDay: body.birthDay || 1,
                birthYear: body.birthYear ?? null,
                remindDays: body.remindDays || [0, 1],
                lastNotifiedOn: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/birthday-categories")) {
              responseData.category = {
                id: tempId,
                name: body.name || "Category",
                color: body.color || "#B4552D",
                createdAt: new Date().toISOString(),
              };
              responseData._pending = true;
            } else if (url.pathname.startsWith("/api/blocks")) {
              responseData.block = {
                id: tempId,
                blockDate: body.date,
                startMin: body.startMin,
                endMin: body.endMin,
                status: "planned",
                assignments: [],
              };
              responseData._pending = true;
            } else {
              // For other API POSTs (prayer log, qadaa, etc.), echo back the body
              Object.assign(responseData, body);
              responseData.id = tempId;
              responseData._pending = true;
            }
          }

          return new Response(
            JSON.stringify(responseData),
            { status: 202, headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  // Only handle GET requests beyond this point
  if (request.method !== "GET") return;

  // Don't intercept auth/captcha/admin — always need fresh
  if (url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/admin")) return;

  // Don't intercept notification endpoints — always need fresh
  if (url.pathname.startsWith("/api/notifications")) return;

  // Don't intercept public calendar API — always need fresh
  if (url.pathname.startsWith("/api/public/")) return;

  // Don't intercept share management API
  if (url.pathname.startsWith("/api/share/")) return;

  // Don't intercept prayer-friends API — always need fresh (user-specific, auto-generates codes)
  if (url.pathname.startsWith("/api/prayer-friends/")) return;

  // Don't intercept onboarding API — always need fresh
  if (url.pathname.startsWith("/api/onboarding/")) return;

  // Don't intercept settings API — always need fresh
  if (url.pathname.startsWith("/api/settings/")) return;

  // Don't intercept quran API — live match state polls every ~1.4s and would
  // serve a frozen cached response under SWR; invites/ratings also change
  // constantly. Always fresh.
  if (url.pathname.startsWith("/api/quran/")) return;

  // Quran Tester mistakes sync — server is authoritative, local IndexedDB
  // is the offline copy; a cached list would resurrect deleted rows.
  if (url.pathname.startsWith("/api/quran-tester/")) return;

  // Don't intercept the notification inbox — toasts, invites and the active
  // match must be live; a cached inbox would keep dead toasts on screen.
  if (url.pathname.startsWith("/api/notifications/")) return;

  // Chat threads + conversation list poll constantly — a cached response
  // would freeze the thread. Always fresh.
  if (url.pathname.startsWith("/api/messages")) return;
  // Friend requests feed the same toast tray — always fresh.
  if (url.pathname.startsWith("/api/prayer-friends/pending")) return;
  if (url.pathname.startsWith("/api/prayer-friends/snooze")) return;

  // Don't intercept cron API
  if (url.pathname.startsWith("/api/cron/")) return;

  // Uploaded photos are private binary payloads — a 5-min cached copy shows
  // the OLD picture after an upload until the TTL lapses. Always fresh.
  if (url.pathname.endsWith("/photo")) return;

  // ── Navigation requests: stale-while-revalidate ──
  // Serve cached HTML instantly (offline-first), then update in background.
  // This is critical for offline: the app shell loads immediately from cache
  // and client components hydrate from IndexedDB data.
  if (request.mode === "navigate") {
    const pathname = url.pathname;

    // Landing page "/" — stale-while-revalidate (now static, safe to serve from cache first)
    if (pathname === "/") {
      event.respondWith(
        (async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          // Fetch fresh in background (don't await — return cached immediately)
          const fetchPromise = fetch(request, { cache: "no-store" })
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => {});
          // Serve cached instantly if available, otherwise wait for network
          if (cached) {
            return cached;
          }
          try {
            return await fetchPromise;
          } catch {
            // Offline with no cache — serve cached calendar (app shell)
            const pageCache = await caches.open(PAGE_CACHE);
            const calendarCached = await pageCache.match("/calendar/day");
            if (calendarCached) return calendarCached;
            return new Response(
              "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Waqt — Offline</title><style>body{font-family:system-ui,sans-serif;background:#f5f0e8;color:#1a1815;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}h1{font-size:18px;margin-bottom:8px}p{font-size:14px;opacity:0.7}</style></head><body><div><h1>You're offline</h1><p>Open the app again once you're back online to reload cached pages.</p></div></body></html>",
              { status: 200, headers: { "Content-Type": "text/html" } }
            );
          }
        })()
      );
      return;
    }

    // Auth pages: pass through online, but offline serve the precached
    // offline page instead of the browser's connection-error screen — a
    // logged-out user reopening the installed PWA without network still gets
    // a Waqt page.
    if (pathname === "/login" || pathname === "/signup") {
      event.respondWith(
        timedFetch(request, 8000).catch(async () => {
          const offlinePage = await caches.match("/offline.html");
          return offlinePage || new Response("Offline", { status: 503 });
        })
      );
      return;
    }

    // Public pages — don't intercept, let the browser handle normally
    if (
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname === "/support" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/user/public/") ||
      pathname.startsWith("/goals/shared/") ||
      pathname.startsWith("/api/")
    ) {
      return; // Let the browser handle it directly — no SW interference
    }

    // ── App pages: serve same-account cache INSTANTLY, revalidate behind ──
    // The 5-10s cold start was network-first waiting on a cold function +
    // Neon for every launch. Now any uid-matched copy paints immediately
    // and the network refresh happens in the background for next time.
    // No age cap: a stale shell is strictly better than a spinner —
    // chunks are content-hashed and live in the runtime caches, and page
    // client components refetch their data on mount anyway.
    // The cache key is the FULL URL (pathname+search) so ?date= variants
    // never collide — the stale copy served is always this exact URL's.
    event.respondWith(
      (async () => {
        const pageCache = await caches.open(PAGE_CACHE);
        const cacheKey = url.pathname + url.search;
        const uid = await requestUid();

        // Cached pages are stamped with the deploy's buildId (pulled from
        // the /_next/static/<build>/ chunk URLs inside the HTML). A stale
        // page served after a deploy references chunks that no longer
        // exist — the paint works but hydration dies ("dead buttons").
        // The stamp lets revalidation detect that and reload the client.
        const store = async (response) => {
          const body = await response.clone().text();
          const headers = new Headers(response.headers);
          headers.set("x-waqt-cached-at", String(Date.now()));
          const buildMatch = body.match(/\/_next\/static\/([A-Za-z0-9_-]+)\//);
          if (buildMatch) headers.set("x-waqt-build", buildMatch[1]);
          await pageCache.put(cacheKey, new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          }));
        };

        // Best page we can serve for this account, best-match first.
        const fallbackPage = async () => {
          const pathnameCached = await matchStampedPage(pageCache, pathname, uid);
          if (pathnameCached) return pathnameCached;
          for (const page of APP_PAGES) {
            const fallback = await matchStampedPage(pageCache, page, uid);
            if (fallback) return fallback;
          }
          return caches.match("/offline.html");
        };

        // Instant path — same-account copy of THIS url: paint now,
        // revalidate in the background.
        const cachedHit = await matchStampedPage(pageCache, cacheKey, uid);
        if (cachedHit) {
          event.waitUntil(
            (async () => {
              try {
                // preloadResponse honors the browser HTTP cache — a stale
                // cached document keeps its birth CSP forever, so we always
                // revalidate navigations no-store instead.
                const res = await timedFetch(request, 10000, true);
                if (res && res.ok) {
                  const freshBody = await res.clone().text();
                  const freshBuild = (freshBody.match(/\/_next\/static\/([A-Za-z0-9_-]+)\//) || [])[1];
                  const staleBuild = cachedHit.headers.get("x-waqt-build");
                  await store(res);
                  // Deploy shipped new chunks — the page we just served is
                  // running dead JS. Tell THIS client to reload into the
                  // fresh copy we just cached (client guards against loops).
                  if (freshBuild && freshBuild !== staleBuild) {
                    // Navigations set resultingClientId (the page being
                    // created), not clientId — clientId is empty here.
                    const cid = event.resultingClientId || event.clientId;
                    // The client is created as the response lands — retry a
                    // beat later if get() runs before registration completes.
                    for (let i = 0; i < 3 && cid; i++) {
                      const client = await self.clients.get(cid);
                      if (client) { client.postMessage({ type: "SW_RELOAD", build: freshBuild }); break; }
                      await new Promise((r) => setTimeout(r, 400));
                    }
                  }
                }
              } catch { /* offline — cached copy already served */ }
            })()
          );
          return cachedHit;
        }

        // No cached copy of this URL — race the network against a 2.5s
        // fallback budget. On "lie-fi" (flaky wifi) a fetch hangs with no
        // error to catch, so without the race the UI stalls the whole
        // timeout. The fetch keeps running after the timer wins and still
        // populates the cache for next time.
        const networkPromise = (async () => {
          try {
            const response = await timedFetch(request, 10000, true);
            if (response && response.ok) {
              await store(response);
              return response;
            }
            // Non-ok response (e.g. redirect to /login) — return as-is
            return response;
          } catch {
            return null;
          }
        })();
        // Keeps the fetch event alive until the network settles so the cache
        // write inside networkPromise can't be cut off mid-put — waitUntil
        // calls made after respondWith resolves can throw.
        event.waitUntil(networkPromise.catch(() => {}));

        const budgetPromise = new Promise((resolve) =>
          // No uid yet → first launch / logged out: keep waiting on the real
          // network rather than flashing the offline page on slow wifi.
          setTimeout(() => resolve(uid ? fallbackPage() : null), 2500)
        );

        const first = await Promise.race([networkPromise, budgetPromise]);
        if (first) return first;

        // Network won the race with nothing (null) or the budget resolved
        // to nothing — await whatever the network produces, then fall back.
        const netResult = await networkPromise;
        if (netResult) return netResult;

        const fallback = await fallbackPage();
        return fallback || new Response(
          "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Waqt — Offline</title><style>body{font-family:system-ui,sans-serif;background:#1a1815;color:#f5f0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}h1{font-size:18px;margin-bottom:8px}p{font-size:14px;opacity:0.7}button{margin-top:20px;padding:10px 24px;background:#f5f0e8;color:#1a1815;border:none;border-radius:8px;font-size:14px;cursor:pointer}</style></head><body><div><h1>You're offline</h1><p>Your cached data will appear when you reopen the app. Try again in a moment.</p><button onclick='location.reload()'>Retry</button></div></body></html>",
          { status: 200, headers: { "Content-Type": "text/html" } }
        );
      })()
    );
    return;
  }

  // ── Next.js RSC payload fetches (client-side navigation) ──
  // Every <Link>/router.push tap pays one of these — network-only was the
  // "tap → ~1s frozen → page switches" bug on mobile data. Strategy mirrors
  // app pages: a fresh-enough uid-stamped copy answers INSTANTLY while the
  // network revalidates; beyond the window the network gets a 1.2s budget
  // before the stale copy wins (lie-fi should degrade data freshness, never
  // freeze the tap). Proxy stamps x-waqt-uid on page-path requests, so the
  // same per-account gate applies here as for HTML.
  // Cache key strips _rsc (a per-request nonce — including it would shard
  // every entry and never hit) but keeps real params like ?date=.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RSC_CACHE);
        const params = new URLSearchParams(url.search);
        params.delete("_rsc");
        params.sort();
        // URLSearchParams.size needs iOS 17+ — toString() works everywhere.
        const qs = params.toString();
        const key = qs ? `${url.pathname}?${qs}` : url.pathname;
        const uid = await requestUid();

        const store = async (res) => {
          const body = await res.clone().text();
          const headers = new Headers(res.headers);
          headers.set("x-waqt-cached-at", String(Date.now()));
          await cache.put(key, new Response(body, { status: res.status, headers }));
        };

        const cached = await matchStampedPage(cache, key, uid);
        if (cached) {
          const age = Date.now() - Number(cached.headers.get("x-waqt-cached-at") || 0);
          // Under 2 min old — this is what the server would send anyway.
          if (age < 2 * 60 * 1000) {
            event.waitUntil(
              (async () => {
                try { const r = await timedFetch(request, 6000); if (r.ok) await store(r); } catch { /* keep cached */ }
              })()
            );
            return cached;
          }
        }

        const net = (async () => {
          try {
            const r = await timedFetch(request, 6000);
            if (r.ok) await store(r);
            return r;
          } catch { return null; }
        })();
        event.waitUntil(net.catch(() => {}));

        const budget = new Promise((resolve) =>
          setTimeout(() => resolve(uid ? cached : null), 1200)
        );
        const first = await Promise.race([net, budget]);
        if (first) return first;
        const netRes = await net;
        if (netRes) return netRes;
        // Offline — stale copy if we have one, else 503 so the client uses
        // cached HTML + IndexedDB.
        return cached || new Response("", { status: 503, headers: { "Content-Type": "text/x-component" } });
      })()
    );
    return;
  }

  // ── API GET requests (events, prayer-times, homework): stale-while-revalidate with TTL ──
  // Per-endpoint TTL prevents stale data from being served indefinitely.
  // The cachedAt timestamp is stored in a custom response header.
  if (url.pathname.startsWith("/api/") &&
      !((url.pathname === "/api/talks" || url.pathname === "/api/recite-clips") && url.searchParams.has("stream"))) {
    // TTL per endpoint (in ms). Prayer times change daily, events change frequently,
    // talks change rarely. Default 5 min for unknown endpoints.
    const API_TTL = (() => {
      if (url.pathname.startsWith("/api/prayer-times")) return 60 * 60 * 1000;      // 1 hour
      if (url.pathname.startsWith("/api/talks")) return 6 * 60 * 60 * 1000;        // 6 hours
      if (url.pathname.startsWith("/api/events")) return 60 * 1000;                // 1 minute
      if (url.pathname.startsWith("/api/homework")) return 2 * 60 * 1000;           // 2 minutes
      if (url.pathname.startsWith("/api/prayer-log")) return 60 * 1000;             // 1 minute
      return 5 * 60 * 1000;                                                          // 5 minutes default
    })();

    event.respondWith(
      (async () => {
        // Never serve cached private data to an unauthenticated request — the
        // API cache must not outlive the session it was fetched under. Cookie
        // headers are unreadable in a SW, so the flag lives in the meta store,
        // posted by the client at login (SET_SESSION) and cleared at logout.
        // (respondWith must be called synchronously, so the check lives here —
        // a missing flag passes the request straight to the network.)
        if (!(await hasSession())) {
          return timedFetch(request, 8000).catch(
            () => new Response(JSON.stringify({ error: "offline" }), {
              status: 503, headers: { "Content-Type": "application/json" },
            })
          );
        }
        // Client asked for fresh data (focus/mount revalidation) — skip the
        // cache entirely so cross-device changes land immediately.
        if (request.cache === "no-store") {
          return await timedFetch(request, 8000).catch(
            () => new Response(JSON.stringify({ error: "offline" }), {
              status: 503, headers: { "Content-Type": "application/json" },
            })
          );
        }
        const cache = await caches.open(API_CACHE);
        const uid = await requestUid();
        // Entries are stamped with the uid they were fetched under — an
        // expired session leaves no CLEAR_USER_CACHE, and without the stamp
        // the next account on this device would inherit private API data.
        let cached = await cache.match(request);
        if (cached && cached.headers.get("x-waqt-uid") !== uid) cached = null;
        if (cached) {
          const cachedAt = Number(cached.headers.get("x-waqt-cached-at") || 0);
          const age = Date.now() - cachedAt;
          // If cache is fresh, serve without revalidation
          if (age < API_TTL) return cached;
          // Stale — serve immediately but revalidate in background
          event.waitUntil(
            fetch(request)
              .then(async (response) => {
                if (response.ok) {
                  const body = await response.blob();
                  const headers = new Headers(response.headers);
                  headers.set("x-waqt-cached-at", String(Date.now()));
                  if (uid) headers.set("x-waqt-uid", uid);
                  const cachedRes = new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                  });
                  await cache.put(request, cachedRes);
                }
              })
              .catch(() => {})
          );
          return cached;
        }
        // No cache — try network. 8s cap: on a flaky connection a bare fetch
        // can hang 30s+, which reads as a frozen app; the 503 below lets the
        // caller fall back to IndexedDB instead.
        try {
          const response = await timedFetch(request, 8000);
          if (response.ok) {
            const body = await response.blob();
            const headers = new Headers(response.headers);
            headers.set("x-waqt-cached-at", String(Date.now()));
            if (uid) headers.set("x-waqt-uid", uid);
            const cachedRes = new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
            await cache.put(request, cachedRes.clone());
            return cachedRes;
          }
          return response;
        } catch {
          // No cache, no network — return empty JSON
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })()
    );
    return;
  }

  // ── Mushaf pages + qpc2 fonts are NOT intercepted here. They fetch
  // through the app's cachedAsset() which owns a single copy in the
  // quran-tester engine bucket — SW interception would duplicate ~90MB
  // into the runtime cache during the background warm.
  if (url.pathname.startsWith("/data/mushaf/") || url.pathname.startsWith("/fonts/qpc2/")) return;

  // ── Static assets: cache-first — same-origin only. Matching by extension
  // on any origin would stash third-party tiles/images/fonts (map tiles,
  // CDN assets) unboundedly and serve them stale forever. /worklets/ is here
  // too — it's precached but never matched before, so offline AudioWorklet
  // loads hit the network and failed ("worklet module script network error").
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/worklets/") ||
      // /data/ holds immutable statics (mushaf page JSON, ayah/surah
      // indexes) — offline mushaf loads failed without this branch and
      // left the recite engine unanchored.
      url.pathname.startsWith("/data/") ||
      url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/))
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await timedFetch(request, 6000);
          if (response.ok) {
            const responseClone = response.clone();
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(request, responseClone);
          }
          return response;
        } catch {
          return new Response("", { status: 503 });
        }
      })()
    );
    return;
  }

  // ── Audio requests from R2 (talks): cache-first with range support ──
  // R2 presigned URLs are long-lived (6 hours) and unique per talk.
  // We only serve from cache — we do NOT auto-cache on play.
  // Audio is cached only when the user explicitly downloads (saveAudioOffline).
  // This prevents unbounded storage growth from passive listening.
  // Range requests are sliced from the cached full response for iOS-compatible seeking.
  if (
    request.destination === "audio" ||
    (url.pathname === "/api/recite-clips" && url.searchParams.has("stream")) ||
    url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".m4a") ||
    url.pathname.endsWith(".aac") ||
    url.pathname.endsWith(".opus") ||
    url.pathname.endsWith(".ogg")
  ) {
    event.respondWith(
      (async () => {
        const audioCache = await caches.open(AUDIO_CACHE);

        // Try exact match first (handles re-requests of the same presigned URL)
        const exactMatch = await audioCache.match(request, { ignoreVary: true });
        if (exactMatch) {
          // Revalidate in background (presigned URLs expire — refresh the cache).
          // Request carries the player's Range header — a 206 partial response
          // must NOT overwrite the cached full file or the download is corrupted.
          event.waitUntil(
            fetch(request).then(async (response) => {
              if (response.status === 200) {
                await audioCache.put(request, response.clone());
              }
            }).catch(() => {})
          );
          return audioRangeResponse(request, exactMatch);
        }

        // Match the stable object identity when the URL shape differs — but
        // for /api/talks?stream= the stream param IS the identity; pathname
        // alone would serve whichever talk happens to be cached.
        const streamParam = (url.pathname === "/api/talks" || url.pathname === "/api/recite-clips")
          ? url.searchParams.get("stream") : null;
        const matchingKey = (await audioCache.keys()).find((key) => {
          const keyUrl = new URL(key.url);
          if (keyUrl.origin !== url.origin || keyUrl.pathname !== url.pathname) return false;
          if (streamParam !== null) return keyUrl.searchParams.get("stream") === streamParam;
          return true;
        });
        if (matchingKey) {
          const cached = await audioCache.match(matchingKey, { ignoreVary: true });
          if (cached) {
            event.waitUntil(
              fetch(request).then(async (response) => {
                if (response.ok && response.status === 200) {
                  await audioCache.put(request, response.clone());
                  if (matchingKey.url !== request.url) await audioCache.delete(matchingKey);
                }
              }).catch(() => {})
            );
            return audioRangeResponse(request, cached);
          }
        }

        // No cache — fetch from network but DO NOT cache.
        // Only explicit downloads (saveAudioOffline) add to the cache.
        // This prevents passive listening from filling storage.
        try {
          return await timedFetch(request, 15000);
        } catch {
          // Offline and no cache — return 503 so the player can show an error
          return new Response(null, {
            status: 503,
            headers: { "Content-Type": "audio/ogg" },
          });
        }
      })()
    );
    return;
  }

  // ── Everything else: let the browser handle it (no SW interception) ──
  // This is critical for fast client-side navigation — intercepting Next.js
  // RSC payload fetches adds overhead to every <Link> click.
});

// ─── Message handler ───
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION" && event.source) {
    event.source.postMessage({ type: "SW_VERSION", version: CACHE_VERSION });
  }

  // "Install app" — precache a route's HTML into PAGE_CACHE so it opens
  // offline. Keys match the navigate handler: pathname+search, uid-stamped.
  if (event.data?.type === "PRECACHE_ROUTES" && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const pageCache = await caches.open(PAGE_CACHE);
      const uid = await requestUid();
      for (const p of event.data.urls.slice(0, 30)) {
        try {
          const u = new URL(p, self.location.origin);
          if (u.origin !== self.location.origin) continue;
          const res = await fetch(u.href, { credentials: "same-origin" });
          if (!res.ok) continue;
          const body = await res.text();
          const headers = new Headers(res.headers);
          headers.set("x-waqt-cached-at", String(Date.now()));
          const b = body.match(/\/_next\/static\/([A-Za-z0-9_-]+)\//);
          if (b) headers.set("x-waqt-build", b[1]);
          if (!headers.get("x-waqt-uid") && uid) headers.set("x-waqt-uid", uid);
          await pageCache.put(u.pathname + u.search, new Response(body, { status: res.status, statusText: res.statusText, headers }));
        } catch { /* offline — install stays, page caches on next visit */ }
      }
    })());
  }

  // "Uninstall app" — drop its cached pages so it stops holding space.
  if (event.data?.type === "EVICT_ROUTES" && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const pageCache = await caches.open(PAGE_CACHE);
      const rscCache = await caches.open(RSC_CACHE);
      for (const p of event.data.urls.slice(0, 30)) {
        try {
          const u = new URL(p, self.location.origin);
          if (u.origin !== self.location.origin) continue;
          await pageCache.delete(u.pathname + u.search);
          await pageCache.delete(u.pathname);
          await rscCache.delete(u.pathname + u.search);
          await rscCache.delete(u.pathname);
        } catch { /* ignore */ }
      }
    })());
  }
  if (event.data && event.data.type === "SYNC_OUTBOX") {
    event.waitUntil(syncOutbox());
  }
  if (event.data && event.data.type === "GET_OUTBOX_COUNT") {
    event.waitUntil(broadcastOutboxCount());
  }
  if (event.data && event.data.type === "WARM_CACHE") {
    event.waitUntil(warmCache().catch(() => {}));
  }
  if (event.data && event.data.type === "CLEAR_API_CACHE") {
    // Clear API cache to prevent cross-user data leakage
    event.waitUntil(caches.delete(API_CACHE).catch(() => {}));
  }
  if (event.data && event.data.type === "INVALIDATE_API_PREFIX") {
    // Per-endpoint invalidation — delete only cache entries matching the prefix.
    // This avoids the global wipe that forces ALL cached API responses to be
    // re-downloaded on the next view. e.g. after an event write, only /api/events
    // entries are deleted, not /api/prayer-times, /api/homework, /api/talks, etc.
    const prefix = event.data.prefix || "";
    event.waitUntil(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const keys = await cache.keys();
        const toDelete = keys.filter((key) => {
          try {
            const u = new URL(key.url);
            return u.pathname.startsWith(prefix);
          } catch {
            return false;
          }
        });
        await Promise.all(toDelete.map((key) => cache.delete(key)));
      })()
    );
  }
  if (event.data && event.data.type === "SET_SESSION") {
    // Client posts the signed-in uid + a session flag (cookies are unreadable
    // in a SW). Persisted so stamp-matching + the API cache gate survive
    // service-worker restarts.
    const uid = typeof event.data.uid === "string" ? event.data.uid : null;
    event.waitUntil(
      (async () => {
        cachedUid = uid;
        cachedSession = !!uid;
        uidLoaded = true;
        sessionLoaded = true;
        if (uid) {
          await setMeta("uid", uid);
          await setMeta("hasSession", true);
        }
      })().catch(() => {})
    );
  }
  if (event.data && event.data.type === "CLEAR_USER_CACHE") {
    // Clear user-specific caches on logout (keep STATIC_CACHE — shared assets)
    // Note: AUDIO_CACHE is kept — offline talks are shared content, not user-specific
    cachedUid = null;
    cachedSession = false;
    event.waitUntil(
      Promise.all([
        caches.delete(API_CACHE).catch(() => {}),
        caches.delete(PAGE_CACHE).catch(() => {}),
        caches.delete(RSC_CACHE).catch(() => {}),
        caches.delete(RUNTIME_CACHE).catch(() => {}),
        setMeta("uid", null).catch(() => {}),
        setMeta("hasSession", false).catch(() => {}),
      ])
    );
  }
  if (event.data && event.data.type === "REMOVE_OUTBOX_ITEM") {
    // Remove a single queued write — e.g. the user deletes an event that was
    // created offline and hasn't synced yet. Matching is by tempId (queued
    // items carry it) or by exact url+method for member-path writes.
    event.waitUntil(
      (async () => {
        const { tempId, url: targetUrl, method: targetMethod } = event.data;
        const outbox = await getOutbox();
        for (const item of outbox) {
          if (tempId && item.tempId === tempId) {
            await removeFromOutbox(item.id);
            // Also remove dependent writes targeting the temp entity —
            // most PATCH/DELETE carry it in the url path, but collection
            // routes like /api/blocks pass it in the body instead.
            for (const dep of outbox) {
              if (dep.id !== item.id && (
                (typeof dep.url === "string" && dep.url.includes(tempId)) ||
                (dep.body && dep.body.id === tempId)
              )) {
                await removeFromOutbox(dep.id);
              }
            }
          } else if (targetUrl && item.url === targetUrl && item.method === targetMethod) {
            await removeFromOutbox(item.id);
          }
        }
        await broadcastOutboxCount();
      })().catch(() => {})
    );
  }
  if (event.data && event.data.type === "CLEAR_OUTBOX") {
    // Clear ONLY the offline outbox. User-scoped caches are handled by
    // CLEAR_USER_CACHE — deleting every cache here would wipe the static
    // app shell (breaking offline boot) and downloaded talk audio.
    event.waitUntil(
      (async () => {
        try {
          const db = await openDB();
          const tx = db.transaction(OUTBOX_STORE, "readwrite");
          tx.objectStore(OUTBOX_STORE).clear();
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
          });
          await broadcastOutboxCount();
        } catch {
          // non-critical
        }
      })()
    );
  }
});

// ─── Push notifications ───
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      try {
        data = { body: event.data.text() };
      } catch {
        data = {};
      }
    }
  }
  if (!data || typeof data !== "object") data = {};

  const silent = data.silent === true;
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "waqt-notification";
  // Senders place the deep-link at either `url` (top level) or `data.url` —
  // support both so taps always land on the right screen.
  const targetUrl = data.url ?? (data.data && data.data.url) ?? "/";

  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: data.icon || "/icon-192.png",
    // Status-bar badge is alpha-masked by Android — an opaque tile icon shows
    // as a white blob. icon-badge.png is transparent with the 5-band glyph.
    badge: data.badge || "/icon-badge.png",
    data: { ...(data.data && typeof data.data === "object" ? data.data : {}), url: targetUrl },
    tag,
    requireInteraction: data.requireInteraction === true,
    renotify: data.renotify === true && !!tag,
  };

  // vibrate and silent are mutually exclusive — silent wins
  if (silent) {
    options.silent = true;
  } else if (data.vibrate) {
    options.vibrate = data.vibrate;
  } else {
    // default prayer vibration pattern
    options.vibrate = [200, 100, 200];
  }

  // `sound` is in the spec but unsupported by major browsers today;
  // keep it harmless so future browsers can use it
  if (data.sound) options.sound = data.sound;

  // A push that ends without a visible notification makes Chrome show its own
  // generic "updated in the background" notification — blue Chrome icon with
  // an Unsubscribe action. Guarantee a branded notification twice: retry with
  // a minimal payload if the full options object throws.
  const title = typeof data.title === "string" && data.title.trim() ? data.title : "Waqt";
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() =>
      self.registration.showNotification("Waqt", {
        body: options.body,
        icon: "/icon-192.png",
        badge: "/icon-badge.png",
        data: { url: "/" },
        tag,
      }).catch(() => {})
    )
  );
});

// ─── Notification click ───
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus any existing app window and navigate it
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus().then((c) => {
            if ("navigate" in c) return c.navigate(targetUrl);
            return c;
          });
        }
      }
      // Open new window if none exist
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
