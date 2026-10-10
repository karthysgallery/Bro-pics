import { NextResponse } from 'next/server';
import { hasMfaProof, readMfa } from '../../../../lib/security/admin-mfa';
import { staffIdentity } from '../../../../lib/security/mfa-route';

/** Where this staff account is in the authenticator step: not set up, set up but not verified here, or verified. */
export async function GET(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  const rec = await readMfa(who.db, who.uid);
  return NextResponse.json(
    {
      enrolled: Boolean(rec?.secret),
      verified: Boolean(rec?.secret) && (await hasMfaProof(who.db, request, who.uid)),
      lockedUntil: rec?.lockedUntil && Date.parse(rec.lockedUntil) > Date.now() ? rec.lockedUntil : null,
      recoveryLeft: rec?.recovery?.length ?? 0,
      account: who.account,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
