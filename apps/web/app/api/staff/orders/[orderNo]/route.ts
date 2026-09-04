import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { findOrderByOrderNo } from '../../../../../lib/order-lookup';
import type { OrderItem } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderNo: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { orderNo } = await params;
  const db = getFirestore(getAdminApp());
  const found = await findOrderByOrderNo(db, orderNo);
  if (!found) {
    return NextResponse.json({ error: `Unknown orderNo: ${orderNo}` }, { status: 404 });
  }

  const itemsSnapshot = await db.collection('orders').doc(found.id).collection('items').get();
  const items = itemsSnapshot.docs.map((doc) => doc.data() as OrderItem);

  return NextResponse.json({ order: found.data, items }, { status: 200 });
}
