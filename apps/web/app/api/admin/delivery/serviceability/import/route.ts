import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { normalizeStateName, plausibleStatesForPincode } from '@bro-pics/shared';
import { z } from 'zod';

const ImportItemSchema = z.object({
  pincode: z.string().regex(/^[1-8][0-9]{5}$/, 'Invalid Indian pincode'),
  state: z.string().min(1),
  zone: z.enum(['metro', 'standard', 'remote']),
  isServiceable: z.boolean().default(true),
  etaMinDays: z.number().int().min(1).max(30),
  etaMaxDays: z.number().int().min(1).max(30),
  codAvailable: z.boolean().default(true),
  preferredCourierId: z.string().optional(),
});

const ImportBodySchema = z.object({
  items: z.array(ImportItemSchema).min(1).max(1000),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'shipping:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Shipping write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = ImportBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid import data format', { issues: parsed.error.issues });
  }

  // Checkout blocks an address whose state differs from this list, so a mistyped state would stop real orders.
  // Every row's state must be a real state/UT name and fit the PIN's range; otherwise nothing is saved.
  const rejected: Array<{ pincode: string; state: string; reason: string }> = [];
  const items = parsed.data.items.map((item) => {
    const state = normalizeStateName(item.state);
    const plausible = plausibleStatesForPincode(item.pincode);
    if (!state) rejected.push({ pincode: item.pincode, state: item.state, reason: 'not a state or union territory name' });
    else if (plausible && !plausible.includes(state)) rejected.push({ pincode: item.pincode, state: item.state, reason: `this PIN belongs to ${plausible.join(' / ')}` });
    return { ...item, state: state ?? item.state };
  });
  if (rejected.length > 0) {
    return adminApiError(400, 'invalid_request', `${rejected.length} row(s) have a wrong state. Nothing was saved.`, { rejected: rejected.slice(0, 50) });
  }

  const db = getFirestore(getAdminApp());
  const batch = db.batch();

  for (const item of items) {
    const docRef = db.collection('shippingServiceability').doc(item.pincode);
    batch.set(docRef, {
      ...item,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  await batch.commit();

  await writeAuditLog(db, {
    actorUid: permission.uid,
    action: 'shipping.import_serviceability',
    resource: 'shipping_serviceability',
    resourceId: 'batch',
    details: { count: items.length },
  });

  return NextResponse.json({ success: true, count: items.length });
}
