/**
 * Waqt Service Worker
 * 
 * Strategy:
 * - Precache the app shell on install
 * - Network-first for navigation requests (always get fresh HTML when online, cache only when offline)
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

const CACHE_VERSION = "waqt-v36";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const AUDIO_CACHE = "waqt-audio";
// AUDIO_CACHE stores talk MP3s for offline playback.
// It is intentionally not cleaned on logout (talks are shared content).

// App shell — the minimal set of files for offline boot
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/offline.html",
];

// All authenticated app pages — prefetched and cached for offline use.
// These are force-dynamic (server-rendered per user), but we cache the
// HTML so the app shell loads instantly offline. The client components
// then hydrate from IndexedDB cached data.
const APP_PAGES = [
  "/calendar/day",
  "/calendar/month",
  "/prayer",
  "/homework",
  "/goals",
  "/settings",
  "/learn",
  "/onboarding",
  "/qibla",
  "/dhikr",
  "/sadaqah",
  "/names",
  "/talks",
];

// ─── IndexedDB helpers for offline event outbox ───
const DB_NAME = "waqt-offline";
const DB_VERSION = 1;
const OUTBOX_STORE = "event-outbox";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToOutbox(operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.add({ ...operation, timestamp: Date.now() });
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

    for (const item of outbox) {
      try {
        // Add _offlineTimestamp to the body so the server can check windows
        // against when the action was originally performed, not sync time
        const bodyToSend = item.body
          ? JSON.stringify({ ...item.body, _offlineTimestamp: item.timestamp })
          : undefined;

        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers || { "Content-Type": "application/json" },
          body: bodyToSend,
          credentials: "include",
        });

        if (res.ok) {
          await removeFromOutbox(item.id);
          syncedCount++;
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
          // Server error — leave in outbox for retry, don't delete
          continue;
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
        // Network error on this item — leave it in the outbox for next sync
        continue;
      }
    }

    // Notify client that sync is complete so it can refetch fresh data
    if (syncedCount > 0) {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "EVENT_SYNCED", count: syncedCount }));
    }
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
  // Warm cache in background — keep SW alive until it finishes
  event.waitUntil(
    warmCache().catch(() => {})
  );
});

// ─── Enable navigation preload for instant page loads ───
// This lets the browser start fetching the navigation request while the
// SW is still booting up, making page loads significantly faster.
if ("navigationPreload" in self.registration) {
  self.registration.navigationPreload.enable();
}

// ─── Activate: clear old caches, claim clients ───
self.addEventListener("activate", (event) => {
  const validCaches = [STATIC_CACHE, RUNTIME_CACHE, API_CACHE, PAGE_CACHE, AUDIO_CACHE];

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
  const buffer = await response.arrayBuffer();
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
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const responseClone = response.clone();
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, responseClone);
          }
          return response;
        } catch {
          // Offline and no cache — return a 200 no-op response so the browser
          // doesn't surface a 503 that breaks hydration. Use the correct MIME
          // type based on the file extension.
          if (url.pathname.endsWith(".css")) {
            return new Response("", {
              status: 200,
              headers: { "Content-Type": "text/css" },
            });
          } else if (url.pathname.endsWith(".js")) {
            return new Response("/* offline */", {
              status: 200,
              headers: { "Content-Type": "application/javascript" },
            });
          } else {
            return new Response("", {
              status: 200,
              headers: { "Content-Type": "application/octet-stream" },
            });
          }
        }
      })()
    );
    return;
  }

  // ── Skip other _next/ requests (HMR, RSC payloads, etc.) ──
  // These are dev-only or client-navigation internals — don't intercept.
  if (url.pathname.startsWith("/_next/")) return;

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
    !url.pathname.startsWith("/api/prayer-times/sync")
  ) {
    // Clone the request body before consuming it
    const bodyPromise = request.clone().json().catch(() => null);

    event.respondWith(
      (async () => {
        try {
          // Try online first
          const response = await fetch(request);
          return response;
        } catch {
          // Offline — store in outbox for later sync
          const body = await bodyPromise;
          const tempId = "offline-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
          await addToOutbox({
            method: request.method,
            url: request.url,
            pathname: url.pathname,
            body: body,
            headers: { "Content-Type": "application/json" },
            tempId: tempId,
          });

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

  // Don't intercept cron API
  if (url.pathname.startsWith("/api/cron/")) return;

  // ── Navigation requests: stale-while-revalidate ──
  // Serve cached HTML instantly (offline-first), then update in background.
  // This is critical for offline: the app shell loads immediately from cache
  // and client components hydrate from IndexedDB data.
  if (request.mode === "navigate") {
    const pathname = url.pathname;

    // When offline and navigating to "/", redirect to the cached calendar
    if (pathname === "/") {
      event.respondWith(
        (async () => {
          // Try network first for "/" (landing page may have changed)
          try {
            const response = await fetch(request);
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
            return response;
          } catch {
            // Offline — serve cached calendar (the app shell)
            const pageCache = await caches.open(PAGE_CACHE);
            const calendarCached = await pageCache.match("/calendar/day");
            if (calendarCached) return calendarCached;
            const runtimeCached = await caches.match("/calendar/day");
            if (runtimeCached) return runtimeCached;
            // Fallback to any cached page
            const anyCached = await caches.match(request);
            return anyCached || new Response(
              "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Waqt — Offline</title><style>body{font-family:system-ui,sans-serif;background:#f5f0e8;color:#1a1815;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}h1{font-size:18px;margin-bottom:8px}p{font-size:14px;opacity:0.7}</style></head><body><div><h1>You're offline</h1><p>Open the app again once you're back online to reload cached pages.</p></div></body></html>",
              { status: 200, headers: { "Content-Type": "text/html" } }
            );
          }
        })()
      );
      return;
    }

    // Public pages — don't intercept, let the browser handle normally
    if (
      pathname === "/login" ||
      pathname === "/signup" ||
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

    // ── App pages: network-first (try network, fall back to cache when offline) ──
    // CRITICAL: This MUST be network-first, not stale-while-revalidate.
    // Pages like /calendar/day?date=2024-01-07 are force-dynamic — the server
    // renders different HTML for each query string. If we serve cached HTML
    // (keyed by pathname only, ignoring the query string), navigating to a
    // different day serves the WRONG cached page. Network-first ensures the
    // user always gets fresh HTML when online, and only falls back to cache
    // when truly offline.
    //
    // The cache key is the FULL URL (including query string) so that each
    // date variant gets its own cached entry for offline use.
    event.respondWith(
      (async () => {
        const pageCache = await caches.open(PAGE_CACHE);
        // Use the full URL (with query string) as the cache key so different
        // dates don't collide. For URLs without query strings, this is just
        // the pathname — same as before.
        const cacheKey = url.pathname + url.search;

        // Try network first (use navigation preload if available)
        try {
          const preloadResponse = await event.preloadResponse;
          const response = preloadResponse || await fetch(request);
          if (response && response.ok) {
            // Cache the fresh HTML (keyed by full URL) for offline use
            const body = await response.blob();
            const headers = new Headers(response.headers);
            headers.set("x-waqt-cached-at", String(Date.now()));
            const cachedRes = new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
            await pageCache.put(cacheKey, cachedRes.clone());
            return cachedRes;
          }
          // Non-ok response (e.g. redirect to /login) — return as-is
          return response || new Response("Offline", { status: 503 });
        } catch {
          // Network failed — fall back to cache (keyed by full URL)
          const cached = await pageCache.match(cacheKey);
          if (cached) return cached;

          // No exact cache match — try pathname-only match (for pages without
          // query strings that were cached by older SW versions)
          const pathnameCached = await pageCache.match(pathname);
          if (pathnameCached) return pathnameCached;

          // No cache at all — serve any cached app page as fallback
          for (const fallbackPage of APP_PAGES) {
            const fallback = await pageCache.match(fallbackPage);
            if (fallback) return fallback;
          }
          // Last resort — serve the offline page from precache
          const offlinePage = await caches.match("/offline.html");
          return offlinePage || new Response(
            "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Waqt — Offline</title><style>body{font-family:system-ui,sans-serif;background:#1a1815;color:#f5f0e8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}h1{font-size:18px;margin-bottom:8px}p{font-size:14px;opacity:0.7}button{margin-top:20px;padding:10px 24px;background:#f5f0e8;color:#1a1815;border:none;border-radius:8px;font-size:14px;cursor:pointer}</style></head><body><div><h1>You're offline</h1><p>Your cached data will appear when you reopen the app. Try again in a moment.</p><button onclick='location.reload()'>Retry</button></div></body></html>",
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
      })()
    );
    return;
  }

  // ── Next.js RSC payload fetches (client-side navigation) ──
  // RSC/Flight payloads are tied to the build ID and session — caching them
  // manually causes stale/mismatched data and infinite loading on soft
  // navigations. Use NetworkOnly; when offline, return 503 so the client
  // falls back to the cached HTML shell + IndexedDB data.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          return response;
        } catch {
          // Offline — return 503 so the client uses cached HTML + IndexedDB
          return new Response("", { status: 503, headers: { "Content-Type": "text/x-component" } });
        }
      })()
    );
    return;
  }

  // ── API GET requests (events, prayer-times, homework): stale-while-revalidate ──
  if (url.pathname.startsWith("/api/") && !(url.pathname === "/api/talks" && url.searchParams.has("stream"))) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          // Revalidate in background — keep SW alive during cache write
          event.waitUntil(
            fetch(request)
              .then(async (response) => {
                if (response.ok) {
                  const responseClone = response.clone();
                  const cache = await caches.open(API_CACHE);
                  await cache.put(request, responseClone);
                }
              })
              .catch(() => {})
          );
          return cached;
        }
        // No cache — try network
        try {
          const response = await fetch(request);
          if (response.ok) {
            const responseClone = response.clone();
            const cache = await caches.open(API_CACHE);
            await cache.put(request, responseClone);
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

  // ── Static assets: cache-first ──
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/)
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
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
  // R2 presigned URLs are long-lived (1 hour) and unique per talk.
  // We cache the full response so offline playback + seeking works.
  // Range requests are sliced from the cached full response for iOS-compatible seeking.
  if (
    request.destination === "audio" ||
    url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".m4a") ||
    url.pathname.endsWith(".aac")
  ) {
    event.respondWith(
      (async () => {
        const audioCache = await caches.open(AUDIO_CACHE);

        // Try exact match first (handles re-requests of the same presigned URL)
        const exactMatch = await audioCache.match(request, { ignoreVary: true });
        if (exactMatch) {
          // Revalidate in background (presigned URLs expire — refresh the cache)
          event.waitUntil(
            fetch(request).then(async (response) => {
              if (response.ok) {
                await audioCache.put(request, response.clone());
              }
            }).catch(() => {})
          );
          return audioRangeResponse(request, exactMatch);
        }

        // Match the stable R2 object path when the presigned query string rotates.
        const matchingKey = (await audioCache.keys()).find((key) => {
          const keyUrl = new URL(key.url);
          return keyUrl.origin === url.origin && keyUrl.pathname === url.pathname;
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

        // No cache — fetch from network and cache
        try {
          const response = await fetch(request);
          if (response.ok && response.status === 200) {
            // Only cache full responses (not partial 206s — they're incomplete)
            await audioCache.put(request, response.clone());
          }
          return response;
        } catch {
          // Offline and no cache — return 503 so the player can show an error
          return new Response(null, {
            status: 503,
            headers: { "Content-Type": "audio/mpeg" },
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
  if (event.data && event.data.type === "SYNC_OUTBOX") {
    event.waitUntil(syncOutbox());
  }
  if (event.data && event.data.type === "WARM_CACHE") {
    event.waitUntil(warmCache().catch(() => {}));
  }
  if (event.data && event.data.type === "CLEAR_API_CACHE") {
    // Clear API cache to prevent cross-user data leakage
    event.waitUntil(caches.delete(API_CACHE).catch(() => {}));
  }
  if (event.data && event.data.type === "CLEAR_USER_CACHE") {
    // Clear user-specific caches on logout (keep STATIC_CACHE — shared assets)
    // Note: AUDIO_CACHE is kept — offline talks are shared content, not user-specific
    event.waitUntil(
      Promise.all([
        caches.delete(API_CACHE).catch(() => {}),
        caches.delete(PAGE_CACHE).catch(() => {}),
        caches.delete(RUNTIME_CACHE).catch(() => {}),
      ])
    );
  }
  if (event.data && event.data.type === "CLEAR_OUTBOX") {
    // Clear the offline outbox + all caches to prevent cross-user data leakage
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
        } catch {
          // non-critical
        }
        // Also clear all caches (page cache may contain user-specific HTML)
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      })()
    );
  }
});

// ─── Push notifications ───
self.addEventListener("push", (event) => {
  let data = { title: "Waqt", body: "Time to pray" };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Waqt", body: event.data.text() };
    }
  }

  const silent = data.silent === true;
  const tag = data.tag || "waqt-notification";

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: data.data || { url: "/" },
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

  event.waitUntil(self.registration.showNotification(data.title, options));
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
