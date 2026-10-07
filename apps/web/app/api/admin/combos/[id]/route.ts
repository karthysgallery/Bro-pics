import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { ComboSchema, logger, type Combo } from '@bro-pics/shared';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { revalidateComboPages } from '../../../../../lib/revalidate-catalogue';
import { getComboById, firestorePublishDeps, COMBOS_COLLECTION } from '../../../../../lib/firestore-combos';
import { checkComboPublishable } from '../../../../../lib/combo-publish-check';
import { UpdateComboBodySchema } from '../combo-request-schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });

/** One combo for the editor, with each included product and size spelled out, and what would stop it being published. */
export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) return tooMany(rateLimit.retryAfterSeconds);
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue read access required');
  }
  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const combo = await getComboById(db, id);
  if (!combo) return adminApiError(404, 'not_found', 'Combo not found');

  const deps = firestorePublishDeps(db);
  const items = await Promise.all(
    combo.items.map(async (item) => {
      const [product, variant] = await Promise.all([deps.loadProduct(item.productId), deps.loadVariant(item.variantId)]);
      const productSnap = product ? await db.collection('products').doc(item.productId).get() : null;
      const productData = productSnap?.data() as { slug?: string; primaryImageUrl?: string } | undefined;
      return {
        ...item,
        productTitle: product?.title ?? null,
        productSlug: productData?.slug ?? null,
        productImageUrl: productData?.primaryImageUrl ?? null,
        variantLabel: variant ? `${variant.sizeLabel} · ${variant.frameColour}` : null,
        variantPrice: variant?.price ?? null,
        stockStatus: variant?.stockStatus ?? null,
      };
    })
  );
  const problems = await checkComboPublishable(combo, deps);
  return NextResponse.json({ combo, items, problems }, { status: 200 });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) return tooMany(rateLimit.retryAfterSeconds);
  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue write access required');
  }

  const { id } = await params;
  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateComboBodySchema.safeParse(rawBody);
  if (!parsed.success) return adminApiError(400, 'invalid_request', 'Invalid combo', { issues: parsed.error.issues });
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  const existing = await getComboById(db, id);
  if (!existing) return adminApiError(404, 'not_found', 'Combo not found');

  if (body.slug && body.slug !== existing.slug) {
    const conflict = await db.collection(COMBOS_COLLECTION).where('slug', '==', body.slug).limit(2).get();
    if (conflict.docs.some((d) => d.id !== id)) {
      return adminApiError(409, 'conflict', `A combo with the address "${body.slug}" already exists`);
    }
  }

  const next = { ...existing, ...body };
  // What a customer pays or receives changed: carts holding the old version must be recognised as stale.
  const contentsChanged = !sameJson(existing.items, next.items) || existing.price !== next.price || existing.mrp !== next.mrp;
  const merged = ComboSchema.safeParse({
    ...next,
    version: contentsChanged ? existing.version + 1 : existing.version,
    updatedAt: new Date().toISOString(),
  });
  if (!merged.success) return adminApiError(400, 'invalid_request', 'Invalid combo', { issues: merged.error.issues });
  const combo: Combo = merged.data;

  // A live combo must stay buyable: anything that would leave it unpublishable (or a new publish
  // that isn't ready) is refused with the reasons, rather than saved and discovered by a customer.
  if (combo.status === 'published') {
    const problems = await checkComboPublishable(combo, firestorePublishDeps(db));
    if (problems.length > 0) {
      return adminApiError(422, 'not_publishable', 'This combo is not ready to be published', { problems });
    }
  }

  await db.collection(COMBOS_COLLECTION).doc(id).set(combo);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: existing.status !== combo.status ? `combo.${combo.status}` : 'combo.update',
    resource: 'combo',
    resourceId: id,
    details: { fields: Object.keys(body), version: combo.version },
  }).catch((error) => logger.error('Failed to write audit log', { comboId: id, error: String(error) }));

  revalidateComboPages(existing.slug);
  if (combo.slug !== existing.slug) revalidateComboPages(combo.slug);
  return NextResponse.json({ combo }, { status: 200 });
}

/** "Delete" archives: orders and carts that mention the combo keep working, but it disappears from the shop. */
export async function DELETE(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) return tooMany(rateLimit.retryAfterSeconds);
  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue write access required');
  }
  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const existing = await getComboById(db, id);
  if (!existing) return adminApiError(404, 'not_found', 'Combo not found');

  const archived: Combo = { ...existing, status: 'archived', updatedAt: new Date().toISOString() };
  await db.collection(COMBOS_COLLECTION).doc(id).set(archived);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'combo.archive',
    resource: 'combo',
    resourceId: id,
    details: { slug: existing.slug },
  }).catch((error) => logger.error('Failed to write audit log', { comboId: id, error: String(error) }));

  revalidateComboPages(existing.slug);
  return NextResponse.json({ combo: archived }, { status: 200 });
}
