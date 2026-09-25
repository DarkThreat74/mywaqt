import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { db, schema } from '@/lib/db/client';
import type { User } from '@/lib/db/schema';

const SESSION_COOKIE = 'waqt-session';
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

const encodedKey = new TextEncoder().encode(env.sessionSecret);

export interface SessionPayload {
  userId: string;
  email: string;
  [key: string]: unknown;
}

/**
 * Create a signed JWT session token.
 */
export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(encodedKey);
}

/**
 * Verify and decode a JWT session token.
 */
export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie after successful login/signup.
 */
export async function setSessionCookie(user: Pick<User, 'id' | 'email'>): Promise<void> {
  const token = await encryptSession({ userId: user.id, email: user.email });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * A valid signature isn't enough — a JWT stays valid after the user resets
 * their password or their account is otherwise revoked. `sessionsValidAfter`
 * on the user row is a cutoff: tokens issued before it are rejected.
 * One indexed PK lookup per authenticated request.
 */
/**
 * Cached sessionsValidAfter lookup — one row read per userId, cached 60s.
 * Password reset revalidates the `sva-${userId}` tag so revocation is still
 * immediate. Removes a Neon round-trip from every authed request/navigation.
 */
const DELETION_GRACE_MS = 5 * 60 * 60 * 1000;

const getSessionValidity = (userId: string) =>
  unstable_cache(
    async () => {
      const [u] = await db
        .select({
          sessionsValidAfter: schema.users.sessionsValidAfter,
          deletionScheduledAt: schema.users.deletionScheduledAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!u) return { validAfter: -1 as const, deletesAt: null };
      return {
        validAfter: u.sessionsValidAfter?.getTime() ?? null,
        deletesAt: u.deletionScheduledAt
          ? u.deletionScheduledAt.getTime() + DELETION_GRACE_MS
          : null,
      };
    },
    ['sva', userId],
    { revalidate: 60, tags: [`sva-${userId}`] }
  )();

async function isSessionActive(payload: SessionPayload): Promise<boolean> {
  try {
    const { validAfter, deletesAt } = await getSessionValidity(payload.userId);
    // Scheduled deletion's grace window has passed — purge the account now.
    // The cron sweep also does this, but lazily here guarantees ~5h even
    // between daily cron runs.
    if (deletesAt !== null && Date.now() >= deletesAt) {
      await db.delete(schema.users).where(eq(schema.users.id, payload.userId)).catch(() => {});
      return false;
    }
    if (validAfter === -1) return false;
    if (validAfter === null) return true;
    const issuedAtMs = typeof payload.iat === 'number' ? payload.iat * 1000 : 0;
    return issuedAtMs >= validAfter;
  } catch {
    // DB unreachable — treat the cryptographically-valid token as active
    // rather than logging every user out on a transient error.
    return true;
  }
}

/**
 * Get the current session payload from the cookie.
 * Returns null if not authenticated or token invalid.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await decryptSession(token);
  if (!payload || !(await isSessionActive(payload))) return null;
  return payload;
}

/**
 * Get the session from a NextRequest's Cookie header.
 * Use this in Route Handlers where cookies() from next/headers
 * may not reliably read the request cookies.
 */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await decryptSession(token);
  if (!payload || !(await isSessionActive(payload))) return null;
  return payload;
}

/**
 * Get the current authenticated user ID.
 * Throws if not authenticated — use in protected routes/actions.
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}
