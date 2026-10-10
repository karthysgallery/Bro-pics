import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { startEnrolment } from '../../../../../lib/security/admin-mfa';
import { audit, mfaErrorResponse, staffIdentity } from '../../../../../lib/security/mfa-route';

/** Starts setting up the authenticator app: a QR code (and the key to type in by hand). Shown once. */
export async function POST(request: Request): Promise<NextResponse> {
  const who = await staffIdentity(request);
  if (!who.ok) return who.response;
  try {
    const { secret, uri } = await startEnrolment(who.db, who.uid, who.account);
    // An image (PNG data URL), not markup: the page shows it in an <img>, never as HTML.
    const qrImage = await QRCode.toDataURL(uri, { margin: 2, width: 512, errorCorrectionLevel: 'M' });
    await audit(who.db, who.uid, 'mfa.enrolment_started');
    return NextResponse.json({ qrImage, secret: secret.replace(/(.{4})/g, '$1 ').trim(), account: who.account }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mfaErrorResponse(err);
  }
}
