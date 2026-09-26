import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { buildPublicMediaUrl } from '../../../../lib/media-public-url';
import { CreateMediaAssetBodySchema } from './media-request-schema';
import { MediaAssetSchema, logger, type MediaAsset } from '@bro-pics/shared';

const LIST_LIMIT = 100;

type MediaAssetData = Omit<MediaAsset, 'createdAt' | 'updatedAt'> & { createdAt: unknown; updatedAt: unknown };

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
  const parsed = CreateMediaAssetBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid media asset body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (!body.path.startsWith('public/')) {
    return adminApiError(400, 'invalid_request', 'path must be under the public/ Storage prefix (mint it from /api/admin/media/upload-url first)');
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection('media').doc();
  const now = new Date();
  const asset = MediaAssetSchema.parse({
    id: ref.id,
    ...body,
    usageRefs: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await ref.set(asset);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'media.create',
    resource: 'media',
    resourceId: ref.id,
    details: { path: body.path, type: body.type },
  }).catch((error) => logger.error('Failed to write audit log', { mediaId: ref.id, error: String(error) }));

  return NextResponse.json({ media: { ...asset, url: buildPublicMediaUrl(asset.path) } }, { status: 201 });
}

/**
 * [ABE-10] List/search/filter: `type` (exact), `tag` (array-contains —
 * no composite index needed since it's the only inequality-shaped filter
 * combined with nothing else), `q` (a plain client-side substring match
 * over `alt`, since Firestore has no native substring/full-text search
 * and this library isn't expected to grow large enough to need one).
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
  const type = url.searchParams.get('type');
  const tag = url.searchParams.get('tag');
  const q = url.searchParams.get('q');

  const db = getFirestore(getAdminApp());
  let query: FirebaseFirestore.Query = db.collection('media');
  if (type === 'image' || type === 'video') {
    query = query.where('type', '==', type);
  }
  if (tag) {
    query = query.where('tags', 'array-contains', tag);
  }

  const snapshot = await query.limit(LIST_LIMIT).get();
  let media = snapshot.docs.map((doc) => {
    const data = doc.data() as MediaAssetData;
    return { ...data, url: buildPublicMediaUrl(data.path) };
  });

  if (q) {
    const needle = q.toLowerCase();
    media = media.filter((m) => m.alt.toLowerCase().includes(needle));
  }

  return NextResponse.json({ media }, { status: 200 });
}
