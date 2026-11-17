'use client';

import { useEffect, useRef } from 'react';
import { CONSENT_EVENT } from '../../lib/consent';
import { metaPixelReady, purchaseEventId, rupees, trackMeta, type MetaEventParams } from '../../lib/meta-pixel';

/**
 * Small components that send one Meta event when they appear. Each fires at most once per mount; if the Pixel
 * is not running yet (cookies not accepted) it waits for consent on this page.
 */
function useFireOnce(event: string, params: MetaEventParams, eventId?: string, enabled = true) {
  const fired = useRef(false);
  const key = JSON.stringify([event, params, eventId]);
  useEffect(() => {
    if (!enabled) return;
    const fire = () => {
      if (fired.current || !metaPixelReady()) return;
      fired.current = true;
      trackMeta(event, params, eventId);
    };
    // The Pixel initialises in a sibling effect; give it a tick.
    const t = setTimeout(fire, 0);
    window.addEventListener(CONSENT_EVENT, fire);
    return () => {
      clearTimeout(t);
      window.removeEventListener(CONSENT_EVENT, fire);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}

/** A product page view. */
export function ProductViewEvent({ productId, productName, valuePaise }: { productId: string; productName: string; valuePaise: number }) {
  useFireOnce('ViewContent', { content_ids: [productId], content_name: productName, content_type: 'product_group', value: rupees(valuePaise), currency: 'INR' });
  return null;
}

/** An offer landing page view: a ViewContent for the offer product, tagged with the campaign. */
export function OfferViewEvent({ productId, productName, valuePaise, campaign }: { productId: string; productName: string; valuePaise: number; campaign: string }) {
  useFireOnce('ViewContent', { content_ids: [productId], content_name: productName, content_type: 'product_group', value: rupees(valuePaise), currency: 'INR', campaign });
  return null;
}

export interface MetaLine {
  productId: string;
  qty: number;
  unitPricePaise: number;
}

/** The checkout page opened. */
export function CheckoutStartEvent({ lines, totalPaise }: { lines: MetaLine[]; totalPaise: number }) {
  useFireOnce(
    'InitiateCheckout',
    {
      content_ids: [...new Set(lines.map((l) => l.productId))],
      contents: lines.map((l) => ({ id: l.productId, quantity: l.qty, item_price: rupees(l.unitPricePaise) })),
      content_type: 'product_group',
      num_items: lines.reduce((n, l) => n + l.qty, 0),
      value: rupees(totalPaise),
      currency: 'INR',
    },
    undefined,
    lines.length > 0
  );
  return null;
}

/**
 * A paid order, fired on the order page only when the server says the payment is verified (`paid`). The event id
 * is the same one the server sends through the Conversions API, so Meta counts the purchase once; it is also
 * remembered in this browser so a reload does not send it again.
 */
export function PurchaseEvent({ orderId, paid, lines, totalPaise }: { orderId: string; paid: boolean; lines: MetaLine[]; totalPaise: number }) {
  const key = `kg_meta_purchase_${orderId}`;
  let already = false;
  try {
    already = typeof window !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    already = false;
  }
  useFireOnce(
    'Purchase',
    {
      content_ids: [...new Set(lines.map((l) => l.productId))],
      contents: lines.map((l) => ({ id: l.productId, quantity: l.qty, item_price: rupees(l.unitPricePaise) })),
      content_type: 'product_group',
      num_items: lines.reduce((n, l) => n + l.qty, 0),
      value: rupees(totalPaise),
      currency: 'INR',
      order_id: orderId,
    },
    purchaseEventId(orderId),
    paid && !already && lines.length > 0
  );
  useEffect(() => {
    if (paid && metaPixelReady()) {
      try {
        localStorage.setItem(key, '1');
      } catch {
        // ignore
      }
    }
  }, [paid, key]);
  return null;
}

/** A product search (only searches with words). */
export function SearchEvent({ query }: { query: string }) {
  useFireOnce('Search', { search_string: query.slice(0, 100) }, undefined, query.trim().length > 0);
  return null;
}
