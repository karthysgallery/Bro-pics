import 'server-only';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import type { CartLineInput } from '../../../../lib/checkout-calc';
import { computeOrderPricing } from '../../../../lib/order-pricing';
import { buildLineSnapshot, PersonalizationRejectedError } from '../../../../lib/personalization-order';
import { getPaymentProvider } from '../../../../lib/payments/provider-factory';
import { PaymentNotConfiguredError } from '../../../../lib/payments/types';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { createHash } from 'node:crypto';
import { stateFingerprint, CartComboSchema, COMBO_VARIANT_PREFIX, type OrderCombo } from '@bro-pics/shared';
import {
  generateOrderNo,
  OrderSchema,
  OrderItemSchema,
  OrderEventSchema,
  AddressSchema,
  DeliveryMethodSchema,
  type CounterTransaction,
} from '@bro-pics/shared';

// Matches firestore.rules' carts/{userId} bound exactly [BE-09] — this is
// the defense-in-depth copy, since the Admin SDK (which this route uses)
// bypasses Firestore rules entirely. Not a money concern either way
// (unitPrice is always re-derived from the variant below, never trusted
// from the cart line), just closing an unbounded-qty/garbage-data path.
const MAX_LINE_QTY = 20;

function isMalformedCartLine(item: CartLineInput): boolean {
  // A Combo Offer line is one parent whose frames are validated against the combo on the server;
  // here only its shape: combo marker + a well-formed frame list, one at a time.
  const isCombo = typeof item.variantId === 'string' && item.variantId.startsWith(COMBO_VARIANT_PREFIX);
  if (isCombo) {
    return (
      item.qty !== 1 ||
      typeof item.personalizationId !== 'string' ||
      item.personalizationId.length === 0 ||
      !CartComboSchema.safeParse(item.combo).success ||
      item.variantId !== `${COMBO_VARIANT_PREFIX}${(item.combo as { comboId: string }).comboId}`
    );
  }
  if (item.combo !== undefined) return true; // only a combo line may carry combo data
  return (
    typeof item.variantId !== 'string' ||
    item.variantId.length === 0 ||
    typeof item.personalizationId !== 'string' ||
    item.personalizationId.length === 0 ||
    typeof item.title !== 'string' ||
    item.title.length === 0 ||
    typeof item.qty !== 'number' ||
    !Number.isInteger(item.qty) ||
    item.qty <= 0 ||
    item.qty > MAX_LINE_QTY ||
    // previewPath is optional (CartLineInput: `previewPath?: string`) but if
    // present must actually be a string — this also rejects `null`
    // deliberately: the app itself never writes previewPath as null onto a
    // cart line (it's either a real string or the field is simply absent),
    // so a null here can only come from a hand-crafted write to this
    // owner-writable doc, same threat model as a stray number/object.
    (item.previewPath !== undefined && typeof item.previewPath !== 'string') ||
    // personalization is optional, but if present it must at least be shaped like a claim —
    // its CONTENT is validated (and rebuilt from server data) by buildLineSnapshot below.
    (item.personalization !== undefined &&
      (typeof item.personalization !== 'object' ||
        item.personalization === null ||
        typeof item.personalization.templateId !== 'string' ||
        !Number.isInteger(item.personalization.templateVersion)))
  );
}

// Shape returned both for a fresh order and for an idempotent retry of one.
// `keyId` is only ever the PUBLIC Razorpay key id, and only for orders that
// were actually created through Razorpay.
function existingOrderResponse(order: {
  id: string;
  orderNo?: string;
  status: string;
  paymentStatus?: string;
  paymentProvider?: 'mock' | 'razorpay';
  razorpayOrderId?: string;
  total: number;
}) {
  const provider = order.paymentProvider ?? 'razorpay';
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    razorpayOrderId: order.razorpayOrderId,
    amount: order.total,
    paymentProvider: provider,
    keyId: provider === 'razorpay' ? process.env.RAZORPAY_KEY_ID ?? null : null,
    status: order.status,
    paymentStatus: order.paymentStatus ?? 'pending',
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'checkout');
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
  const addressId = typeof body?.addressId === 'string' ? body.addressId : null;
  if (!addressId) {
    return NextResponse.json({ error: 'Missing addressId' }, { status: 400 });
  }
  const couponCode =
    typeof body?.couponCode === 'string' && body.couponCode.trim().length > 0 ? body.couponCode.trim() : null;
  const idempotencyKey =
    typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : null;

  // Absent entirely means 'standard' (backward-compatible with clients that
  // predate this field); an explicitly-supplied-but-invalid value is a real
  // client error, not silently coerced.
  let deliveryMethod: 'standard' | 'express' = 'standard';
  if (body?.deliveryMethod !== undefined) {
    const parsedMethod = DeliveryMethodSchema.safeParse(body.deliveryMethod);
    if (!parsedMethod.success) {
      return NextResponse.json({ error: 'Invalid deliveryMethod' }, { status: 400 });
    }
    deliveryMethod = parsedMethod.data;
  }

  // Payment mode is decided by SERVER config only (PAYMENT_PROVIDER), never
  // by anything in the request body — a client-supplied flag used to be able
  // to mark an order paid. Resolved before any Firestore write so a
  // misconfigured deploy fails fast and consumes no order number.
  let paymentProvider;
  try {
    paymentProvider = getPaymentProvider();
  } catch (err) {
    if (err instanceof PaymentNotConfiguredError) {
      console.error('Payment provider misconfigured:', err.message);
      return NextResponse.json(
        { error: 'Payments are temporarily unavailable. Please try again later.', code: 'payments_unavailable' },
        { status: 503 }
      );
    }
    throw err;
  }

  const db = getFirestore(getAdminApp());

  const cartDoc = await db.collection('carts').doc(userId).get();
  let cartItems = (cartDoc.exists ? (cartDoc.data() as { items: CartLineInput[] }).items : []) ?? [];
  if (cartItems.length === 0 && Array.isArray(body?.items) && body.items.length > 0) {
    cartItems = body.items;
  }
  if (cartItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  // Validate the cart line shape BEFORE any transaction or Razorpay call
  if (cartItems.some(isMalformedCartLine)) {
    return NextResponse.json({ error: 'Malformed cart line' }, { status: 400 });
  }

  let address: any = null;
  const addressDoc = await db.collection('users').doc(userId).collection('addresses').doc(addressId).get();
  if (addressDoc.exists) {
    const addressParseResult = AddressSchema.safeParse(addressDoc.data());
    if (addressParseResult.success) {
      address = addressParseResult.data;
    }
  }
  if (!address && body?.address) {
    const addressParseResult = AddressSchema.safeParse(body.address);
    if (addressParseResult.success) {
      address = addressParseResult.data;
      try {
        await db.collection('users').doc(userId).collection('addresses').doc(address.id).set(address);
      } catch {
        // optional persistence
      }
    }
  }
  if (!address) {
    return NextResponse.json({ error: `Unknown addressId: ${addressId}` }, { status: 400 });
  }

  // Snapshot who is ordering (address has a phone but no name). Best-effort:
  // an unreadable profile must never block a paid checkout.
  let customerName: string | undefined;
  try {
    const profile = await db.collection('users').doc(userId).get();
    const displayName = profile.exists ? (profile.data() as { displayName?: unknown } | undefined)?.displayName : undefined;
    if (typeof displayName === 'string' && displayName.trim().length > 0) customerName = displayName.trim();
  } catch (err) {
    console.warn('Could not read the customer profile for the order snapshot:', err);
  }

  // Every number below comes from computeOrderPricing — the same function the
  // checkout page's quote and coupon check use — so what was shown is what is charged.
  const pricing = await computeOrderPricing(db, { userId, cartItems, couponCode, deliveryMethod });
  if (pricing.unavailable.length > 0) {
    return NextResponse.json({ unavailable: pricing.unavailable }, { status: 409 });
  }
  // A coupon the customer asked for that no longer applies must be SAID, not
  // silently dropped: they would otherwise pay more than the page told them.
  if (pricing.coupon.requested && !pricing.coupon.applied) {
    return NextResponse.json(
      { error: 'That coupon can no longer be applied to this order.', code: 'coupon_invalid', reason: pricing.coupon.reason },
      { status: 409 }
    );
  }
  const { priced, subtotal, discount, total, taxLines } = pricing;
  const effectiveShipping = pricing.shipping;
  const appliedCouponId = pricing.coupon.requested && pricing.coupon.applied ? pricing.coupon.code : undefined;

  // The line title is a snapshot too, and must come from the catalogue, not
  // from text the browser put in the cart line. Falls back to the cart title
  // only if the product doc is somehow gone.
  const distinctProductIds = [...new Set(priced.map((line) => line.productId))];
  const productSnaps = await Promise.all(distinctProductIds.map((id) => db.collection('products').doc(id).get()));
  const titleByProductId = new Map<string, string>();
  const templateIdByProductId = new Map<string, string | null>();
  productSnaps.forEach((snap, index) => {
    const data = snap.exists ? (snap.data() as { title?: unknown; personalizationTemplateId?: unknown } | undefined) : undefined;
    const title = data?.title;
    if (typeof title === 'string' && title.length > 0) titleByProductId.set(distinctProductIds[index], title);
    templateIdByProductId.set(distinctProductIds[index], typeof data?.personalizationTemplateId === 'string' ? data.personalizationTemplateId : null);
  });
  for (const line of priced) {
    line.title = titleByProductId.get(line.productId) ?? line.title;
  }

  // Verify every referenced customization belongs to the caller BEFORE any
  // side effect (order-number counter, provider order, writes): rejecting
  // here must not burn an order number or open a payment session.
  const uniquePersonalizationIds = [...new Set(priced.map((line) => line.personalizationId))];
  const customizationSnapshots = await Promise.all(
    uniquePersonalizationIds.map((pid) => db.collection('customizations').where('personalizationId', '==', pid).get())
  );
  for (const snapshot of customizationSnapshots) {
    for (const doc of snapshot.docs) {
      if (doc.data().userId !== userId) {
        return NextResponse.json({ error: 'One or more items in your cart could not be found' }, { status: 404 });
      }
    }
  }

  // Every frame of a combo must actually be personalized: a verified template design, or a
  // saved photo for each of the product's photo slots. (A single product is not checked this
  // way today; a combo is bought on trust that every frame was done, so it is checked here.)
  const photoSlotsByProductId = new Map<string, number>();
  productSnaps.forEach((snap, index) => {
    const data = snap.exists ? (snap.data() as { photoSlots?: unknown } | undefined) : undefined;
    photoSlotsByProductId.set(distinctProductIds[index], typeof data?.photoSlots === 'number' ? data.photoSlots : 1);
  });
  const incompleteFrames: string[] = [];
  for (const line of priced) {
    if (!line.combo) continue;
    const claimed = claimedLine(cartItems, line)?.personalization;
    if (claimed) continue; // template design: verified (or refused) just below
    const docs = customizationSnapshots.flatMap((snap) => snap.docs).filter((d) => d.data().personalizationId === line.personalizationId);
    const slotsDone = new Set(docs.map((d) => d.data().slotIndex)).size;
    if (slotsDone < (photoSlotsByProductId.get(line.productId) ?? 1)) incompleteFrames.push(`${line.combo.comboName}: ${line.combo.frameLabel}`);
  }
  if (incompleteFrames.length > 0) {
    return NextResponse.json(
      { error: 'Finish personalizing every frame in your combo before checking out.', code: 'combo_incomplete', frames: incompleteFrames },
      { status: 409 }
    );
  }

  // Personalization claimed on a line becomes a verified snapshot, or the order is refused —
  // before any side effect. (Lines without it — legacy per-slot customizations, or items
  // that aren't personalized — are untouched.)
  const personalizationFp = new Map<string, string>();
  for (const line of priced) {
    const cartLine = claimedLine(cartItems, line);
    if (!cartLine?.personalization) continue;
    try {
      // The variant decides which template is offered and the size it prints at.
      const variantSnap = await db.collection('products').doc(line.productId).collection('variants').doc(line.variantId).get();
      const variant = variantSnap.exists
        ? (variantSnap.data() as { widthIn?: number; heightIn?: number; personalizationTemplateId?: string | null })
        : undefined;
      const snapshot = await buildLineSnapshot(db, userId, cartLine.personalization, {
        offeredTemplateId: variant?.personalizationTemplateId ?? templateIdByProductId.get(line.productId) ?? null,
        ...(variant?.widthIn && variant?.heightIn && { printSizeIn: { width: variant.widthIn, height: variant.heightIn } }),
      });
      line.personalization = snapshot;
      personalizationFp.set(`${line.variantId}|${line.personalizationId}`, stateFingerprint(snapshot.state));
    } catch (err) {
      if (err instanceof PersonalizationRejectedError) {
        return NextResponse.json(
          { error: err.message, code: 'personalization_invalid', reason: err.code, ...(err.details && { details: err.details }) },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  // [BE-13] Idempotency. The client keeps ONE key per checkout attempt, so a
  // double-click, a network retry, or "Place order" again after a dismissed or
  // failed payment window all arrive under the same key. What that key may
  // resolve to depends on whether anything changed in between:
  //  - already paid          -> 409 (never show a payment window twice)
  //  - same priced inputs    -> hand back the SAME pending order/payment session
  //  - different inputs      -> the customer edited their cart, address, coupon
  //                             or delivery method since the last attempt; that
  //                             older pending order is superseded (cancelled)
  //                             and a fresh order is created for what they have
  //                             NOW — paying the stale one would ship the wrong
  //                             thing to the wrong place.
  const inputsHash = fingerprintOrder({
    priced: priced.map((l) => ({ ...l, personalizationFp: `${personalizationFp.get(`${l.variantId}|${l.personalizationId}`) ?? ''}${l.combo ? `#${l.combo.comboId}/${l.combo.frameKey}` : ''}` })),
    address,
    couponId: appliedCouponId ?? null,
    deliveryMethod,
    subtotal,
    discount,
    shipping: effectiveShipping,
    total,
  });
  type PriorOrder = {
    id: string;
    orderNo?: string;
    status: string;
    paymentStatus?: string;
    paymentProvider?: 'mock' | 'razorpay';
    razorpayOrderId?: string;
    total: number;
    inputsHash?: string;
  };
  const supersededOrderIds: string[] = [];
  if (idempotencyKey) {
    const priorSnapshot = await db
      .collection('orders')
      .where('userId', '==', userId)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(10)
      .get();
    const prior = priorSnapshot.docs.map((doc) => doc.data() as PriorOrder);

    const paid = prior.find((o) => o.paymentStatus === 'paid');
    if (paid) {
      return NextResponse.json({ error: 'This order has already been paid for', code: 'already_paid', orderId: paid.id }, { status: 409 });
    }
    const sameInputs = prior.find((o) => o.status === 'pending_payment' && o.inputsHash === inputsHash);
    if (sameInputs) {
      return NextResponse.json(existingOrderResponse(sameInputs), { status: 200 });
    }
    for (const o of prior) {
      if (o.status === 'pending_payment') supersededOrderIds.push(o.id);
    }
  }

  // Generate the order number in its own short transaction. No timestamp
  // fallback: a second, possibly-colliding numbering scheme is worse than
  // telling the customer to retry.
  let orderNo: string;
  try {
    orderNo = await db.runTransaction(async (transaction) => {
      const adapter: CounterTransaction = {
        async get(ref) {
          const snap = await transaction.get(db.doc(ref.path));
          return { exists: snap.exists, data: () => (snap.exists ? (snap.data() as { value: number }) : undefined) };
        },
        set(ref, data) {
          transaction.set(db.doc(ref.path), data);
        },
      };
      return generateOrderNo(adapter, new Date().getFullYear());
    });
  } catch (err) {
    console.error('Order number generation failed:', err);
    return NextResponse.json({ error: 'Could not place your order. Please try again.' }, { status: 503 });
  }

  // Open the payment session with the configured provider. The order is
  // ALWAYS created pending_payment — it only becomes paid through the same
  // settlement pipeline the Razorpay webhook uses (see
  // /api/checkout/mock-payment for the mock provider's side of that).
  let createdPayment;
  try {
    createdPayment = await paymentProvider.createPayment({ amount: total, receipt: orderNo });
  } catch (err) {
    console.error(`Payment provider "${paymentProvider.name}" failed to create a payment:`, err);
    return NextResponse.json(
      { error: 'Could not start payment. Please try again.', code: 'payment_provider_error' },
      { status: 502 }
    );
  }

  // With an idempotencyKey the order id is deterministic, and the order doc
  // is written with create() (fails if it exists). The query above is a fast
  // path; this is what actually makes two simultaneous submits safe — the
  // loser gets ALREADY_EXISTS and is handed the winner's order.
  const orderRef = idempotencyKey
    ? db.collection('orders').doc(deterministicOrderId(userId, `${idempotencyKey}:${inputsHash}`))
    : db.collection('orders').doc();
  // Item ids are fixed up front so the order can point at each combo frame's item.
  const itemRefs = priced.map(() => orderRef.collection('items').doc());
  const orderCombos: OrderCombo[] = pricing.combos.map((combo) => ({
    instanceId: combo.instanceId,
    comboId: combo.comboId,
    version: combo.version,
    name: combo.name,
    ...(combo.slug && { slug: combo.slug }),
    price: combo.price,
    mrp: combo.mrp,
    frames: combo.frames.map((frame) => ({
      ...frame,
      orderItemId: itemRefs[priced.findIndex((l) => l.combo?.instanceId === combo.instanceId && l.combo.frameKey === frame.key)]!.id,
    })),
  }));
  const order = OrderSchema.parse({
    id: orderRef.id,
    orderNo,
    userId,
    status: 'pending_payment',
    paymentStatus: 'pending',
    subtotal,
    discount,
    shipping: effectiveShipping,
    total,
    addressJson: address,
    productIds: [...new Set(priced.map((line) => line.productId))],
    ...(customerName && { customerName }),
    paymentProvider: paymentProvider.name,
    razorpayOrderId: createdPayment.providerOrderId,
    placedAt: new Date(),
    deliveryMethod,
    ...(idempotencyKey && { idempotencyKey, inputsHash }),
    paymentMode: 'prepaid',
    amountPaidOnline: total,
    amountDueOnDelivery: 0,
    taxLines,
    ...(appliedCouponId && { couponId: appliedCouponId }),
    ...(orderCombos.length > 0 && { combos: orderCombos }),
  });

  const batch = db.batch();
  batch.create(orderRef, order);

  const initialEventRef = orderRef.collection('events').doc();
  batch.set(
    initialEventRef,
    OrderEventSchema.parse({
      id: initialEventRef.id,
      status: 'pending_payment',
      note: null,
      courier: null,
      awbNumber: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
    })
  );

  for (const staleId of supersededOrderIds) {
    const staleRef = db.collection('orders').doc(staleId);
    batch.update(staleRef, { status: 'cancelled' });
    const staleEventRef = staleRef.collection('events').doc();
    batch.set(
      staleEventRef,
      OrderEventSchema.parse({
        id: staleEventRef.id,
        status: 'cancelled',
        note: 'Superseded by a newer checkout',
        courier: null,
        awbNumber: null,
        createdAt: new Date().toISOString(),
        createdBy: 'system_checkout',
      })
    );
  }

  priced.forEach((line, i) => {
    const itemRef = itemRefs[i]!;
    batch.set(itemRef, OrderItemSchema.parse({ ...line, id: itemRef.id }));
  });

  for (const snapshot of customizationSnapshots) {
    for (const doc of snapshot.docs) {
      if (doc.data().status === 'draft') {
        batch.update(doc.ref, { status: 'ordered' });
      }
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    if (idempotencyKey && isAlreadyExistsError(err)) {
      const winner = await orderRef.get();
      if (winner.exists) {
        const data = winner.data() as Parameters<typeof existingOrderResponse>[0];
        if (data.paymentStatus === 'paid') {
          return NextResponse.json({ error: 'This order has already been paid for', code: 'already_paid', orderId: data.id }, { status: 409 });
        }
        return NextResponse.json(existingOrderResponse(data), { status: 200 });
      }
    }
    throw err;
  }

  return NextResponse.json(
    {
      orderId: orderRef.id,
      orderNo,
      razorpayOrderId: createdPayment.providerOrderId,
      amount: total,
      paymentProvider: paymentProvider.name,
      keyId: createdPayment.publicKey,
      status: 'pending_payment',
      paymentStatus: 'pending',
    },
    { status: 200 }
  );
}

/**
 * The cart's own claim for a priced line. A combo frame's claim lives inside its parent line
 * (`parent.combo.frames[key].personalization`), not as a top-level cart line, so it has to be
 * found there; otherwise a template frame would get no verified snapshot and print blank.
 */
function claimedLine(cartItems: CartLineInput[], line: { variantId: string; personalizationId: string; combo?: { instanceId: string; frameKey: string } }) {
  if (line.combo) {
    const parent = cartItems.find((c) => c.personalizationId === line.combo!.instanceId && c.combo);
    const frame = parent?.combo?.frames.find((f) => f.key === line.combo!.frameKey);
    return frame ? { personalization: frame.personalization as { templateId: string; templateVersion: number; state: unknown } | undefined } : undefined;
  }
  return cartItems.find((c) => c.variantId === line.variantId && c.personalizationId === line.personalizationId);
}

function deterministicOrderId(userId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex').slice(0, 28);
}

// Everything that makes one checkout a different purchase from another. Prices
// are included on purpose: if a price moved between attempts, the retry must
// be a new order at the new price, not a revived order at the old one.
function fingerprintOrder(input: {
  priced: Array<{ variantId: string; personalizationId: string; qty: number; unitPrice: number; personalizationFp?: string }>;
  address: Record<string, unknown>;
  couponId: string | null;
  deliveryMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}): string {
  const lines = input.priced
    .map((l) => `${l.variantId}|${l.personalizationId}|${l.qty}|${l.unitPrice}|${l.personalizationFp ?? ''}`)
    .sort();
  const addressKeys = Object.keys(input.address).sort();
  const address = addressKeys.map((k) => `${k}=${JSON.stringify(input.address[k])}`);
  return createHash('sha256')
    .update(
      JSON.stringify({
        lines,
        address,
        coupon: input.couponId,
        delivery: input.deliveryMethod,
        totals: [input.subtotal, input.discount, input.shipping, input.total],
      })
    )
    .digest('hex');
}

// gRPC ALREADY_EXISTS (6) as surfaced by the Admin SDK on a failed create().
function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}
