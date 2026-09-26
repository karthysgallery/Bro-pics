import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { logger } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'team:manage');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Admin access required' }, { status: permission.status });
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
  }

  try {
    const user = await getAuth(getAdminApp()).getUserByPhoneNumber(phone);

    // [ABE-27] Was missing entirely — a lookup reveals a customer's
    // account/role to staff, worth its own audit trail even though it's
    // read-only, same as ABE-16's item-download route logs every read of
    // a customer's private photos.
    writeAuditLog(getFirestore(getAdminApp()), {
      actorUid: permission.uid,
      action: 'user.lookup',
      resource: 'user',
      resourceId: user.uid,
    }).catch((error) => logger.error('Failed to write audit log', { uid: user.uid, error: String(error) }));

    return NextResponse.json(
      { uid: user.uid, phoneNumber: user.phoneNumber, role: (user.customClaims?.role as string | undefined) ?? null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: `No account with phone ${phone}` }, { status: 404 });
  }
}
