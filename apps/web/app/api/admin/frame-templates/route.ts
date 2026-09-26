import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { findVariantById } from '../../../../lib/variant-lookup';
import { CreateFrameTemplateBodySchema } from './frame-template-request-schema';
import { FrameTemplateSchema, logger, type FrameTemplate } from '@bro-pics/shared';

/**
 * [ABE-12] "Save as new version" — never mutates an existing template
 * doc in place (see FrameTemplateSchema's own comment on why: a
 * Customization pins the exact version it was built against, so an
 * existing order's re-render must never be affected by a later edit).
 * Inside one transaction: read the current `isCurrent` doc for this
 * variant (if any), then write a new doc at `version + 1` /
 * `isCurrent: true` and flip the old one to `isCurrent: false` — reads
 * before writes, Firestore's own transaction rule.
 */
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
  const parsed = CreateFrameTemplateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid frame template body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());

  // The route only receives a bare variantId — variants are a
  // products/{id}/variants subcollection, so the parent productId (and
  // therefore the products/{id}/frameTemplates path this whole route
  // writes to) has to be resolved first, same pattern /api/uploads
  // already uses for the same reason.
  const variant = await findVariantById(db, body.variantId);
  if (!variant) {
    return adminApiError(400, 'invalid_request', `Unknown variantId: ${body.variantId}`);
  }

  const templatesRef = db.collection('products').doc(variant.productId).collection('frameTemplates');
  const newRef = templatesRef.doc();

  let newVersion = 1;
  try {
    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(
        templatesRef.where('variantId', '==', body.variantId).where('isCurrent', '==', true).limit(1)
      );

      if (!currentSnap.empty) {
        const currentDoc = currentSnap.docs[0];
        const currentTemplate = currentDoc.data() as FrameTemplate;
        newVersion = currentTemplate.version + 1;
        transaction.update(currentDoc.ref, { isCurrent: false });
      }

      const template = FrameTemplateSchema.parse({
        id: newRef.id,
        ...body,
        version: newVersion,
        isCurrent: true,
      });
      transaction.set(newRef, template);
    });
  } catch (error) {
    logger.error('Failed to save frame template version', { variantId: body.variantId, error: String(error) });
    throw error;
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'frame_template.create_version',
    resource: 'frame_template',
    resourceId: newRef.id,
    details: { variantId: body.variantId, version: newVersion },
  }).catch((error) => logger.error('Failed to write audit log', { templateId: newRef.id, error: String(error) }));

  return NextResponse.json(
    { frameTemplate: { id: newRef.id, ...body, version: newVersion, isCurrent: true } },
    { status: 201 }
  );
}
