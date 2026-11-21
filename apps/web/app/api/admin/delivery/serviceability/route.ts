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

  const db = getFirestore(getAdminApp());
  const col = db.collection('shippingServiceability');
  // Only real saved rows: an empty list means checkout uses the built-in PIN ranges (no sample rows).
  const totalSnap = await col.count().get();
  const total = totalSnap.data().count;

  let items: Record<string, unknown>[];
  if (/^\d{6}$/.test(search)) {
    const doc = await col.doc(search).get();
    items = doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
  } else {
    const snap = await col.orderBy('pincode').limit(500).get();
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((item) => String(item.pincode ?? '').startsWith(search) || String(item.state ?? '').toLowerCase().includes(q));
    }
  }

  return NextResponse.json({ serviceability: items, total, shown: items.length });
}
