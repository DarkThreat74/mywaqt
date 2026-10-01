import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy (formerly Middleware in Next.js 15 and earlier).
 *
 * Used for optimistic auth checks — redirect unauthenticated users
 * away from app routes. Full session verification happens server-side
 * in each route/action (defense in depth).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('waqt-session')?.value;

  const protectedPaths = ['/calendar', '/settings', '/onboarding', '/prayer', '/goals', '/learn'];
  const authPaths = ['/login', '/signup'];

  const isProtected = protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Redirect to login if accessing protected route without session
  if (isProtected && !sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to calendar if accessing auth pages while already logged in
  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL('/calendar/day', request.url));
  }

  // Redirect to calendar if accessing the marketing page while already logged in
  if (pathname === '/' && sessionCookie) {
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
