import type { NextResponse } from 'next/server';
import { confirmEnrolment, sessionWithProof } from '../../../../../../lib/security/admin-mfa';
import { audit, mfaErrorResponse, staffIdentity, withSession } from '../../../../../../lib/security/mfa-route';

/** Confirms the set-up with the first code from the app; returns the one-time recovery codes. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const { recoveryCodes, version } = await confirmEnrolment(who.db, who.uid, String(body?.code ?? ''));
    await audit(who.db, who.uid, 'mfa.enrolled');
    return withSession({ recoveryCodes }, sessionWithProof(request, who, version));
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
