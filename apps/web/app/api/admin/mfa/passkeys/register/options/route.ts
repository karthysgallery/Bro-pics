import { NextResponse } from 'next/server';
import { beginRegistration } from '../../../../../../../lib/security/admin-passkeys';
import { mfaErrorResponse, verifiedStaff } from '../../../../../../../lib/security/mfa-route';

/** Step 1 of adding a fingerprint / Face ID: the challenge the device will sign. Needs the authenticator step done. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await verifiedStaff(request);
  if (!who.ok) return who.response;
  try {
    return NextResponse.json(await beginRegistration(who.db, request, who.uid, who.account), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
