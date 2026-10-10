import type { NextResponse } from 'next/server';
import { MfaError, sessionWithProof, verifyCode } from '../../../../../lib/security/admin-mfa';
import { audit, mfaErrorResponse, staffIdentity, withSession } from '../../../../../lib/security/mfa-route';

/** Checks the 6-digit code (or a recovery code) and marks this browser verified for 12 hours. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const result = await verifyCode(who.db, who.uid, String(body?.code ?? ''));
    await audit(who.db, who.uid, result.usedRecovery ? 'mfa.recovery_code_used' : 'mfa.verified', result.usedRecovery ? { recoveryLeft: result.recoveryLeft } : {});
    return withSession({ ok: true, usedRecovery: result.usedRecovery, recoveryLeft: result.recoveryLeft }, sessionWithProof(request, who, result.version));
  } catch (err) {
    if (err instanceof MfaError) await audit(who.db, who.uid, err.status === 423 ? 'mfa.locked' : 'mfa.failed');
    return mfaErrorResponse(err);
  }
}
