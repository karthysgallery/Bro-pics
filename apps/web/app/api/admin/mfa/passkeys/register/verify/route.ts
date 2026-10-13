import { NextResponse } from 'next/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { finishRegistration, publicPasskey } from '../../../../../../../lib/security/admin-passkeys';
import { audit, mfaErrorResponse, verifiedStaff } from '../../../../../../../lib/security/mfa-route';

/** Step 2 of adding a fingerprint / Face ID: checks the signed answer and saves the device's public key. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await verifiedStaff(request);
  if (!who.ok) return who.response;
  const body = (await request.json().catch(() => null)) as { response?: RegistrationResponseJSON; name?: unknown } | null;
  if (!body?.response || typeof body.response !== 'object' || typeof body.response.id !== 'string') return adminApiError(400, 'invalid_request', 'The device did not answer. Try again.');
  try {
    const saved = await finishRegistration(who.db, who.uid, body.response, typeof body.name === 'string' ? body.name : '');
    await audit(who.db, who.uid, 'mfa.passkey_added', { deviceType: saved.deviceType });
    return NextResponse.json({ passkey: publicPasskey(saved) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
