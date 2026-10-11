import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { calculateCouponDiscount, glitterOffer, splitGstFromInclusiveTotal, type DeliveryMethod } from '@bro-pics/shared';
import { getShippingSettings, getGstSettings } from './firestore-settings';
import { findVariantById } from './variant-lookup';
import { isComboLine, priceComboLines, type PricedCombo } from './combo-pricing';
import { firestoreComboDeps } from './firestore-combos';
import { findCouponByCode } from './coupon-lookup';
import { computeEligibleSubtotal } from './coupon-eligibility';
import {
  priceCartLines,
  calculateSubtotal,
  calculateShipping,
  type CartLineInput,
  type PricedCartLine,
  type UnavailableLine,
} from './checkout-calc';

export type CouponOutcome =
  | { requested: false }
  | { requested: true; applied: true; code: string; freeShipping: boolean }
  | { requested: true; applied: false; reason: string };

export interface TaxLine {
  gstin?: string;
  rate: number;
  /** Paise. */
  amount: number;
}

export interface OrderPricing {
  /** One line per frame for a Combo Offer (its price split across them), one line per cart line otherwise. */
  priced: PricedCartLine[];
  /** The Combo Offers in the cart, priced as wholes. */
  combos: PricedCombo[];
  /** Non-empty => the cart can't be bought as-is; totals below are all 0. */
  unavailable: UnavailableLine[];
  /** Paise. total === subtotal - discount + shipping. */
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  coupon: CouponOutcome;
  taxLines: TaxLine[];
}

/**
 * THE one place an order's money is worked out. checkout's coupon check,
 * the totals quote the checkout page renders, and create-order (which
 * actually charges) all call this, so what a customer is shown and what they
 * are charged cannot drift apart. Everything is derived server-side from the
 * live catalogue and settings; the only client inputs are which variants, how
 * many, which coupon code, and the delivery method.
 *
 * Coupon rules live here too, deliberately — in particular the per-user limit
 * counts only PAID uses. (The old coupon-validate route counted every order
 * that ever carried the code, so one abandoned checkout made a one-use coupon
 * unusable on retry, while create-order disagreed and would have allowed it.)
 */
export async function computeOrderPricing(
  db: Firestore,
  input: { userId: string; cartItems: CartLineInput[]; couponCode: string | null; deliveryMethod: DeliveryMethod }
): Promise<OrderPricing> {
  const { userId, cartItems, couponCode, deliveryMethod } = input;

  const comboCartLines = cartItems.filter(isComboLine);
  const regularCartLines = cartItems.filter((item) => !isComboLine(item));

  const uniqueVariantIds = [...new Set(regularCartLines.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(
    variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]
  );

  // Glitter is priced from the product the customer is buying, read here — a price in the cart is never used.
  const glitterProductIds = [
    ...new Set(
      regularCartLines
        .filter((item) => item.finish === 'glitter')
        .map((item) => variantsById.get(item.variantId)?.productId)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];
  const glitterExtraByProductId = new Map<string, number>();
  await Promise.all(
    glitterProductIds.map(async (productId) => {
      const snap = await db.collection('products').doc(productId).get();
      const offer = snap.exists ? glitterOffer((snap.data() as { glitter?: { enabled: boolean; extraPrice: number } }) ?? {}) : null;
      const status = snap.exists ? (snap.data() as { isActive?: boolean }).isActive : false;
      if (offer && status !== false) glitterExtraByProductId.set(productId, offer.extraPrice);
    })
  );

  const regular = priceCartLines(regularCartLines, variantsById, glitterExtraByProductId);
  const comboResult = comboCartLines.length > 0 ? await priceComboLines(comboCartLines, firestoreComboDeps(db)) : { priced: [], combos: [], unavailable: [] };
  const priced = [...regular.priced, ...comboResult.priced];
  const unavailable = [...regular.unavailable, ...comboResult.unavailable];
  const combos = comboResult.combos;
  if (unavailable.length > 0) {
    return {
      priced,
      combos: [],
      unavailable,
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      coupon: couponCode ? { requested: true, applied: false, reason: 'items_unavailable' } : { requested: false },
      taxLines: [],
    };
  }

  const subtotal = calculateSubtotal(priced);
  const shippingSettings = await getShippingSettings();
  let shipping = calculateShipping(subtotal, shippingSettings, deliveryMethod);
  const gstSettings = await getGstSettings();

  let discount = 0;
  let coupon: CouponOutcome = { requested: false };

  if (couponCode) {
    const found = await findCouponByCode(db, couponCode);
    if (!found) {
      coupon = { requested: true, applied: false, reason: 'unknown_coupon' };
    } else {
      let perUserOk = true;
      if (found.perUserLimit) {
        const usedSnapshot = await db
          .collection('orders')
          .where('userId', '==', userId)
          .where('couponId', '==', found.code)
          .where('paymentStatus', '==', 'paid')
          .get();
        perUserOk = usedSnapshot.size < found.perUserLimit;
      }
      if (!perUserOk) {
        coupon = { requested: true, applied: false, reason: 'per_user_limit_reached' };
      } else {
        // A combo is already priced as an offer: coupons only touch it if the combo allows them.
        const couponsAllowed = new Map(combos.map((c) => [c.instanceId, c.couponsAllowed]));
        const eligibleLines = priced.filter((line) => !line.combo || couponsAllowed.get(line.combo.instanceId) === true);
        const eligibleSubtotal = await computeEligibleSubtotal(db, eligibleLines, found);
        const result = calculateCouponDiscount(eligibleSubtotal, found, new Date(), userId);
        if (result.valid) {
          discount = result.discountPaise;
          const freeShipping = found.type === 'free_ship';
          if (freeShipping) shipping = 0;
          coupon = { requested: true, applied: true, code: found.code, freeShipping };
        } else {
          coupon = { requested: true, applied: false, reason: result.reason ?? 'invalid' };
        }
      }
    }
  }

  const total = subtotal - discount + shipping;
  const taxLines: TaxLine[] = gstSettings.gstEnabled
    ? [
        {
          ...(gstSettings.gstin && { gstin: gstSettings.gstin }),
          rate: gstSettings.taxRate,
          amount: splitGstFromInclusiveTotal(total, gstSettings.taxRate).gstAmountPaise,
        },
      ]
    : [];

  return { priced, combos, unavailable: [], subtotal, discount, shipping, total, coupon, taxLines };
}
