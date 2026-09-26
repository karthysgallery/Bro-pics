import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { SETTINGS_REGISTRY, isKnownSettingsKey } from './settings-registry';
import { logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ key: string }>;
}

/**
 * [ABE-24] `GET/PUT /api/admin/settings/{doc}` exactly as the task names
 * it — one generic route validating against a per-key schema from
 * `settings-registry.ts`, rather than a bespoke route per settings
 * domain. A never-configured key reads back `null`, not a 404 — same
 * "falls back to a sensible empty state" behavior `getShippingSettings`
 * etc. already give their own callers for a doc that doesn't exist yet.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'settings:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings write access required');
  }

  const { key } = await params;
  if (!isKnownSettingsKey(key)) {
    return adminApiError(404, 'not_found', `Unknown settings key: ${key}`);
  }

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('settings').doc(key).get();

  return NextResponse.json({ key, value: snap.exists ? snap.data() : null }, { status: 200 });
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'settings:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings write access required');
  }

  const { key } = await params;
  if (!isKnownSettingsKey(key)) {
    return adminApiError(404, 'not_found', `Unknown settings key: ${key}`);
  }

  const rawBody = await request.json().catch(() => null);
  const schema = SETTINGS_REGISTRY[key];
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', `Invalid ${key} settings body`, { issues: parsed.error.issues });
  }

  const db = getFirestore(getAdminApp());
  // Full replace, not a partial update — same reasoning as the
  // announcement-bar route: each settings doc is one small config, not a
  // resource with independently PATCHable fields.
  await db.collection('settings').doc(key).set(parsed.data);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'settings.update',
    resource: 'settings',
    resourceId: key,
  }).catch((error) => logger.error('Failed to write audit log', { key, error: String(error) }));

  return NextResponse.json({ key, value: parsed.data }, { status: 200 });
}
