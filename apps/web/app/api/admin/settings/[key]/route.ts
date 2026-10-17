import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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

/** Settings that define what the shop promises customers. */
const PROMISE_SETTINGS_KEYS: ReadonlySet<string> = new Set(['store', 'shipping', 'returns', 'policyFacts', 'gst']);

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

  // What customers are promised (business identity, shipping charges, return rules, policy wording, tax status) needs
  // the stronger permission held by super_admin and admin; a settings:write role such as marketing_manager cannot change it.
  if (PROMISE_SETTINGS_KEYS.has(key)) {
    const approver = await requirePermission(request, 'policies:approve');
    if (!approver.ok) {
      return adminApiError(approver.status, approver.status === 401 ? 'unauthenticated' : 'forbidden', 'Only an administrator can change business, shipping, returns, policy or tax settings');
    }
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
  // Shop pages are cached; a new theme (or header/footer/SEO) should show right away.
  if (key === 'theme' || key === 'appearance' || key === 'siteText' || key === 'header' || key === 'footer' || key === 'seo' || key === 'store' || key === 'returns' || key === 'policyFacts' || key === 'shipping') {
    try {
      revalidatePath('/', 'layout');
    } catch {
      // Outside a Next.js request (tests) there is nothing to revalidate.
    }
  }

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'settings.update',
    resource: 'settings',
    resourceId: key,
  }).catch((error) => logger.error('Failed to write audit log', { key, error: String(error) }));

  return NextResponse.json({ key, value: parsed.data }, { status: 200 });
}
