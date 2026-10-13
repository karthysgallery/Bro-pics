import { NextResponse } from 'next/server';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { removePasskey } from '../../../../../../lib/security/admin-passkeys';
import { audit, mfaErrorResponse, verifiedStaff } from '../../../../../../lib/security/mfa-route';

/** Removes one of the signed-in account's own fingerprint / Face ID entries. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const who = await verifiedStaff(request);
  if (!who.ok) return who.response;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(id)) return adminApiError(400, 'invalid_request', 'That device is not valid.');
  try {
    if (!(await removePasskey(who.db, who.uid, id))) return adminApiError(404, 'not_found', 'That device is already removed.');
    await audit(who.db, who.uid, 'mfa.passkey_removed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
