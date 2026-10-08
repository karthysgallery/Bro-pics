import { z } from 'zod';

/**
 * Small pieces of shop wording the admin can change (Admin > Website > Site
 * text). Every field has the shop's original wording as its default, so an
 * empty or missing value never leaves a blank on the page.
 */
export const SITE_TEXT_FIELDS = [
  { key: 'trust1', group: 'Trust badges', label: 'Badge 1 (print quality)', default: 'Archival-quality prints' },
  { key: 'trust2', group: 'Trust badges', label: 'Badge 2 (craft)', default: 'Handcrafted in India' },
  { key: 'trust3', group: 'Trust badges', label: 'Badge 3 (delivery)', default: 'Safe, tracked delivery' },
  { key: 'trust4', group: 'Trust badges', label: 'Badge 4 (promise)', default: 'Happiness guaranteed' },
  { key: 'heroPrimaryCta', group: 'Homepage banner', label: 'Main button (when a slide has none)', default: 'Find your frame' },
  { key: 'heroSecondaryCta', group: 'Homepage banner', label: 'Second button', default: 'See how it works' },
  { key: 'heroPoint1', group: 'Homepage banner', label: 'Point 1 under the buttons', default: 'Preview your photo in the frame before you pay' },
  { key: 'heroPoint2', group: 'Homepage banner', label: 'Point 2 under the buttons', default: 'Made to order in India' },
  { key: 'priceNote', group: 'Product page', label: 'Note under the price', default: 'Inclusive of GST · Photo printing included' },
  {
    key: 'careText',
    group: 'Product page',
    label: '“Materials & care” (when a product has none)',
    default: 'Solid wood profile, clear acrylic glazing and a museum-style white mount. Dust gently with a soft, dry cloth.',
    long: true,
  },
  {
    key: 'returnsText',
    group: 'Product page',
    label: '“Returns & warranty”',
    default: 'Dispatched in protective shockproof packaging. Free returns or replacement if damaged in transit.',
    long: true,
  },
  { key: 'cartTitle', group: 'Cart & checkout', label: 'Cart page heading', default: 'Your bag' },
  { key: 'cartEmpty', group: 'Cart & checkout', label: 'Message when the cart is empty', default: 'Your bag is empty.' },
  { key: 'cartCheckoutButton', group: 'Cart & checkout', label: 'Button that goes to checkout', default: 'Proceed to checkout' },
  { key: 'checkoutHeadline', group: 'Cart & checkout', label: 'Checkout page heading', default: 'One step closer to your wall.' },
  { key: 'orderSummaryTitle', group: 'Cart & checkout', label: 'Order summary heading', default: 'Order summary' },
  { key: 'couponLabel', group: 'Cart & checkout', label: 'Coupon box label', default: 'Coupon code' },
  { key: 'placeOrderButton', group: 'Cart & checkout', label: 'Place-order button', default: 'Place order' },
  { key: 'addressHint', group: 'Cart & checkout', label: 'Hint under the button until an address is chosen', default: 'Choose or add a delivery address to continue.' },
] as const;

export type SiteTextKey = (typeof SITE_TEXT_FIELDS)[number]['key'];
export type SiteText = Record<SiteTextKey, string>;

/** What admins save: only the fields they changed (others keep their default). */
export const SiteTextSettingsSchema = z
  .object(Object.fromEntries(SITE_TEXT_FIELDS.map((f) => [f.key, z.string().trim().max('long' in f ? 400 : 80).optional()])) as Record<SiteTextKey, z.ZodOptional<z.ZodString>>)
  .strict();

export const DEFAULT_SITE_TEXT: SiteText = Object.fromEntries(SITE_TEXT_FIELDS.map((f) => [f.key, f.default])) as SiteText;

/** Saved values over the defaults; blank or unreadable values fall back. */
export function resolveSiteText(raw: unknown): SiteText {
  const out: SiteText = { ...DEFAULT_SITE_TEXT };
  if (!raw || typeof raw !== 'object') return out;
  for (const f of SITE_TEXT_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === 'string' && v.trim()) out[f.key] = v.trim();
  }
  return out;
}
