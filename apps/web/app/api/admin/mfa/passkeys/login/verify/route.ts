import type { NextResponse } from 'next/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { MfaError, sessionWithProof } from '../../../../../../../lib/security/admin-mfa';
import { finishLogin } from '../../../../../../../lib/security/admin-passkeys';
import { audit, mfaErrorResponse, staffIdentity, withSession } from '../../../../../../../lib/security/mfa-route';

/** Step 2: checks the signed answer and marks this browser verified for 12 hours, exactly as a correct code does. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;
  if (!body?.response || typeof body.response !== 'object' || typeof body.response.id !== 'string') return adminApiError(400, 'invalid_request', 'The device did not answer. Try again.');
  try {
    const result = await finishLogin(who.db, who.uid, body.response);
    await audit(who.db, who.uid, 'mfa.passkey_verified');
    return withSession({ ok: true }, sessionWithProof(request, who, result.version));
  } catch (err) {
    if (err instanceof MfaError) await audit(who.db, who.uid, 'mfa.passkey_failed');
    return mfaErrorResponse(err);
  }
}
