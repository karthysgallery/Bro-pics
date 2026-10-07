import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { ComboSchema, logger } from '@bro-pics/shared';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { revalidateComboPages } from '../../../../lib/revalidate-catalogue';
import { getAllCombos, COMBOS_COLLECTION } from '../../../../lib/firestore-combos';
import { CreateComboBodySchema } from './combo-request-schema';

/** All combos, drafts and archived included, for the admin list. */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue read access required');
  }
  const db = getFirestore(getAdminApp());
  return NextResponse.json({ combos: await getAllCombos(db) }, { status: 200 });
}

/** Creates a draft combo. Publishing is a separate, checked step (PATCH status). */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'catalogue:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateComboBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid combo', { issues: parsed.error.issues });
  }
  const body = parsed.data;
  const db = getFirestore(getAdminApp());

  // Check-then-write, the same documented non-transactional caveat as product and category slugs.
  const slugConflict = await db.collection(COMBOS_COLLECTION).where('slug', '==', body.slug).limit(1).get();
  if (!slugConflict.empty) {
    return adminApiError(409, 'conflict', `A combo with the address "${body.slug}" already exists`);
  }

  const ref = db.collection(COMBOS_COLLECTION).doc();
  const now = new Date().toISOString();
  const combo = ComboSchema.parse({ ...body, id: ref.id, status: 'draft', version: 1, createdAt: now, updatedAt: now });
  await ref.set(combo);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'combo.create',
    resource: 'combo',
    resourceId: ref.id,
    details: { slug: combo.slug, price: combo.price, frames: combo.items.reduce((n, i) => n + i.quantity, 0) },
  }).catch((error) => logger.error('Failed to write audit log', { comboId: ref.id, error: String(error) }));

  revalidateComboPages(combo.slug);
  return NextResponse.json({ combo }, { status: 201 });
}
