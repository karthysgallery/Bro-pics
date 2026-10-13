import { NextResponse } from 'next/server';
import { beginLogin } from '../../../../../../../lib/security/admin-passkeys';
import { mfaErrorResponse, staffIdentity } from '../../../../../../../lib/security/mfa-route';

/** Step 1 of signing in with a fingerprint / Face ID: the challenge to sign. Runs after the password sign-in. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  try {
    return NextResponse.json(await beginLogin(who.db, request, who.uid), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
