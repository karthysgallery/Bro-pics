import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateTestimonialBodySchema } from '../testimonial-request-schema';
import { logger, type Testimonial } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const ref = db.collection('testimonials').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown testimonial id: ${id}`);
  }
  const current = snap.data() as Testimonial;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateTestimonialBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid testimonial body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  await ref.update({ ...body });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'testimonial.update',
    resource: 'testimonial',
    resourceId: id,
    details: { changedFields: Object.keys(body) },
  }).catch((error) => logger.error('Failed to write audit log', { testimonialId: id, error: String(error) }));

  return NextResponse.json({ testimonial: { ...current, ...body } }, { status: 200 });
}
