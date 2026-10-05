import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { withAuthErrors } from '../../../../lib/services/auth-route';
import { getWhatsAppOtpProvider } from '../../../../lib/services/whatsapp/provider-factory';
import {
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
} from '../../../../lib/services/whatsapp/otp-store';
import { UserStore } from '../../../../lib/services/user-store';
import {
  validatePasswordRequirements,
  hashPassword,
} from '../../../../lib/services/password';
import { createSessionToken, attachSessionCookie } from '../../../../lib/services/session';
import { logAuthEvent } from '../../../../lib/services/auth-audit';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function handlePost(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: {
    phone?: string;
    otp?: string;
    purpose?: 'login' | 'register';
    fullName?: string;
    email?: string | null;
    password?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { phone, otp, purpose = 'login', fullName, email, password } = body;

  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Please enter a valid WhatsApp mobile number.' }, { status: 400 });
  }

  if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    return NextResponse.json({ error: 'Please enter the 6-digit WhatsApp verification code.' }, { status: 400 });
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

  // 1. Verify OTP with centralized WhatsApp OTP provider
  const provider = getWhatsAppOtpProvider();
  const verifyResult = await provider.verifyOtp(normalizedPhone, otp.trim());

  if (!verifyResult.success) {
    const errorEvent =
      verifyResult.code === 'EXPIRED_OTP'
        ? 'otp_expired'
        : 'otp_failed';

    await logAuthEvent({
      event: errorEvent,
      phoneNumberMasked: maskedPhone,
      request,
      details: { purpose, code: verifyResult.code, providerMode: provider.mode },
    });

    const statusCode = verifyResult.code === 'TOO_MANY_ATTEMPTS' ? 429 : 400;
    return NextResponse.json({ error: verifyResult.error, code: verifyResult.code }, { status: statusCode });
  }

  // 2. Registration Flow
  if (purpose === 'register') {
    // Validate required registration fields
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Please provide your full name (minimum 2 characters).' },
        { status: 400 }
      );
    }

    // Email is OPTIONAL. Validate only when provided
    if (email && typeof email === 'string' && email.trim() !== '') {
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: 'Please enter a valid email address.' },
          { status: 400 }
        );
      }
    }

    // Password is REQUIRED for account setup
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required to create your account.' },
        { status: 400 }
      );
    }

    const passwordValidation = validatePasswordRequirements(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.errors.join(' ') },
        { status: 400 }
      );
    }

    // Hash password securely (scrypt)
    const passwordHash = hashPassword(password);

    let customerResult;
    try {
      customerResult = await UserStore.createCustomer({
        phone: normalizedPhone,
        fullName,
        email: email && email.trim() ? email.trim() : null,
        passwordHash,
      });
    } catch (createErr: any) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create account. Please try again.' },
        { status: 409 }
      );
    }

    const { user, customToken } = customerResult;

    // Log security events
    await logAuthEvent({
      event: 'otp_verified',
      phoneNumberMasked: maskedPhone,
      userId: user.id,
      request,
      details: { purpose: 'register' },
    });

    await logAuthEvent({
      event: 'account_created',
      phoneNumberMasked: maskedPhone,
      userId: user.id,
      request,
      details: { hasEmail: Boolean(user.email) },
    });

    await logAuthEvent({
      event: 'login_success',
      phoneNumberMasked: maskedPhone,
      userId: user.id,
      request,
      details: { method: 'whatsapp_otp_register' },
    });

    // Create session token & Set-Cookie
    const sessionToken = createSessionToken({
      userId: user.id,
      phone: user.phone,
      role: user.role,
      name: user.displayName,
      email: user.email,
      status: user.status,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          whatsappVerified: user.whatsappVerified,
        },
        customToken,
      },
      { status: 200 }
    );

    attachSessionCookie(response, sessionToken);
    return response;
  }

  // 3. Login Flow
  const existingUser = await UserStore.findByPhone(normalizedPhone);
  if (!existingUser) {
    await logAuthEvent({
      event: 'login_failed',
      phoneNumberMasked: maskedPhone,
      request,
      details: { reason: 'account_not_found' },
    });
    return NextResponse.json(
      { error: 'No account found with this WhatsApp number.', notRegistered: true },
      { status: 404 }
    );
  }

  if (existingUser.status === 'disabled') {
    return NextResponse.json(
      { error: 'This account has been disabled. Please contact customer support.' },
      { status: 403 }
    );
  }

  // In mock mode the code is handed to whoever asks for it, so OTP proves
  // nothing about phone ownership. Privileged accounts (admin/staff/…, by
  // users-doc role OR Auth custom claim) must therefore never be reachable
  // through OTP-only sign-in until a real delivery provider is configured.
  if (provider.mode === 'mock') {
    const effectiveRole = await UserStore.getEffectiveRole(existingUser);
    if (effectiveRole !== 'customer') {
      await logAuthEvent({
        event: 'login_failed',
        phoneNumberMasked: maskedPhone,
        userId: existingUser.id,
        request,
        details: { reason: 'privileged_account_requires_password', method: 'whatsapp_otp_login' },
      });
      return NextResponse.json(
        { error: 'Staff and admin accounts must sign in with a password.', code: 'PASSWORD_REQUIRED' },
        { status: 403 }
      );
    }
  }

  // Record login & get custom token
  const customToken = await UserStore.recordLogin(existingUser.id);

  await logAuthEvent({
    event: 'otp_verified',
    phoneNumberMasked: maskedPhone,
    userId: existingUser.id,
    request,
    details: { purpose: 'login' },
  });

  await logAuthEvent({
    event: 'login_success',
    phoneNumberMasked: maskedPhone,
    userId: existingUser.id,
    request,
    details: { method: 'whatsapp_otp_login' },
  });

  // Create session token & Set-Cookie
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
        whatsappVerified: true,
      },
      customToken,
    },
    { status: 200 }
  );

  attachSessionCookie(response, sessionToken);
  return response;
}

export const POST = withAuthErrors(handlePost);
