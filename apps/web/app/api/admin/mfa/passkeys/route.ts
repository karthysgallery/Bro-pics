import { NextResponse } from 'next/server';
import { mfaErrorResponse, verifiedStaff } from '../../../../../lib/security/mfa-route';
import { publicPasskey } from '../../../../../lib/security/admin-passkeys';
import { listPasskeys } from '../../../../../lib/security/passkey-store';

/** The fingerprint / Face ID entries of the signed-in account (names and dates only, never the keys). */
export async function GET(request: Request): Promise<NextResponse> {
  const who = await verifiedStaff(request);
  if (!who.ok) return who.response;
  try {
    return NextResponse.json({ passkeys: (await listPasskeys(who.db, who.uid)).map(publicPasskey) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
