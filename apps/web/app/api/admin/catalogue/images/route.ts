import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { MediaAssetSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { mediaImageUrl } from '../../../../../lib/catalogue/product-setup';

const MAX_BYTES = 30 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Product pictures for the catalogue editor (artwork, gallery photos, frame model photos): the file is
 * stored as-is in the media library (public/ prefix) with its true pixel size, which the print-sharpness
 * check relies on. Catalogue staff can use it without the wider content permission.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return adminApiError(400, 'invalid_request', 'Choose a picture to upload.');
  if (!TYPES.has(file.type)) return adminApiError(400, 'invalid_request', 'Upload a JPG, PNG or WebP picture.');
  if (file.size > MAX_BYTES) return adminApiError(400, 'invalid_request', 'This picture is over 30 MB. Save it as a high-quality JPG and try again.');
  const alt = String(form?.get('alt') ?? '').trim().slice(0, 160);
  const tag = String(form?.get('tag') ?? 'product').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'product';

  let bytes = Buffer.from(await file.arrayBuffer());
  let width: number;
  let height: number;
  try {
    // A frame photo must end at the frame's outer edge: trim any empty or transparent margin around it.
    if (tag === 'frame-model') {
      const trimmed = await sharp(bytes, { limitInputPixels: 400_000_000 }).rotate().trim({ threshold: 18 }).png().toBuffer().catch(() => null);
      if (trimmed) bytes = Buffer.from(trimmed);
    }
    const meta = await sharp(bytes, { limitInputPixels: 400_000_000 }).metadata();
    // Phone photos are often stored sideways with an EXIF turn: report the size as it is seen.
    const turned = (meta.orientation ?? 1) >= 5;
    width = (turned ? meta.height : meta.width) ?? 0;
    height = (turned ? meta.width : meta.height) ?? 0;
    if (!width || !height) throw new Error('no size');
  } catch {
    return adminApiError(400, 'invalid_request', 'This file could not be read as a picture.');
  }

  const ref = g.db.collection('media').doc();
  const type = tag === 'frame-model' ? 'image/png' : file.type;
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `public/media/${ref.id}.${ext}`;
  await getStorage(getAdminApp()).bucket().file(path).save(bytes, { contentType: type, resumable: false, metadata: { cacheControl: 'public, max-age=31536000' } });
  const now = new Date();
  const asset = MediaAssetSchema.parse({ id: ref.id, path, type: 'image', width, height, sizeBytes: bytes.length, alt, tags: [tag], usageRefs: [], isActive: true, createdAt: now, updatedAt: now });
  await ref.set(asset);
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'media.create', resource: 'media', resourceId: ref.id, details: { path, tag } }).catch((error) =>
    logger.error('Failed to write audit log', { error: String(error) })
  );
  return NextResponse.json({ media: { id: ref.id, url: mediaImageUrl(ref.id), width, height, alt } }, { status: 201 });
}
