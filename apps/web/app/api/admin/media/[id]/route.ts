import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { buildPublicMediaUrl } from '../../../../../lib/media-public-url';
import { UpdateMediaAssetBodySchema } from '../media-request-schema';
import { logger, type MediaAsset } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// [ABE-10/11] Only alt/tags/isActive are editable — path/type/dimensions
// are fixed at upload time (changing them would mean the doc no longer
// describes the actual Storage object). "Archive instead of delete"
// again: isActive: false, no DELETE handler.
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('media').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown media id: ${id}`);
  }
  const current = snap.data() as MediaAsset;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateMediaAssetBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid media asset body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  // [ABE-11] A WARNING, not an unconditional block (unlike categories'
  // active-products check) — the caller can pass force: true to archive
  // anyway once they've seen what's still referencing it.
  const isArchiving = body.isActive === false && current.isActive !== false;
  if (isArchiving && current.usageRefs.length > 0 && !body.force) {
    return adminApiError(
      409,
      'conflict',
      'This media asset is still referenced elsewhere — pass force: true to archive it anyway',
      { usageRefs: current.usageRefs }
    );
  }

  const { force: _force, ...fieldsToUpdate } = body;
  const update: Record<string, unknown> = { ...fieldsToUpdate, updatedAt: new Date() };
  await ref.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: body.isActive === false ? 'media.archive' : 'media.update',
    resource: 'media',
    resourceId: id,
    details: { changedFields: Object.keys(fieldsToUpdate) },
  }).catch((error) => logger.error('Failed to write audit log', { mediaId: id, error: String(error) }));

  const merged = { ...current, ...update };
  return NextResponse.json({ media: { ...merged, url: buildPublicMediaUrl(merged.path) } }, { status: 200 });
}
