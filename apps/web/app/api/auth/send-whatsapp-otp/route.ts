import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { withAuthErrors } from '../../../../lib/services/auth-route';
import { getWhatsAppOtpProvider } from '../../../../lib/services/whatsapp/provider-factory';
import {
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
} from '../../../../lib/services/whatsapp/otp-store';
import { UserStore } from '../../../../lib/services/user-store';
import { logAuthEvent } from '../../../../lib/services/auth-audit';
import { logOtpSend } from '../../../../lib/billing/otp-log';

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

  // 1. In login mode, check if the account exists
  if (purpose === 'login') {
    const existingUser = await UserStore.findByPhone(normalizedPhone);
    if (!existingUser) {
      await logAuthEvent({
        event: 'login_failed',
        phoneNumberMasked: maskedPhone,
        request,
        details: { reason: 'account_not_found' },
      });
      return NextResponse.json(
        {
          error: 'No account found with this WhatsApp number.',
          notRegistered: true,
        },
        { status: 404 }
      );
    }

    if (existingUser.status === 'disabled') {
      return NextResponse.json(
        { error: 'This account has been disabled. Please contact customer support.' },
        { status: 403 }
      );
    }
  }

  // 2. In register mode, ensure the phone is not already in use
  if (purpose === 'register') {
    const existingUser = await UserStore.findByPhone(normalizedPhone);
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account already exists with this WhatsApp number.' },
        { status: 409 }
      );
    }
  }

  // 3. Dispatch OTP via the centralized WhatsApp provider
  const provider = getWhatsAppOtpProvider();
  const sendResult = await provider.sendOtp({ phoneNumber: normalizedPhone, purpose });
  logOtpSend(normalizedPhone, sendResult);

  if (!sendResult.success) {
    return NextResponse.json({ error: sendResult.error }, { status: 400 });
  }

  await logAuthEvent({
    event: 'otp_requested',
    phoneNumberMasked: maskedPhone,
    request,
    details: { purpose, providerMode: provider.mode },
  });

  return NextResponse.json(
    {
      success: true,
      maskedPhone,
      cooldownSeconds: sendResult.cooldownSeconds,
      expiresInSeconds: sendResult.expiresInSeconds,
      devOtp: sendResult.devOtp,
    },
    { status: 200 }
  );
}

export const POST = withAuthErrors(handlePost);
