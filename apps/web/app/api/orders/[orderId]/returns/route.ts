import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { ReturnSchema, ReturnReasonCategorySchema, decideReturnRequest, parseReturnsSettings, resolveProductKind, type KindResolution, type Order, type OrderEvent } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// There is no fixed return window in code. Whether a claim window exists, and how long it is, is an
// owner-approved setting (settings/returns): until the owner approves one, claims for a damaged,
// defective or wrong item are accepted for review rather than refused on an invented deadline, and the
// claim is flagged for staff. "Changed my mind" is decided per product kind (see returns/eligibility.ts).

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists || (orderSnap.data() as Order).userId !== userId) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }

  const snapshot = await db.collection('returns').where('orderId', '==', orderId).get();
  return NextResponse.json({ returns: snapshot.docs.map((d) => d.data()) }, { status: 200 });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'Missing reason' }, { status: 400 });
  }
  const reasonCategoryParsed = ReturnReasonCategorySchema.safeParse(body?.reasonCategory);
  if (!reasonCategoryParsed.success) {
    return NextResponse.json({ error: 'Missing or invalid reasonCategory' }, { status: 400 });
  }
  const reasonCategory = reasonCategoryParsed.data;
  // Storage object paths only (never URLs — see Upload.originalPath's own
  // doc comment) — the customer uploads evidence photos via
  // POST /api/orders/[orderId]/returns/evidence first, then passes the
  // resulting paths here when actually filing the return.
  const evidencePaths = Array.isArray(body?.evidencePaths)
    ? body.evidencePaths.filter((p: unknown): p is string => typeof p === 'string')
    : [];
  // [FE-23] A damage claim with no photo is nothing staff can act on
  // beyond taking the customer's word for it — required specifically for
  // 'damaged', not every category (a "changed my mind" return has
  // nothing to photograph).
  if (reasonCategory === 'damaged' && evidencePaths.length === 0) {
    return NextResponse.json({ error: 'At least one evidence photo is required for a damage claim' }, { status: 400 });
  }
  const preferredResolutionParsed = z.enum(['refund', 'replacement']).nullable().optional().safeParse(body?.preferredResolution);
  if (!preferredResolutionParsed.success) {
    return NextResponse.json({ error: 'Invalid preferredResolution' }, { status: 400 });
  }
  const preferredResolution = preferredResolutionParsed.data;

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }
  const order = orderSnap.data() as Order;
  if (order.userId !== userId) {
    return NextResponse.json({ error: `Unknown orderId: ${orderId}` }, { status: 404 });
  }
  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Only a delivered order can be returned' }, { status: 400 });
  }

  const existingReturns = await db.collection('returns').where('orderId', '==', orderId).get();
  if (!existingReturns.empty) {
    return NextResponse.json({ error: 'A return has already been requested for this order' }, { status: 409 });
  }

  const deliveredEventSnap = await orderRef.collection('events').where('status', '==', 'delivered').limit(1).get();
  if (deliveredEventSnap.empty) {
    // Order status says delivered but no event recorded it — a data
    // inconsistency this route shouldn't paper over by guessing a window.
    return NextResponse.json({ error: 'Could not verify delivery date' }, { status: 400 });
  }
  const deliveredEvent = deliveredEventSnap.docs[0].data() as OrderEvent;
  const deliveredAt = new Date(deliveredEvent.createdAt);

  // Which return rule each product on the order follows (its own override, then what it is, then its category),
  // and the owner's current settings. Read here on the server: the browser cannot choose its own eligibility.
  const itemSnaps = await orderRef.collection('items').get();
  const productIds = [...new Set(itemSnaps.docs.map((d) => (d.data() as { productId?: string }).productId).filter((id): id is string => typeof id === 'string'))];
  const kinds: KindResolution[] = [];
  const categoryCache = new Map<string, { returnPolicy?: 'personalized' | 'ready_made' | null }>();
  for (const productId of productIds) {
    const productSnap = await db.collection('products').doc(productId).get();
    const product = (productSnap.exists ? productSnap.data() : {}) as Record<string, unknown>;
    const categoryId = typeof product.categoryId === 'string' ? product.categoryId : null;
    if (categoryId && !categoryCache.has(categoryId)) {
      const categorySnap = await db.collection('categories').doc(categoryId).get();
      categoryCache.set(categoryId, (categorySnap.exists ? categorySnap.data() : {}) as { returnPolicy?: 'personalized' | 'ready_made' | null });
    }
    kinds.push(
      resolveProductKind(
        {
          returnPolicy: (product.returnPolicy as 'personalized' | 'ready_made' | null | undefined) ?? null,
          productType: (product.productType as 'ready_made' | 'single_photo' | 'collage' | undefined) ?? null,
          photoSlots: typeof product.photoSlots === 'number' ? product.photoSlots : null,
          allowsTextPersonalization: product.allowsTextPersonalization === true,
        },
        categoryId ? categoryCache.get(categoryId) : null
      )
    );
  }
  if (kinds.length === 0) kinds.push({ kind: 'personalized', source: 'assumed' });
  const settings = parseReturnsSettings((await db.collection('settings').doc('returns').get()).data());
  const decision = decideReturnRequest({ reason: reasonCategory, kinds, deliveredAt, now: new Date(), settings });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message ?? 'This request cannot be accepted.', code: 'return_not_eligible' }, { status: 422 });
  }
  const unboxingNote = typeof body?.unboxingNote === 'string' && body.unboxingNote.trim() ? body.unboxingNote.trim().slice(0, 300) : undefined;

  const returnRef = db.collection('returns').doc();
  const returnDoc = ReturnSchema.parse({
    id: returnRef.id,
    orderId,
    userId,
    reasonCategory,
    reason,
    status: 'requested',
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    refundAmount: order.total,
    ...(evidencePaths.length > 0 && { evidencePaths }),
    ...(preferredResolution && { preferredResolution }),
    policyKinds: decision.kinds,
    ...(decision.flags.length > 0 && { policyFlags: decision.flags }),
    ...(unboxingNote && { unboxingNote }),
  });
  await returnRef.set(returnDoc);

  return NextResponse.json({ return: returnDoc }, { status: 200 });
}
