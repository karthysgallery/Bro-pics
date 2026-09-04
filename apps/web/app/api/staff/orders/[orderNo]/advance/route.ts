import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { getStaffUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { findOrderByOrderNo } from '../../../../../../lib/order-lookup';
import { OrderEventSchema, isValidStatusTransition, type OrderStatus } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderNo: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const body = await request.json();
  const status = body?.status as OrderStatus | undefined;
  const note = typeof body?.note === 'string' ? body.note : null;
  const courier = typeof body?.courier === 'string' ? body.courier : undefined;
  const awbNumber = typeof body?.awbNumber === 'string' ? body.awbNumber : undefined;

  if (!status) {
    return NextResponse.json({ error: 'Missing status' }, { status: 400 });
  }
  if (status === 'shipped' && (!courier || !awbNumber)) {
    return NextResponse.json({ error: 'courier and awbNumber are required when advancing to shipped' }, { status: 400 });
  }
  if (!isValidStatusTransition(found.data.status, status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${found.data.status} to ${status}` },
      { status: 400 }
    );
  }

  const orderRef = db.collection('orders').doc(found.id);
  const eventRef = orderRef.collection('events').doc();

  await db.runTransaction(async (transaction) => {
    const event = OrderEventSchema.parse({
      id: eventRef.id,
      status,
      note,
      courier: status === 'shipped' ? courier : null,
      awbNumber: status === 'shipped' ? awbNumber : null,
      createdAt: new Date().toISOString(),
      createdBy: staffUserId,
    });
    transaction.set(eventRef, event);

    const orderUpdate: Record<string, unknown> = { status };
    if (status === 'shipped') {
      orderUpdate.courier = courier;
      orderUpdate.awbNumber = awbNumber;
    }
    transaction.update(orderRef, orderUpdate);
  });

  return NextResponse.json({ order: { ...found.data, status } }, { status: 200 });
}
