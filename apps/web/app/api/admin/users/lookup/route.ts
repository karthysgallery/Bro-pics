import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getAdminUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const adminUserId = await getAdminUserIdFromAuthHeader(request);
  if (!adminUserId) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  }

  try {
    const user = await getAuth(getAdminApp()).getUserByPhoneNumber(phone);
    return NextResponse.json(
      { uid: user.uid, phoneNumber: user.phoneNumber, role: (user.customClaims?.role as string | undefined) ?? null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: `No account with phone ${phone}` }, { status: 404 });
  }
}
