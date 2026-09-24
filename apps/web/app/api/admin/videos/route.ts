import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { addMediaUsageRef } from '../../../../lib/media-usage';
import { CreateVideoBodySchema } from './video-request-schema';
import { VideoSchema, logger, type MediaAsset } from '@bro-pics/shared';

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
  const parsed = CreateVideoBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid video body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  const mediaSnap = await db.collection('media').doc(body.mediaId).get();
  if (!mediaSnap.exists) {
    return adminApiError(400, 'invalid_request', `Unknown mediaId: ${body.mediaId}`);
  }
  if ((mediaSnap.data() as MediaAsset).type !== 'video') {
    return adminApiError(400, 'invalid_request', `mediaId ${body.mediaId} is not a video asset`);
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

  const ref = db.collection('videos').doc();
  const video = VideoSchema.parse({ id: ref.id, ...body, createdAt: new Date() });
  await ref.set(video);

  await addMediaUsageRef(db, body.mediaId, { resource: 'video', resourceId: ref.id });
  if (body.thumbnailMediaId) {
    await addMediaUsageRef(db, body.thumbnailMediaId, { resource: 'video', resourceId: ref.id });
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'video.create',
    resource: 'video',
    resourceId: ref.id,
    details: { mediaId: body.mediaId, placement: body.placement },
  }).catch((error) => logger.error('Failed to write audit log', { videoId: ref.id, error: String(error) }));

  return NextResponse.json({ video }, { status: 201 });
}

/**
 * [ABE-19] Admin listing: `placement` (exact) and `productId` (exact) are
 * each a plain single-equality filter — no composite index needed since
 * they're never combined with each other or an orderBy in the same query
 * (results are sorted in memory by `sortOrder`, same reasoning ABE-15's
 * cursor pagination and ABE-16 slice 5's customization lookup both used
 * for "equality filter, sort in memory" over "needs an undeployable
 * composite index").
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content read access required');
  }

  const url = new URL(request.url);
  const placement = url.searchParams.get('placement');
  const productId = url.searchParams.get('productId');

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('videos');
  if (placement) {
    query = query.where('placement', '==', placement);
  }
  if (productId) {
    query = query.where('productId', '==', productId);
  }

  const snapshot = await query.get();
  const videos = snapshot.docs.map((doc) => doc.data()).sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json({ videos }, { status: 200 });
}
