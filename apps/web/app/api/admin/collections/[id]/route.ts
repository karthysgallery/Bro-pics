import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateCollectionBodySchema } from '../collection-request-schema';
import { logger, type Collection } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// [ABE-07] "Archive instead of delete", same as products/categories/
// variants — no DELETE handler; PATCH {isActive: false} retires it.
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('collections').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown collection id: ${id}`);
  }
  const current = snap.data() as Collection;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateCollectionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid collection body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.slug && body.slug !== current.slug) {
    const slugConflict = await db.collection('collections').where('slug', '==', body.slug).limit(1).get();
    if (!slugConflict.empty && slugConflict.docs[0].id !== id) {
      return adminApiError(409, 'conflict', `A collection with slug "${body.slug}" already exists`);
    }
  }

  const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: body.isActive === false ? 'collection.archive' : 'collection.update',
    resource: 'collection',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { collectionId: id, error: String(error) }));

  return NextResponse.json({ collection: { ...current, ...update } }, { status: 200 });
}
