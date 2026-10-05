import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { withAuthErrors } from '../../../../lib/services/auth-route';
import {
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
} from '../../../../lib/services/whatsapp/otp-store';
import { UserStore } from '../../../../lib/services/user-store';
import { verifyPassword } from '../../../../lib/services/password';
import { createSessionToken, attachSessionCookie } from '../../../../lib/services/session';
import { logAuthEvent } from '../../../../lib/services/auth-audit';

async function handlePost(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { phone?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { phone, password } = body;
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Please enter your registered mobile number.' }, { status: 400 });
  }

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Please enter your password.' }, { status: 400 });
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
  const existingUser = await UserStore.findByPhone(normalizedPhone);

  if (!existingUser) {
    await logAuthEvent({
      event: 'login_failed',
      phoneNumberMasked: maskedPhone,
      request,
      details: { reason: 'account_not_found', method: 'password' },
    });
    return NextResponse.json(
      { error: 'Invalid mobile number or password.', notRegistered: true },
      { status: 401 }
    );
  }

  if (existingUser.status === 'disabled') {
    return NextResponse.json(
      { error: 'This account has been disabled. Please contact customer support.' },
      { status: 403 }
    );
  }

  if (!existingUser.passwordHash) {
    return NextResponse.json(
      { error: 'No password is set on this account. Please sign in using WhatsApp OTP.' },
      { status: 400 }
    );
  }

  const isPasswordValid = verifyPassword(password, existingUser.passwordHash);
  if (!isPasswordValid) {
    await logAuthEvent({
      event: 'login_failed',
      phoneNumberMasked: maskedPhone,
      userId: existingUser.id,
      request,
      details: { reason: 'invalid_password', method: 'password' },
    });
    return NextResponse.json(
      { error: 'Invalid mobile number or password.' },
      { status: 401 }
    );
  }

  const customToken = await UserStore.recordLogin(existingUser.id);

  await logAuthEvent({
    event: 'login_success',
    phoneNumberMasked: maskedPhone,
    userId: existingUser.id,
    request,
    details: { method: 'password' },
  });

  const sessionToken = createSessionToken({
    userId: existingUser.id,
    phone: existingUser.phone,
    role: existingUser.role,
    name: existingUser.displayName,
    email: existingUser.email,
    status: existingUser.status,
  });

  const response = NextResponse.json(
    {
      success: true,
      user: {
        id: existingUser.id,
        phone: existingUser.phone,
        displayName: existingUser.displayName,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        email: existingUser.email,
        role: existingUser.role,
        whatsappVerified: existingUser.whatsappVerified,
      },
      customToken,
    },
    { status: 200 }
  );

  attachSessionCookie(response, sessionToken);
  return response;
}

export const POST = withAuthErrors(handlePost);
