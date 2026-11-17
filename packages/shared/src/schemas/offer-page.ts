import { z } from 'zod';

/**
 * An offer landing page (e.g. /offers/flat-50) for visitors arriving from ads. Prices are never stored here: the
 * page reads them from the offer product's own sizes (variants), which checkout also charges, so the page, the
 * cart and the payment can never disagree. Stored at campaigns/{slug}.
 */
export const OfferPageFaqSchema = z.object({ question: z.string().min(1).max(200), answer: z.string().min(1).max(1000) });

export const OfferPageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  isActive: z.boolean(),
  /** Big headline, e.g. "Flat 50% OFF". */
  title: z.string().min(1).max(80),
  /** One line under it, e.g. "Make your memories beautiful". */
  subtitle: z.string().max(160).default(''),
  /** The hero picture (any shape; shown contained). Empty = the offer product's own photo. */
  heroImage: z.string().default(''),
  /** The product whose sizes are on offer. */
  productId: z.string().min(1),
  /** Which of its sizes to show, in this order (size labels as on the variants, e.g. "18x12 in"). Empty = all. */
  sizeLabels: z.array(z.string()).default([]),
  ctaLabel: z.string().max(40).default('Shop now'),
  /** Shown as written, e.g. "Free delivery across Tamil Nadu". Empty = not shown. */
  deliveryNote: z.string().max(120).default(''),
  faq: z.array(OfferPageFaqSchema).max(12).default([]),
  /** Optional schedule; outside it the page shows "This offer has ended". */
  startsAt: z.date().nullable().default(null),
  endsAt: z.date().nullable().default(null),
  updatedAt: z.date().optional(),
});
export type OfferPage = z.infer<typeof OfferPageSchema>;

/** Live when switched on and inside its schedule (if any). */
export function isOfferPageLive(c: Pick<OfferPage, 'isActive' | 'startsAt' | 'endsAt'>, now: Date = new Date()): boolean {
  if (!c.isActive) return false;
  if (c.startsAt && now < c.startsAt) return false;
  if (c.endsAt && now > c.endsAt) return false;
  return true;
}

/**
 * Meta (Facebook/Instagram) ad measurement, at settings/marketing. The Pixel id is public by nature (it is in the
 * page). The Conversions API access token is NOT here: it lives in Secret Manager for the server only.
 */
export const MarketingSettingsSchema = z.object({
  metaPixelId: z.string().regex(/^\d{10,20}$/).or(z.literal('')).default(''),
  metaEnabled: z.boolean().default(false),
  /** Events Manager "Test events" code; while set, server events show up there instead of counting. */
  metaTestEventCode: z.string().max(40).default(''),
  updatedAt: z.date().optional(),
});
export type MarketingSettings = z.infer<typeof MarketingSettingsSchema>;
