import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { findVariantById } from '../../../../../lib/variant-lookup';
import { probeAndStripImage } from '../../../../../lib/image-probe';
import { logger, type FrameTemplate } from '@bro-pics/shared';
// Not from the main '@bro-pics/shared' barrel — this is a Next.js route
// handler (always server-only), importing a sibling workspace package's
// pure rendering function directly, the same "direct subpath/package
// import for a server-only consumer" pattern print-jobs.ts documents.
import { renderPrintFile } from '@bro-pics/print-render/src/render-print-file';

const MAX_TEST_PHOTO_BYTES = 20 * 1024 * 1024;

/**
 * [ABE-14] Resolves a frame template asset path/URL to bytes. Real
 * Storage public URLs (http(s)://…) are fetched directly — same as
 * `services/print-render`'s own `fetchPublicAsset`. A `/`-rooted path
 * (every current seed template still uses these, e.g.
 * `/placeholders/mockups/x.png` — a Next.js `public/` folder asset, not
 * a Storage object) is read straight off disk, since there is no HTTP
 * server to fetch it FROM inside this same process during a route
 * handler.
 */
async function fetchTemplateAsset(pathOrUrl: string): Promise<Buffer> {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) throw new Error(`Failed to fetch template asset: ${pathOrUrl} (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  const filePath = path.join(process.cwd(), 'public', pathOrUrl.replace(/^\//, ''));
  return readFile(filePath);
}

/**
 * [ABE-14] Renders one sample photo through the SAME pure compositing
 * function the real print pipeline uses (`renderPrintFile`, shared with
 * `services/print-render`'s `renderPrintJob`) against a chosen template
 * version — so what an admin previews here is provably what a customer's
 * order would produce, not a separate reimplementation that could drift.
 * Entirely outside the printJobs/order/Customization state machine: no
 * job doc, no order, nothing written to `print-files/` — the rendered
 * bytes go straight back in the response as a downloadable file.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
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

  const formData = await request.formData().catch(() => null);
  const variantId = formData?.get('variantId');
  const templateVersionRaw = formData?.get('templateVersion');
  const photo = formData?.get('photo');

  const hasPhotoBytes = photo !== null && photo !== undefined && typeof (photo as Blob).arrayBuffer === 'function';
  if (typeof variantId !== 'string' || !variantId || !hasPhotoBytes) {
    return adminApiError(400, 'invalid_request', 'Missing variantId or photo');
  }
  const photoBlob = photo as Blob;
  if (photoBlob.size > MAX_TEST_PHOTO_BYTES) {
    return adminApiError(400, 'invalid_request', `Photo exceeds the ${MAX_TEST_PHOTO_BYTES / (1024 * 1024)} MB limit`);
  }

  const db = getFirestore(getAdminApp());

  const variant = await findVariantById(db, variantId);
  if (!variant) {
    return adminApiError(400, 'invalid_request', `Unknown variantId: ${variantId}`);
  }

  const templatesRef = db.collection('products').doc(variant.productId).collection('frameTemplates');
  let templateQuery = templatesRef.where('variantId', '==', variantId);
  templateQuery =
    typeof templateVersionRaw === 'string' && templateVersionRaw
      ? templateQuery.where('version', '==', Number(templateVersionRaw))
      : templateQuery.where('isCurrent', '==', true);
  const templateSnap = await templateQuery.limit(1).get();
  if (templateSnap.empty) {
    return adminApiError(404, 'not_found', `No matching frame template for variant ${variantId}`);
  }
  const template = templateSnap.docs[0].data() as FrameTemplate;

  let probed;
  try {
    probed = await probeAndStripImage(Buffer.from(await photoBlob.arrayBuffer()));
  } catch (error) {
    return adminApiError(400, 'invalid_request', `Could not process the sample photo: ${error instanceof Error ? error.message : String(error)}`);
  }

  const [mockupBuffer, overlayBuffer, maskBuffer] = await Promise.all([
    fetchTemplateAsset(template.mockupUrl),
    template.overlayUrl ? fetchTemplateAsset(template.overlayUrl) : Promise.resolve(null),
    template.maskUrl ? fetchTemplateAsset(template.maskUrl) : Promise.resolve(null),
  ]);

  // Every slot gets the SAME sample photo, uncropped (the full probed
  // image as its own cropRect) and unrotated — there is no real
  // Customization to pull a crop/rotation from; this previews template
  // geometry and zone placement, not a specific customer's edit.
  const slots = template.printableRects.map((rect) => ({
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    photoBuffer: probed.strippedBuffer,
    cropRect: { x: 0, y: 0, width: probed.widthPx, height: probed.heightPx },
    rotationDeg: 0 as const,
    maskBuffer,
  }));

  const textFieldsRaw = formData?.get('textFields');
  let textFieldsInput: Record<string, string> = {};
  if (typeof textFieldsRaw === 'string') {
    try {
      textFieldsInput = JSON.parse(textFieldsRaw);
    } catch {
      // Ignore JSON parse error
    }
  }

  const textFields = template.textZones
    ? template.textZones
        .map((zone) => {
          const val = textFieldsInput[zone.fieldKey];
          if (!val || !val.trim()) return null;
          return {
            zoneRect: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
            align: zone.align,
            value: val.trim(),
            fontKeyOrCssVar: zone.defaultFontFamily || 'dancing-script',
            color: zone.defaultColor || '#000000',
            minFontSizePx: zone.minFontSizePx,
            maxFontSizePx: zone.maxFontSizePx,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
    : undefined;

  let renderedBuffer: Buffer;
  try {
    renderedBuffer = await renderPrintFile({
      printWidthPx: variant.printWidthPx,
      printHeightPx: variant.printHeightPx,
      slots,
      mockupBuffer,
      overlayBuffer,
      textFields,
    });
  } catch (error) {
    logger.error('Test render failed', { variantId, templateId: template.id, error: String(error) });
    return adminApiError(500, 'internal', 'Test render failed');
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'frame_template.test_render',
    resource: 'frame_template',
    resourceId: template.id,
    details: { variantId, version: template.version },
  }).catch((error) => logger.error('Failed to write audit log', { templateId: template.id, error: String(error) }));

  return new NextResponse(new Uint8Array(renderedBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="test-render-${variantId}-v${template.version}.png"`,
    },
  });
}
