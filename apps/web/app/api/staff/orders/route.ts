import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { findOrdersByStatus } from '../../../../lib/order-lookup';
import { OrderStatusSchema } from '@bro-pics/shared';

export async function GET(request: Request): Promise<NextResponse> {
  const staffUserId = await getStaffUserIdFromAuthHeader(request);
  if (!staffUserId) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const parsed = OrderStatusSchema.safeParse(statusParam);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid status' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const found = await findOrdersByStatus(db, parsed.data);
  const orders = found.map(({ id, data }) => ({
    id,
    orderNo: data.orderNo,
    status: data.status,
    total: data.total,
    placedAt: data.placedAt,
    addressJson: data.addressJson,
  }));

  return NextResponse.json({ orders }, { status: 200 });
}
