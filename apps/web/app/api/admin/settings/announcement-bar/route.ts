import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { UpdateAnnouncementBarBodySchema } from './announcement-bar-request-schema';
import { logger } from '@bro-pics/shared';

/**
 * [ABE-20] The first admin write route for `settings/{key}` — every
 * `settings/*` doc up to now (announcementBar, shipping, gst, search) is
 * written by hand in the Firebase console; `lib/firestore-settings.ts`'s
 * own comment documents that these are one-doc-per-key, NOT the combined
 * document `SettingsSchema` shape suggests, and this route follows that
 * same per-key convention rather than resurrecting the unused combined
 * shape. A full replace (`.set()`, not a partial `.update()`) — the
 * announcement bar is one small config, not a resource with independently
 * PATCHable fields, so the admin form always submits all three together.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  // [ABE-24] Corrected from 'content:write' (this route's original
  // permission at ABE-20) to the dedicated 'settings:write' key —
  // defined since ABE-01's role matrix specifically for settings docs,
  // granted only to admin/super_admin, but this route was its first real
  // caller and used the wrong, more broadly-granted key (content_manager
  // also holds 'content:write', which was never meant to reach settings).
  const permission = await requirePermission(request, 'settings:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = UpdateAnnouncementBarBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid announcement bar body', { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const db = getFirestore(getAdminApp());
  await db.collection('settings').doc('announcementBar').set(body);

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'settings.announcement_bar_update',
    resource: 'settings',
    resourceId: 'announcementBar',
    details: { isActive: body.isActive },
  }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));

  return NextResponse.json({ announcementBar: body }, { status: 200 });
}
