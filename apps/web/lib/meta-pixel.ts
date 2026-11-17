'use client';

import { hasAnalyticsConsent } from './consent';

/**
 * Meta (Facebook & Instagram) Pixel, in the browser. Nothing loads or fires until three things are true: the owner
 * switched tracking on with a Pixel ID (Admin → Marketing → Offers & ads), the visitor accepted cookies, and the
 * page is in a browser. Events fired before the script is ready are queued by Meta's own stub.
 *
 * Product ids sent here (`content_ids`, with content_type 'product_group') are the shop's product ids — the
 * catalogue feeds list each size as an item whose item_group_id is that product id, and the server's Purchase
 * event uses the same ids, so Meta can match them.
 *
 * Purchase is NOT fired from here on its own: the order page fires it only once the server has verified the
 * payment, with the same event id the server sends through the Conversions API, so Meta counts it once.
 */

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __kgMetaPixelId?: string;
  }
}

let initialisedFor: string | null = null;

/** Loads Meta's script once and initialises the Pixel (no-op without consent or an id). Returns true when ready. */
export function initMetaPixel(pixelId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !pixelId || !/^\d{10,20}$/.test(pixelId) || !hasAnalyticsConsent()) return false;
  if (initialisedFor === pixelId) return true;
  if (!window.fbq) {
    // Meta's standard loader stub, written out (no third-party package).
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq!('init', pixelId);
  window.__kgMetaPixelId = pixelId;
  initialisedFor = pixelId;
  return true;
}

export type MetaStandardEvent = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | 'Search';

export interface MetaEventParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: 'product' | 'product_group';
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  value?: number;
  currency?: 'INR';
  num_items?: number;
  search_string?: string;
  order_id?: string;
  [key: string]: unknown;
}

/** The product a size belongs to: size ids are "<productId>_<size>_<frame>"; combo lines keep their own id. */
export function productIdOfVariant(variantId: string): string {
  if (variantId.startsWith('combo:')) return variantId;
  const i = variantId.indexOf('_');
  return i > 0 ? variantId.slice(0, i) : variantId;
}

/** Rupees from paise, for Meta's `value` (rounded to the paisa). */
export const rupees = (paise: number) => Math.round(paise) / 100;

/** Sends one event (standard or custom). `eventId` lets Meta merge it with the same event sent by the server. */
export function trackMeta(event: MetaStandardEvent | string, params: MetaEventParams = {}, eventId?: string): void {
  if (typeof window === 'undefined' || !window.fbq || !initialisedFor || !hasAnalyticsConsent()) return;
  const standard = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Search'].includes(event);
  const options = eventId ? { eventID: eventId } : undefined;
  try {
    if (standard) window.fbq('track', event, params, options);
    else window.fbq('trackCustom', event, params, options);
  } catch {
    // Tracking must never break the shop.
  }
}

/** True once the Pixel is running on this page. */
export const metaPixelReady = () => Boolean(initialisedFor);

/** The id the browser and the server both use for one order's Purchase, so Meta keeps only one. */
export const purchaseEventId = (orderId: string) => `purchase_${orderId}`;
