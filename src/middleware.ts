import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import {
  canAccessRoute,
  getHomeRouteForRole,
  isProtectedRoute,
  type AppRole,
} from '@/lib/auth/policy';
import {
  SESSION_AUDIENCE,
  SESSION_COOKIE_NAME,
  SESSION_ISSUER,
  getEncodedSessionSecret,
  isSignedSessionClaims,
} from '@/lib/auth/session-token';

const STATIC_ASSET_PATTERN = /\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|webp|woff2?|ttf)$/i;

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );
  return response;
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  return withSecurityHeaders(
    NextResponse.redirect(new URL(pathname, request.url))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    STATIC_ASSET_PATTERN.test(pathname)
  ) {
    return withSecurityHeaders(NextResponse.next());
  }

  let userRole: AppRole | null = null;
  let mustChangePwd = false;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getEncodedSessionSecret(), {
        algorithms: ['HS256'],
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE,
      });
      if (!isSignedSessionClaims(payload)) {
        throw new Error('Invalid session payload');
      }
      userRole = payload.role;
      mustChangePwd = payload.mustChangePwd;
    } catch {
      const response = redirectTo(request, '/login');
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  if (isProtectedRoute(pathname) && !userRole) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the complete local destination (including a selected plan) so
    // authentication returns a customer to the action they started. The login
    // action independently validates this callback before redirecting.
    loginUrl.searchParams.set('callback', `${pathname}${request.nextUrl.search}`);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (userRole) {
    if (
      mustChangePwd &&
      isProtectedRoute(pathname) &&
      pathname !== '/account/profile'
    ) {
      return redirectTo(request, '/account/profile?change_password=true');
    }

    if (!canAccessRoute(userRole, pathname)) {
      return redirectTo(request, getHomeRouteForRole(userRole));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!api/public|_next/static|_next/image|favicon.ico).*)'],
};
