import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { withAuthErrors } from '../../../../lib/services/auth-route';
import { getWhatsAppOtpProvider } from '../../../../lib/services/whatsapp/provider-factory';
import {
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
} from '../../../../lib/services/whatsapp/otp-store';
import { logAuthEvent } from '../../../../lib/services/auth-audit';

async function handlePost(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { phone?: string; purpose?: 'login' | 'register' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { phone, purpose = 'login' } = body;
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Please enter a valid WhatsApp mobile number.' }, { status: 400 });
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeIndianPhoneNumber(phone);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Please enter a valid 10-digit Indian mobile number.' },
      { status: 400 }
    );
  }

  const maskedPhone = maskPhoneNumber(normalizedPhone);
  const provider = getWhatsAppOtpProvider();
  const resendResult = await provider.resendOtp({ phoneNumber: normalizedPhone, purpose });

  if (!resendResult.success) {
    const statusCode = resendResult.code === 'MAX_RESENDS_EXCEEDED' ? 429 : 400;
    return NextResponse.json({ error: resendResult.error, code: resendResult.code }, { status: statusCode });
  }

  await logAuthEvent({
    event: 'otp_resend',
    phoneNumberMasked: maskedPhone,
    request,
    details: { purpose, providerMode: provider.mode },
  });

  return NextResponse.json(
    {
      success: true,
      maskedPhone,
      cooldownSeconds: resendResult.cooldownSeconds,
      expiresInSeconds: resendResult.expiresInSeconds,
      devOtp: resendResult.devOtp,
    },
    { status: 200 }
  );
}

export const POST = withAuthErrors(handlePost);
