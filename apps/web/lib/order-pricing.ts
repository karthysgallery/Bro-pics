import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { calculateCouponDiscount, splitGstFromInclusiveTotal, type DeliveryMethod } from '@bro-pics/shared';
import { getShippingSettings, getGstSettings } from './firestore-settings';
import { findVariantById } from './variant-lookup';
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
  priced: PricedCartLine[];
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

  const uniqueVariantIds = [...new Set(cartItems.map((item) => item.variantId))];
  const variantEntries = await Promise.all(
    uniqueVariantIds.map(async (variantId) => [variantId, await findVariantById(db, variantId)] as const)
  );
  const variantsById = new Map(
    variantEntries.filter(([, variant]) => variant !== null) as [string, NonNullable<(typeof variantEntries)[number][1]>][]
  );

  const { priced, unavailable } = priceCartLines(cartItems, variantsById);
  if (unavailable.length > 0) {
    return {
      priced,
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
        const eligibleSubtotal = await computeEligibleSubtotal(db, priced, found);
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

  return { priced, unavailable: [], subtotal, discount, shipping, total, coupon, taxLines };
}
