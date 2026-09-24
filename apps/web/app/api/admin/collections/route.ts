import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { CreateCollectionBodySchema } from './collection-request-schema';
import { CollectionSchema, logger } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateCollectionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid collection body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  const slugConflict = await db.collection('collections').where('slug', '==', body.slug).limit(1).get();
  if (!slugConflict.empty) {
    return adminApiError(409, 'conflict', `A collection with slug "${body.slug}" already exists`);
  }

  const ref = db.collection('collections').doc();
  const now = new Date();
  const collection = CollectionSchema.parse({ id: ref.id, ...body, createdAt: now, updatedAt: now });
  await ref.set(collection);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'collection.create',
    resource: 'collection',
    resourceId: ref.id,
    details: { slug: body.slug, productCount: body.productIds.length },
  }).catch((error) => logger.error('Failed to write audit log', { collectionId: ref.id, error: String(error) }));

  return NextResponse.json({ collection }, { status: 201 });
}
