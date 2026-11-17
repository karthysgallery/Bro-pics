import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';
import { safeRevalidate } from '../../../../lib/revalidate-catalogue';
import { MarketingSettingsSchema, logger } from '@bro-pics/shared';

const BodySchema = z
  .object({
    metaPixelId: z
      .string()
      .trim()
      .regex(/^(\d{10,20})?$/, 'A Pixel ID is a number of 10 to 20 digits.'),
    metaEnabled: z.boolean(),
    metaTestEventCode: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/, 'Letters and numbers only.'),
  })
  .strict()
  .refine((b) => !b.metaEnabled || b.metaPixelId, { message: 'Enter the Pixel ID before switching tracking on.', path: ['metaPixelId'] });

/** Meta (Facebook & Instagram) ad measurement settings. The Conversions API token is never stored or shown here. */
export async function GET(request: Request): Promise<NextResponse> {
  const permission = await requirePermission(request, 'settings:read');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings read access required');
  const snap = await getFirestore(getAdminApp()).collection('settings').doc('marketing').get();
  const parsed = MarketingSettingsSchema.safeParse({ ...(snap.data() ?? {}), updatedAt: undefined });
  return NextResponse.json({ settings: parsed.success ? parsed.data : MarketingSettingsSchema.parse({})});
}

export async function PUT(request: Request): Promise<NextResponse> {
  const permission = await requirePermission(request, 'settings:write');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings write access required');
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid settings', { issues: parsed.error.issues });
  const db = getFirestore(getAdminApp());
  await db.collection('settings').doc('marketing').set({ ...parsed.data, updatedAt: new Date() }, { merge: true });
  // The Pixel is added by the shop's root layout, so every page picks the change up.
  safeRevalidate('/', 'layout');
  await writeAuditLog(db, { actorUid: permission.uid, action: 'marketing.meta.update', resource: 'settings', resourceId: 'marketing', details: { metaEnabled: parsed.data.metaEnabled, hasPixel: Boolean(parsed.data.metaPixelId) } }).catch(
    (error) => logger.error('Failed to write audit log', { error: String(error) })
  );
  return NextResponse.json({ ok: true });
}
