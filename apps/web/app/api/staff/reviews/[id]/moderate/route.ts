import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { logger } from '@bro-pics/shared';

export async function POST(
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
  const staffUserId = permission.uid;

  const body = await request.json();
  const action = body?.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  // [ABE-22] Optional moderation note — visible only to staff (nothing
  // public reads `moderationNote`), typically used to record why a
  // borderline review was rejected or what was edited/redacted.
  const note = body?.note;
  if (note !== undefined && typeof note !== 'string') {
    return NextResponse.json({ error: 'note must be a string' }, { status: 400 });
  }

  const { id } = await context.params;
  const db = getFirestore(getAdminApp());
  const reviewRef = db.collection('reviews').doc(id);
  const reviewDoc = await reviewRef.get();
  if (!reviewDoc.exists) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }
  const current = reviewDoc.data() as { status: string };
  if (current.status !== 'pending') {
    return NextResponse.json({ error: 'Review is not pending' }, { status: 409 });
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  const update: Record<string, unknown> = { status: nextStatus };
  if (typeof note === 'string') {
    update.moderationNote = note;
  }
  await reviewRef.update(update);

  await writeAuditLog(db, {
    actorUid: staffUserId,
    action: 'review.moderate',
    resource: 'review',
    resourceId: id,
    details: { fromStatus: current.status, toStatus: nextStatus },
  }).catch((error) => logger.error('Failed to write audit log', { reviewId: id, error: String(error) }));

  return NextResponse.json({ id, status: nextStatus }, { status: 200 });
}
