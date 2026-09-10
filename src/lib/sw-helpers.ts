/**
 * Tell the service worker to clear the API cache.
 * Call this after any successful API write (POST/PATCH/PUT/DELETE)
 * so the next GET fetches fresh data instead of serving stale cache.
 *
 * NOTE: This wipes the ENTIRE API cache, forcing all cached endpoints to
 * re-download. Prefer `invalidateApiCache(prefix)` for targeted invalidation.
 */
export function clearApiCache() {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
  }
}

/**
 * Invalidate only API cache entries matching a path prefix.
 * This is much more efficient than `clearApiCache()` — after an event write,
 * only `/api/events` entries are deleted, not `/api/prayer-times`,
 * `/api/homework`, `/api/talks`, etc.
 *
 * @param prefix - The API path prefix to invalidate, e.g. "/api/events"
 */
export function invalidateApiCache(prefix: string) {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "INVALIDATE_API_PREFIX",
      prefix,
    });
  }
}
