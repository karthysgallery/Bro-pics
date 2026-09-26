import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { revalidateHomepage } from '../../../../lib/revalidate-catalogue';
import { CreateHomepageSectionBodySchema } from './homepage-section-request-schema';
import { HomepageSectionSchema, logger } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
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

  const rawBody = await request.json().catch(() => null);
  const parsed = CreateHomepageSectionBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid homepage section body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  const ref = db.collection('homepageSections').doc();
  const section = HomepageSectionSchema.parse({ id: ref.id, ...body, previewToken: null });
  await ref.set(section);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'homepage_section.create',
    resource: 'homepage_section',
    resourceId: ref.id,
    details: { type: body.type },
  }).catch((error) => logger.error('Failed to write audit log', { sectionId: ref.id, error: String(error) }));

  revalidateHomepage();

  return NextResponse.json({ section }, { status: 201 });
}
