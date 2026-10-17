import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { PageSchema, parseBusinessProfile, parseReturnsSettings, parseStateShipping } from '@bro-pics/shared';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { withDates } from '../../../../lib/firestore-dates';
import { computeReadiness } from '../../../../lib/launch-readiness';

/**
 * Read-only checklist of what is still missing from the business, shipping, returns and policy-page settings.
 * Returns counts and plain labels only: no customer data and no document contents.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'settings:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings access required');
  }

  const db = getFirestore(getAdminApp());
  const [store, shipping, returns, pagesSnap, productsSnap] = await Promise.all([
    db.collection('settings').doc('store').get(),
    db.collection('settings').doc('shipping').get(),
    db.collection('settings').doc('returns').get(),
    db.collection('pages').get(),
    db.collection('products').where('isActive', '==', true).select('returnPolicy').get(),
  ]);
  const pages = pagesSnap.docs.flatMap((d) => {
    const parsed = PageSchema.safeParse(withDates(d.data()));
    return parsed.success ? [parsed.data] : [];
  });
  const productsWithoutReturnPolicy = productsSnap.docs.filter((d) => !d.data().returnPolicy).length;

  return NextResponse.json({
    items: computeReadiness({
      profile: store.exists ? parseBusinessProfile(store.data()) : null,
      shipping: parseStateShipping(shipping.exists ? shipping.data() : null),
      returns: parseReturnsSettings(returns.exists ? returns.data() : null),
      pages,
      productsWithoutReturnPolicy,
      totalActiveProducts: productsSnap.size,
    }),
  });
}
