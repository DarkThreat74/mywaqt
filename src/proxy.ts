import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Proxy (formerly Middleware in Next.js 15 and earlier).
 *
 * Used for optimistic auth checks — redirect unauthenticated users
 * away from app routes. Full session verification happens server-side
 * in each route/action (defense in depth).
 *
 * IMPORTANT: the session cookie is JWT-verified here, not just checked
 * for presence. A cookie that exists but fails signature verification
 * (secret rotation, tampering) previously caused an infinite loop:
 *   /calendar → layout getSession()=null → /login
 *   /login    → proxy sees cookie       → /calendar → ERR_TOO_MANY_REDIRECTS.
 * Invalid cookies are stripped in the redirect response so the browser
 * stops carrying the dead token. Sessions revoked server-side
 * (sessionsValidAfter — needs DB, can't run here) are handled by the
 * (app) layout redirecting through /api/auth/logout, which clears the
 * cookie on the way to /login.
 */

// Can't import @/lib/env (marked server-only — unsupported in the proxy
// bundle). SESSION_SECRET read directly; same fail-closed rule applies.
const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET ?? '');

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('waqt-session')?.value;
  if (!token || encodedKey.length === 0) return false;
  try {
    await jwtVerify(token, encodedKey, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = !!request.cookies.get('waqt-session')?.value;
  const validSession = await hasValidSession(request);

  const protectedPaths = ['/calendar', '/settings', '/onboarding', '/prayer', '/goals', '/learn'];
  const authPaths = ['/login', '/signup'];

  const isProtected = protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Redirect to login if accessing protected route without a valid session
  if (isProtected && !validSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const res = NextResponse.redirect(loginUrl);
    if (hasCookie) {
      res.cookies.delete('waqt-session');
      res.cookies.delete('waqt-uid');
    }
    return res;
  }

  // Auth pages while logged in → calendar. A dead cookie must NOT bounce
  // (that was the loop) — strip it and let the login form render.
  if (isAuthPage) {
    if (validSession) {
      return NextResponse.redirect(new URL('/calendar/day', request.url));
    }
    if (hasCookie) {
      const res = NextResponse.next();
      res.cookies.delete('waqt-session');
      res.cookies.delete('waqt-uid');
      return res;
    }
  }

  // Redirect to calendar if accessing the marketing page while already logged in
  if (pathname === '/' && validSession) {
    return NextResponse.redirect(new URL('/calendar/day', request.url));
  }

  // Stamp HTML responses with the account they were rendered for, so the
  // service worker's page cache can refuse to serve one user's pages to a
  // different account (offline cold-start after an account switch). The uid
  // cookie is set alongside the session cookie at login and cleared at
  // logout; a forged value only causes the SW to serve that same user's own
  // cached pages, never another's.
  const uid = request.cookies.get('waqt-uid')?.value;
  const res = NextResponse.next();
  if (uid) res.headers.set('x-waqt-uid', uid);
  // Deploy stamp — the service worker can't read a real buildId out of App
  // Router chunk URLs (filenames hash content, not the build), so it can't
  // tell a stale cached page apart from a fresh one. Give it the deploy id
  // as a header; cached pages/RSC entries store it as x-waqt-build and a
  // mismatch triggers a client reload into the new build.
  const build = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID;
  if (build) res.headers.set('x-waqt-build', build);
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (static assets)
     * - favicon.ico, robots.txt, manifest, sw.js
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|sw.js|api).*)',
  ],
};
