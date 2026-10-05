import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { createDraft, listTemplateSummaries } from '../../../../lib/personalization-templates';
import { templateErrorResponse } from '../../../../lib/personalization-template-http';
import { logger } from '@bro-pics/shared';

async function guard(request: Request, key: 'catalogue:read' | 'catalogue:write') {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return { response: NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }) };
  }
  const permission = await requirePermission(request, key);
  if (!permission.ok) {
    return { response: adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required') };
  }
  return { uid: permission.uid };
}

/** Admin list: one summary row per template design. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'catalogue:read');
  if (g.response) return g.response;
  const db = getFirestore(getAdminApp());
  return NextResponse.json({ templates: await listTemplateSummaries(db) }, { status: 200 });
}

/** Creates a draft (v1 for a new design id, or the next version of an existing one). */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'catalogue:write');
  if (g.response) return g.response;
  const body = await request.json().catch(() => null);
  const db = getFirestore(getAdminApp());
  try {
    const draft = await createDraft(db, body);
    await writeAuditLog(db, {
      actorUid: g.uid!,
      action: 'personalization_template.create_draft',
      resource: 'personalization_template',
      resourceId: `${draft.id}@v${draft.version}`,
      details: { photoSlots: draft.photoSlots.length, type: draft.type },
    }).catch((e) => logger.error('Failed to write audit log', { error: String(e) }));
    return NextResponse.json(draft, { status: 201 });
  } catch (err) {
    return templateErrorResponse(err);
  }
}
