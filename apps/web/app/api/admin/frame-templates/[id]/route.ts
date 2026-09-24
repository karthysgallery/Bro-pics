import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { findVariantById } from '../../../../../lib/variant-lookup';
import { ActivateFrameTemplateBodySchema } from './frame-template-activate-schema';
import { logger, type FrameTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [ABE-13] Version immutability: there is deliberately no endpoint that
 * edits a version's own fields (layout, zones, assets) — ABE-12 chose
 * "save as new version" specifically so an existing template doc is
 * NEVER mutated after creation, which already satisfies "reject edits to
 * a version referenced by an order" by construction (there's nothing to
 * reject; the edit path doesn't exist). The one thing that genuinely
 * IS mutable here is `isCurrent` — activating/deactivating which version
 * new customizations get built against. That's deliberately NOT gated on
 * order-reference: `services/print-render/src/firestore-render-deps.ts`'s
 * `getFrameTemplate(variantId, templateVersion)` resolves a render by the
 * customization's own PINNED version number, never by `isCurrent` — so
 * toggling `isCurrent` cannot affect any past, pending, or in-flight
 * order. Verified by reading that resolution path before writing this
 * comment, not assumed.
 */
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

  const rawBody = await request.json().catch(() => null);
  const parsed = ActivateFrameTemplateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid frame template body', { issues: parsed.error.issues });
  }
  const body = parsed.data;
  const { id } = await params;

  const db = getFirestore(getAdminApp());

  // Same resolution as ABE-12's create route: a bare template id alone
  // can't locate the products/{id}/frameTemplates path it lives under
  // without a collection-group index this environment can't deploy, so
  // the caller supplies variantId (which it already has — it fetched
  // this template as part of that variant's template list) and we
  // resolve the parent product from that instead.
  const variant = await findVariantById(db, body.variantId);
  if (!variant) {
    return adminApiError(400, 'invalid_request', `Unknown variantId: ${body.variantId}`);
  }

  const templatesRef = db.collection('products').doc(variant.productId).collection('frameTemplates');
  const targetRef = templatesRef.doc(id);

  try {
    await db.runTransaction(async (transaction) => {
      const targetSnap = await transaction.get(targetRef);
      if (!targetSnap.exists) {
        throw new NotFoundError();
      }
      const target = targetSnap.data() as FrameTemplate;
      if (target.variantId !== body.variantId) {
        throw new VariantMismatchError();
      }

      // [ABE-13] "Only one isCurrent per variant" — only queried/enforced
      // when ACTIVATING (isCurrent: true). Deactivating the current
      // version leaves the variant with none current, which is legal —
      // it just isn't personalizable in the editor until another version
      // is activated; not treated as an error state.
      if (body.isCurrent) {
        const othersSnap = await transaction.get(
          templatesRef.where('variantId', '==', body.variantId).where('isCurrent', '==', true)
        );
        for (const doc of othersSnap.docs) {
          if (doc.id !== id) {
            transaction.update(doc.ref, { isCurrent: false });
          }
        }
      }

      transaction.update(targetRef, { isCurrent: body.isCurrent });
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return adminApiError(404, 'not_found', `Unknown frame template id: ${id}`);
    }
    if (error instanceof VariantMismatchError) {
      return adminApiError(400, 'invalid_request', `Template ${id} does not belong to variant ${body.variantId}`);
    }
    throw error;
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: body.isCurrent ? 'frame_template.activate' : 'frame_template.deactivate',
    resource: 'frame_template',
    resourceId: id,
    details: { variantId: body.variantId },
  }).catch((error) => logger.error('Failed to write audit log', { templateId: id, error: String(error) }));

  return NextResponse.json({ id, variantId: body.variantId, isCurrent: body.isCurrent }, { status: 200 });
}

class NotFoundError extends Error {}
class VariantMismatchError extends Error {}
