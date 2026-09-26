import { NextResponse, type NextRequest } from 'next/server';

/**
 * [BE-34] Nonce-based CSP, Report-Only for now — the task's own two-phase
 * plan (Report-Only first, then enforce) exists because a CSP that's
 * wrong in a way you didn't anticipate takes the whole site down; this
 * session has no way to watch real traffic for violation reports before
 * flipping to enforce, so Report-Only is where this stays until someone
 * can. A per-request nonce (not 'unsafe-inline') is what lets Next.js's
 * own injected scripts run: Next.js reads the nonce out of this response's
 * CSP header automatically and applies it to every script IT injects — no
 * manual threading through layouts needed for that. The one exception is
 * apps/web/app/(shop)/product/[slug]/page.tsx's hand-written JSON-LD
 * <script> tag, which has no nonce yet; harmless under Report-Only, but
 * it would need one added before this ever flips to enforcing.
 *
 * frame-ancestors is CSP's own version of X-Frame-Options (next.config.ts
 * already sets X-Frame-Options for older browsers) — both are kept since
 * CSP is what modern browsers actually honor.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://storage.googleapis.com`,
    `font-src 'self'`,
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.razorpay.com`,
    `frame-src https://api.razorpay.com https://checkout.razorpay.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy-Report-Only', csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image-optimizer output — a CSP header on
    // those has no effect and this project already avoids unnecessary
    // middleware invocations elsewhere (see rate-limit.ts's own per-route
    // scoping).
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
