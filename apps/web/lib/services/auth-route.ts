import { NextResponse } from 'next/server';

/**
 * Wraps an auth route handler so a backend/config failure (Firestore or
 * Firebase Auth down, OTP provider or SESSION_SECRET not configured in
 * production) comes back as a clear JSON 503 the sign-in UI can show,
 * instead of Next's opaque HTML 500. The cause is logged server-side only —
 * never echoed to the client.
 */
export function withAuthErrors(handler: (request: Request) => Promise<NextResponse>) {
  return async function wrapped(request: Request): Promise<NextResponse> {
    try {
      return await handler(request);
    } catch (err) {
      console.error('[auth] route failed:', err);
      return NextResponse.json(
        { error: 'Sign-in is temporarily unavailable. Please try again shortly.', code: 'auth_unavailable' },
        { status: 503 }
      );
    }
  };
}
