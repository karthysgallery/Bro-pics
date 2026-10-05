import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { analyseCollage, planCanvas } from '../../../../../lib/collage-detection';
import { logger, type MediaAsset } from '@bro-pics/shared';

const BodySchema = z
  .object({
    mediaId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    /** The frame's print size, when the template is made for a known variant. */
    widthIn: z.number().positive().max(120).optional(),
    heightIn: z.number().positive().max(120).optional(),
    dpi: z.number().int().min(72).max(600).optional(),
  })
  .strict()
  .refine((b) => (b.widthIn === undefined) === (b.heightIn === undefined), { message: 'Give both widthIn and heightIn, or neither' });

/**
 * Analyses a collage design from the media library and proposes its photo
 * slots plus the print canvas. Nothing is saved: the admin reviews the
 * proposal in the builder and creates the draft from it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request');
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('media').doc(body.mediaId).get();
  const media = snap.exists ? (snap.data() as MediaAsset) : null;
  if (!media || media.type !== 'image' || media.isActive === false) {
    return adminApiError(404, 'not_found', 'That image is not in the media library.');
  }

  let image: Buffer;
  try {
    [image] = await getStorage(getAdminApp()).bucket().file(media.path).download();
  } catch (err) {
    logger.error('Collage detection: download failed', { mediaId: body.mediaId, error: String(err) });
    return adminApiError(404, 'not_found', 'The image file could not be read from storage.');
  }

  try {
    const analysis = await analyseCollage(image);
    const plan = planCanvas({ nativeWidth: analysis.native.width, nativeHeight: analysis.native.height, widthIn: body.widthIn, heightIn: body.heightIn, dpi: body.dpi });
    return NextResponse.json(
      {
        detection: analysis.detection,
        artwork: { assetId: body.mediaId, ...analysis.native },
        analysed: analysis.analysed,
        canvas: plan.canvas,
        printSizeIn: { width: plan.widthIn, height: plan.heightIn },
        artworkDpi: plan.artworkDpi,
        warnings: plan.warnings,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.warn('Collage detection: analysis failed', { mediaId: body.mediaId, error: String(err) });
    return adminApiError(422, 'invalid_request', 'The image could not be analysed. Upload a PNG, JPEG or WebP file.');
  }
}
