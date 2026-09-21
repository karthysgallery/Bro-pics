import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';

// "Logout from all devices" — self-only, no target uid accepted from the
// body, so a caller can only ever revoke their OWN refresh tokens. A
// revoked refresh token doesn't invalidate an already-issued ID token until
// it expires on its own, so the caller's own client also signs out locally
// right after this succeeds (see the Privacy & Security button).
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  await getAuth(getAdminApp()).revokeRefreshTokens(userId);

  return NextResponse.json({ revoked: true }, { status: 200 });
}
