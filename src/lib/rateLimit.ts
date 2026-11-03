/**
 * IP-based rate limiting with secure IP extraction.
 * In-memory fixed-window algorithm.
 * See CODEBASE_PATTERNS.md §30 (Rate Limiting — The Complete Method).
 *
 * NOTE: In-memory storage resets on serverless cold starts. For auth endpoints,
 * add a DB-backed lockout as a second layer (defense in depth).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMaps = new Map<string, Map<string, RateLimitEntry>>();

// Prune expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const map of rateLimitMaps.values()) {
      for (const [key, entry] of map) {
        if (now >= entry.resetAt) map.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Extract the client IP securely.
 * Prioritizes infrastructure-set headers over client-controlled ones.
 * Uses the LAST value in X-Forwarded-For (set by trusted proxy), NOT the first
 * (which clients can spoof).
 */
export function getClientIp(headers: Headers): string {
  // 1. Vercel's dedicated IP header — cannot be spoofed
  const vercelIp = headers.get('x-vercel-ip');
  if (vercelIp) return vercelIp.trim();

  // 2. x-real-ip — set by trusted reverse proxies
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // 3. X-Forwarded-For — take the LAST value (set by our trusted proxy)
  // The first value is client-controllable and spoofable.
  // The last value is appended by the trusted reverse proxy and is reliable.
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return 'unknown';
}

/**
 * Check if a request is allowed under the rate limit.
 * Returns true if allowed, false if rate-limited.
 *
 * @param namespace - Logical group (e.g. 'login', 'signup', 'api-events')
 * @param key - Usually IP address, or user ID for authenticated endpoints
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  let map = rateLimitMaps.get(namespace);
  if (!map) {
    map = new Map();
    rateLimitMaps.set(namespace, map);
  }

  const compositeKey = `${namespace}:${key}`;
  const now = Date.now();
  const entry = map.get(compositeKey);

  if (entry && now < entry.resetAt) {
    if (entry.count >= maxRequests) return false;
    entry.count++;
  } else {
    map.set(compositeKey, { count: 1, resetAt: now + windowMs });
  }

  return true;
}

/**
 * Durable variant — counts in Upstash Redis over REST so limits survive
 * serverless cold starts. Falls back to the in-memory check when the env vars
 * aren't set or the call fails (rate limiting should fail open for availability).
 * Use on security-sensitive namespaces: auth, token issuance, share links.
 */
export async function checkRateLimitAsync(
  namespace: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return checkRateLimit(namespace, key, maxRequests, windowMs);
  try {
    const redisKey = `rl:${namespace}:${key}`;
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", redisKey], ["PEXPIRE", redisKey, String(windowMs), "NX"]]),
    });
    if (!res.ok) return checkRateLimit(namespace, key, maxRequests, windowMs);
    const json = await res.json() as Array<{ result: number }>;
    return (json[0]?.result ?? 0) <= maxRequests;
  } catch {
    return checkRateLimit(namespace, key, maxRequests, windowMs);
  }
}
