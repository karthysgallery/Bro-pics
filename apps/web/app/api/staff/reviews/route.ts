import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { ReviewStatusSchema } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = ReviewStatusSchema.safeParse(url.searchParams.get('status'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('status', '==', parsed.data).get();
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

  const distinctProductIds = [...new Set(rows.map((r) => r.productId as string))];
  const productEntries = await Promise.all(
    distinctProductIds.map(async (productId) => {
      const productDoc = await db.collection('products').doc(productId).get();
      return [productId, productDoc.exists ? (productDoc.data() as { title: string }).title : 'Unknown product'] as const;
    })
  );
  const titleByProductId = new Map(productEntries);

  const reviews = rows.map((r) => ({ ...r, productTitle: titleByProductId.get(r.productId as string) }));

  return NextResponse.json({ reviews }, { status: 200 });
}
