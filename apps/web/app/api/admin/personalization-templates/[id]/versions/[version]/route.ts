import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../../lib/admin-api-error';
import { getTemplateVersion, saveDraft } from '../../../../../../../lib/personalization-templates';
import { templateErrorResponse } from '../../../../../../../lib/personalization-template-http';

interface RouteParams {
  params: Promise<{ id: string; version: string }>;
}

async function guard(request: Request, key: 'catalogue:read' | 'catalogue:write') {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, key);
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');
  return null;
}

const parseVersion = (raw: string) => (/^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null);

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const denied = await guard(request, 'catalogue:read');
  if (denied) return denied;
  const { id, version } = await params;
  const v = parseVersion(version);
  if (!v) return adminApiError(400, 'invalid_request', 'Invalid version');
  const template = await getTemplateVersion(getFirestore(getAdminApp()), id, v);
  return template ? NextResponse.json(template, { status: 200 }) : adminApiError(404, 'not_found', `${id}@v${v} does not exist`);
}

/** Saves edits to a DRAFT/REVIEW version in place. Published and archived versions refuse (409). */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const denied = await guard(request, 'catalogue:write');
  if (denied) return denied;
  const { id, version } = await params;
  const v = parseVersion(version);
  if (!v) return adminApiError(400, 'invalid_request', 'Invalid version');
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await saveDraft(getFirestore(getAdminApp()), id, v, body), { status: 200 });
  } catch (err) {
    return templateErrorResponse(err);
  }
}
