import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { ReviewPlacementSchema, logger } from '@bro-pics/shared';

/**
 * [ABE-22] Separate from .../moderate: featuring a review only makes
 * sense once it's already `approved` (moderate's own 409 guard requires
 * `pending`), and staff may want to un-feature or move placement long
 * after the approve/reject decision — a distinct action, not another
 * status transition.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'reviews:moderate');
  if (!permission.ok) {
    return NextResponse.json({ error: 'Staff access required' }, { status: permission.status });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const body = rawBody as { featured?: unknown; placement?: unknown };

  const update: Record<string, unknown> = {};
  if ('featured' in body) {
    if (typeof body.featured !== 'boolean') {
      return NextResponse.json({ error: 'featured must be a boolean' }, { status: 400 });
    }
    update.featured = body.featured;
  }
  if ('placement' in body) {
    if (body.placement !== null) {
      const parsed = ReviewPlacementSchema.safeParse(body.placement);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
      }
    }
    update.placement = body.placement;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { id } = await context.params;
  const db = getFirestore(getAdminApp());
  const reviewRef = db.collection('reviews').doc(id);
  const reviewDoc = await reviewRef.get();
  if (!reviewDoc.exists) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }
  const current = reviewDoc.data() as { status: string };
  if (current.status !== 'approved') {
    return NextResponse.json({ error: 'Only an approved review can be featured or placed' }, { status: 400 });
  }

  await reviewRef.update(update);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'review.update',
    resource: 'review',
    resourceId: id,
    details: { changedFields: Object.keys(update) },
  }).catch((error) => logger.error('Failed to write audit log', { reviewId: id, error: String(error) }));

  return NextResponse.json({ id, ...update }, { status: 200 });
}
