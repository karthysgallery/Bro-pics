import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { addMediaUsageRef, removeMediaUsageRef } from '../../../../../lib/media-usage';
import { UpdateVideoBodySchema } from '../video-request-schema';
import { logger, type Video, type MediaAsset } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
  const ref = db.collection('videos').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown video id: ${id}`);
  }
  const current = snap.data() as Video;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateVideoBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid video body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (body.mediaId && body.mediaId !== current.mediaId) {
    const mediaSnap = await db.collection('media').doc(body.mediaId).get();
    if (!mediaSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown mediaId: ${body.mediaId}`);
    }
    if ((mediaSnap.data() as MediaAsset).type !== 'video') {
      return adminApiError(400, 'invalid_request', `mediaId ${body.mediaId} is not a video asset`);
    }
  }

  if (body.thumbnailMediaId) {
    const thumbSnap = await db.collection('media').doc(body.thumbnailMediaId).get();
    if (!thumbSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown thumbnailMediaId: ${body.thumbnailMediaId}`);
    }
    if ((thumbSnap.data() as MediaAsset).type !== 'image') {
      return adminApiError(400, 'invalid_request', `thumbnailMediaId ${body.thumbnailMediaId} is not an image asset`);
    }
  }

  if (body.productId) {
    const productSnap = await db.collection('products').doc(body.productId).get();
    if (!productSnap.exists) {
      return adminApiError(400, 'invalid_request', `Unknown productId: ${body.productId}`);
    }
  }

  await ref.update({ ...body });

  // [ABE-19] Keep MediaAsset.usageRefs accurate when a video is
  // repointed at a different underlying asset — same "detach the old
  // ref, attach the new one" the shipped implementation of these helpers
  // was always meant to do, now that something finally calls them.
  if (body.mediaId && body.mediaId !== current.mediaId) {
    await removeMediaUsageRef(db, current.mediaId, { resource: 'video', resourceId: id });
    await addMediaUsageRef(db, body.mediaId, { resource: 'video', resourceId: id });
  }
  if (body.thumbnailMediaId !== undefined && body.thumbnailMediaId !== current.thumbnailMediaId) {
    if (current.thumbnailMediaId) {
      await removeMediaUsageRef(db, current.thumbnailMediaId, { resource: 'video', resourceId: id });
    }
    if (body.thumbnailMediaId) {
      await addMediaUsageRef(db, body.thumbnailMediaId, { resource: 'video', resourceId: id });
    }
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'video.update',
    resource: 'video',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { videoId: id, error: String(error) }));

  return NextResponse.json({ video: { ...current, ...body } }, { status: 200 });
}
