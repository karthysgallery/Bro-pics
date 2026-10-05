import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../../../lib/audit-log';
import { getTemplateVersion, transitionStatus } from '../../../../../../../../lib/personalization-templates';
import { buildAssetExists, templateErrorResponse } from '../../../../../../../../lib/personalization-template-http';
import { TemplateStatusSchema, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string; version: string }>;
}

/**
 * Lifecycle: draft → review → published → archived. PUBLISHING needs the stronger
 * `catalogue:publish` permission and runs the full publish-time validation,
 * including that every referenced asset exists in the media library.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }

  const body = await request.json().catch(() => null);
  const target = TemplateStatusSchema.safeParse(body?.to);
  if (!target.success) return adminApiError(400, 'invalid_request', 'Body must be {"to": "draft"|"review"|"published"|"archived"}');

  const permission = await requirePermission(request, target.data === 'published' ? 'catalogue:publish' : 'catalogue:write');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');

  const { id, version } = await params;
  if (!/^\d+$/.test(version) || Number(version) < 1) return adminApiError(400, 'invalid_request', 'Invalid version');
  const v = Number(version);
  const db = getFirestore(getAdminApp());

  try {
    let validate;
    if (target.data === 'published') {
      const current = await getTemplateVersion(db, id, v);
      if (current) validate = { assetExists: await buildAssetExists(db, current) };
    }
    const next = await transitionStatus(db, id, v, target.data, { validate });
    await writeAuditLog(db, {
      actorUid: permission.uid,
      action: `personalization_template.${target.data}`,
      resource: 'personalization_template',
      resourceId: `${id}@v${v}`,
      details: {},
    }).catch((e) => logger.error('Failed to write audit log', { error: String(e) }));
    return NextResponse.json(next, { status: 200 });
  } catch (err) {
    return templateErrorResponse(err);
  }
}
