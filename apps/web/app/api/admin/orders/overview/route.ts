import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { roleHasPermission } from '@bro-pics/shared';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission, getPermissionContext } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import type { OrderRow } from '../../../../../lib/admin-orders-view';

/** The newest orders the overview loads; filters, counts and search then run in the browser. */
const OVERVIEW_LIMIT = 500;
const REFUNDS_LIMIT = 2000;

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/**
 * GET /api/admin/orders/overview — the latest orders as list rows: payment and production status kept apart,
 * customer name/phone/city from the order's own address, product title and catalogue picture from the products,
 * and money refunded. Reads: one orders query, one read per distinct product, one refunds read, and (only for
 * roles that may see customers) one read per distinct customer for the email address.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }
  const permission = await requirePermission(request, 'orders:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Staff access required');
  }
  const ctx = await getPermissionContext(request);
  const canSeeCustomers = ctx.authenticated && !!ctx.role && roleHasPermission(ctx.role, 'customers:read');

  const db = getFirestore(getAdminApp());
  const snap = await db.collection('orders').orderBy('placedAt', 'desc').limit(OVERVIEW_LIMIT).get();
  const orders = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));

  const productIds = [...new Set(orders.map((o) => (Array.isArray(o.data.productIds) ? (o.data.productIds[0] as string) : null)).filter((x): x is string => !!x))];
  const userIds = canSeeCustomers ? [...new Set(orders.map((o) => str(o.data.userId)).filter((x): x is string => !!x))] : [];

  const [productDocs, userDocs, refundDocs] = await Promise.all([
    productIds.length ? db.getAll(...productIds.map((id) => db.collection('products').doc(id))) : Promise.resolve([]),
    userIds.length ? db.getAll(...userIds.map((id) => db.collection('users').doc(id))) : Promise.resolve([]),
    // Refunds are few; read them (capped, no index needed) and keep processed ones. A failed or capped read is
    // reported to the screen rather than silently showing refunded orders as paid.
    db.collectionGroup('refunds').limit(REFUNDS_LIMIT).get().catch(() => null),
  ]);

  const products = new Map<string, { title: string | null; image: string | null }>();
  for (const p of productDocs) {
    if (!p.exists) continue;
    const d = p.data() as Record<string, unknown>;
    products.set(p.id, { title: str(d.title), image: str(d.listingImageUrl) ?? str(d.primaryImageUrl) });
  }
  const emails = new Map<string, string | null>();
  for (const u of userDocs) if (u.exists) emails.set(u.id, str((u.data() as Record<string, unknown>).email));
  const refunded = new Map<string, number>();
  for (const r of refundDocs?.docs ?? []) {
    const d = r.data() as { status?: string; amount?: number; orderId?: string };
    const orderId = d.orderId ?? r.ref.parent.parent?.id;
    if (d.status === 'processed' && orderId && typeof d.amount === 'number') refunded.set(orderId, (refunded.get(orderId) ?? 0) + d.amount);
  }

  const rows: OrderRow[] = orders.map(({ id, data: o }) => {
    const a = (o.addressJson ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(o.productIds) ? (o.productIds as string[]) : [];
    const product = ids[0] ? products.get(ids[0]) : undefined;
    const failure = o.paymentFailure as Record<string, unknown> | undefined;
    return {
      id,
      orderNo: str(o.orderNo) ?? id,
      status: str(o.status) ?? 'pending_payment',
      paymentStatus: str(o.paymentStatus) ?? 'pending',
      paymentMode: str(o.paymentMode) ?? 'prepaid',
      paymentProvider: str(o.paymentProvider),
      total: typeof o.total === 'number' ? o.total : 0,
      amountPaidOnline: typeof o.amountPaidOnline === 'number' ? o.amountPaidOnline : 0,
      amountDueOnDelivery: typeof o.amountDueOnDelivery === 'number' ? o.amountDueOnDelivery : 0,
      placedAt: toIso(o.placedAt),
      userId: str(o.userId),
      customerName: str(a.recipientName) ?? str(o.customerName),
      phone: str(a.phone),
      email: canSeeCustomers && str(o.userId) ? (emails.get(o.userId as string) ?? null) : null,
      city: str(a.city),
      state: str(a.state),
      pincode: str(a.pincode),
      productTitle: product?.title ?? null,
      productImage: product?.image ?? null,
      productCount: ids.length,
      hasGlitter: o.hasGlitter === true,
      razorpayOrderId: str(o.razorpayOrderId),
      razorpayPaymentId: str(o.razorpayPaymentId),
      invoiceNo: str(o.invoiceNo),
      refundedAmount: refunded.get(id) ?? 0,
      paymentFailure: failure
        ? { reason: str(failure.reason), code: str(failure.code), at: str(failure.at), razorpayPaymentId: str(failure.razorpayPaymentId) }
        : null,
    };
  });

  const refundsUnavailable = refundDocs === null || refundDocs.size >= REFUNDS_LIMIT;
  return NextResponse.json({ orders: rows, truncated: snap.size >= OVERVIEW_LIMIT, limit: OVERVIEW_LIMIT, canSeeCustomers, refundsUnavailable }, { status: 200 });
}
