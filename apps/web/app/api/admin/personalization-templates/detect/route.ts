import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { analyseCollage, eraseTextAreas, planCanvas } from '../../../../../lib/collage-detection';
import { MediaAssetSchema, logger, type MediaAsset } from '@bro-pics/shared';

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
 * slots plus the print canvas. The admin reviews the proposal in the builder
 * and creates the draft from it. The one thing saved here: when the design
 * has printed wording, a copy with that wording cleared is added to the media
 * library, because the template's text box replaces it.
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
    let assetId = body.mediaId;
    const texts = analysis.detection.texts ?? [];
    if (texts.length > 0 && analysis.detection.backgroundColor) {
      try {
        const cleaned = await eraseTextAreas(image, texts, analysis.detection.backgroundColor);
        const ref = db.collection('media').doc();
        const path = `public/media/${ref.id}-design-without-text.${cleaned.extension}`;
        await getStorage(getAdminApp()).bucket().file(path).save(cleaned.data, { contentType: cleaned.contentType, resumable: false });
        const now = new Date();
        await ref.set(
          MediaAssetSchema.parse({
            id: ref.id,
            path,
            type: 'image',
            width: analysis.native.width,
            height: analysis.native.height,
            sizeBytes: cleaned.data.length,
            alt: `${media.alt || 'Collage design'} (wording cleared for a template)`,
            tags: ['template-artwork'],
            usageRefs: [],
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
        );
        assetId = ref.id;
      } catch (err) {
        // The photo spaces are still useful without the text boxes.
        logger.warn('Collage detection: clearing the wording failed', { mediaId: body.mediaId, error: String(err) });
        analysis.detection.texts = [];
        analysis.detection.notes = analysis.detection.notes.filter((n) => !n.startsWith('Found ') || !n.includes('wording'));
        analysis.detection.notes.push('Printed wording was found but could not be cleared from the design, so no text box was added. Add one by hand if needed.');
      }
    }
    const plan = planCanvas({ nativeWidth: analysis.native.width, nativeHeight: analysis.native.height, widthIn: body.widthIn, heightIn: body.heightIn, dpi: body.dpi });
    return NextResponse.json(
      {
        detection: analysis.detection,
        artwork: { assetId, ...analysis.native, ...(assetId !== body.mediaId && { originalAssetId: body.mediaId }) },
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
