import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { ReorderFaqsBodySchema } from '../faq-request-schema';
import { logger } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = ReorderFaqsBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid reorder body', { issues: parsed.error.issues });
  }
  const { orderedIds } = parsed.data;

  if (new Set(orderedIds).size !== orderedIds.length) {
    return adminApiError(400, 'invalid_request', 'orderedIds contains a duplicate FAQ id');
  }

  const db = getFirestore(getAdminApp());
  const refs = orderedIds.map((id) => db.collection('faqs').doc(id));
  const snaps = await db.getAll(...refs);
  const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
  if (missing.length > 0) {
    return adminApiError(400, 'invalid_request', `Unknown FAQ id(s): ${missing.join(', ')}`);
  }

  const batch = db.batch();
  orderedIds.forEach((id, index) => {
    batch.update(db.collection('faqs').doc(id), { sortOrder: index });
  });
  await batch.commit();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'faq.reorder',
    resource: 'faq',
    resourceId: orderedIds.join(','),
    details: { orderedIds },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  return NextResponse.json({ orderedIds }, { status: 200 });
}
