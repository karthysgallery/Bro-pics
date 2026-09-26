import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { revalidateHomepage } from '../../../../../lib/revalidate-catalogue';
import { UpdateHomepageSectionBodySchema } from '../homepage-section-request-schema';
import { logger, type HomepageSection } from '@bro-pics/shared';

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
  const ref = db.collection('homepageSections').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return adminApiError(404, 'not_found', `Unknown homepage section id: ${id}`);
  }
  const current = snap.data() as HomepageSection;

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateHomepageSectionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid homepage section body', { issues: parsed.error.issues });
  }
  const update = parsed.data;

  await ref.update({ ...update });

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'homepage_section.update',
    resource: 'homepage_section',
    resourceId: id,
    details: { changedFields: Object.keys(update) },
  }).catch((error) => logger.error('Failed to write audit log', { sectionId: id, error: String(error) }));

  revalidateHomepage();

  return NextResponse.json({ section: { ...current, ...update } }, { status: 200 });
}
