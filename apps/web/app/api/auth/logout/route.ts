import { NextResponse } from 'next/server';
import {
  getSessionFromRequest,
  clearSessionCookie,
} from '../../../../lib/services/session';
import { logAuthEvent } from '../../../../lib/services/auth-audit';
import { maskPhoneNumber } from '../../../../lib/services/whatsapp/otp-store';

export async function POST(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);

  if (session) {
    await logAuthEvent({
      event: 'otp_verified',
      phoneNumberMasked: maskPhoneNumber(session.phone),
      userId: session.userId,
      request,
      details: { action: 'logout' },
    });
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  clearSessionCookie(response);
  return response;
}
