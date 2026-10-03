import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'settings:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Settings read access required');
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() || '';
  const zone = url.searchParams.get('zone')?.trim() || '';

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('shippingServiceability').limit(200).get();

  let items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Fallback / seed initial default records if collection is empty
  if (items.length === 0) {
    items = [
      { id: '110001', pincode: '110001', state: 'Delhi', zone: 'metro', isServiceable: true, etaMinDays: 2, etaMaxDays: 4, codAvailable: true, preferredCourierId: 'delhivery' },
      { id: '400001', pincode: '400001', state: 'Maharashtra', zone: 'metro', isServiceable: true, etaMinDays: 2, etaMaxDays: 4, codAvailable: true, preferredCourierId: 'bluedart' },
      { id: '560001', pincode: '560001', state: 'Karnataka', zone: 'metro', isServiceable: true, etaMinDays: 2, etaMaxDays: 3, codAvailable: true, preferredCourierId: 'delhivery' },
      { id: '600001', pincode: '600001', state: 'Tamil Nadu', zone: 'metro', isServiceable: true, etaMinDays: 2, etaMaxDays: 4, codAvailable: true, preferredCourierId: 'xpressbees' },
      { id: '700001', pincode: '700001', state: 'West Bengal', zone: 'metro', isServiceable: true, etaMinDays: 3, etaMaxDays: 5, codAvailable: true, preferredCourierId: 'bluedart' },
      { id: '380001', pincode: '380001', state: 'Gujarat', zone: 'metro', isServiceable: true, etaMinDays: 2, etaMaxDays: 4, codAvailable: true, preferredCourierId: 'delhivery' },
      { id: '682001', pincode: '682001', state: 'Kerala', zone: 'standard', isServiceable: true, etaMinDays: 4, etaMaxDays: 6, codAvailable: true, preferredCourierId: 'dtdc' },
      { id: '190001', pincode: '190001', state: 'Jammu & Kashmir', zone: 'remote', isServiceable: true, etaMinDays: 6, etaMaxDays: 10, codAvailable: false, preferredCourierId: 'indiapost' },
      { id: '744101', pincode: '744101', state: 'Andaman & Nicobar', zone: 'remote', isServiceable: true, etaMinDays: 7, etaMaxDays: 12, codAvailable: false, preferredCourierId: 'indiapost' },
    ];
  }

  if (search) {
    items = items.filter(
      (item: any) =>
        item.pincode?.includes(search) || item.state?.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (zone) {
    items = items.filter((item: any) => item.zone === zone);
  }

  return NextResponse.json({ serviceability: items, total: items.length });
}
