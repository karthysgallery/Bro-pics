import { z } from 'zod';
import { AppearanceSchema, SafeHrefSchema, SiteTextSettingsSchema, ThemeSettingsSchema } from '@bro-pics/shared';

/**
 * [ABE-24] One schema per `settings/{key}` doc this generic route knows
 * how to validate — the write-API half of the same per-key convention
 * `lib/firestore-settings.ts` already documents for reads. `shipping`
 * and `gst` already have dedicated read helpers (`getShippingSettings`/
 * `getGstSettings`) and are ALREADY wired into order totals
 * (`create-order`'s own `calculateShipping`/GST `taxLines` — see that
 * route); this only adds the missing write path for them, it doesn't
 * rebuild anything. `announcementBar` deliberately stays OUT of this
 * registry — it already has its own dedicated route
 * (POST /api/admin/settings/announcement-bar, from ABE-20), and folding
 * it in here would just be two paths to the same doc for no benefit.
 *
 * Every other key here (store, courier, deliveryEstimates, payments,
 * notifications, seo, header, footer) was fully greenfield before this
 * task — no prior schema, no prior consumer. Wiring these new settings
 * INTO the storefront (header/footer chrome, SEO fallback meta tags,
 * delivery-estimate math, notification channel gating) is deliberately
 * out of scope here, same treatment as every other CMS write-API task
 * this session (ABE-17/18/19/20): this is the write API the task asked
 * for, not a rewrite of the public site's read paths.
 */
export const SettingsShippingSchema = z
  .object({
    freeShippingThreshold: z.number().int().nonnegative(),
    flatShippingCharge: z.number().int().nonnegative(),
    expressShippingCharge: z.number().int().nonnegative(),
  })
  .strict();

export const SettingsGstSchema = z
  .object({
    gstEnabled: z.boolean(),
    taxRate: z.number().nonnegative(),
    gstin: z.string().optional(),
  })
  .strict();

export const SettingsStoreSchema = z
  .object({
    name: z.string().min(1),
    supportPhone: z.string().min(1),
    processingDays: z.number().int().nonnegative(),
    description: z.string().optional(),
    // Seller identity printed on tax invoices. Optional — and never invented:
    // an invoice shows only what the owner has actually entered here.
    legalName: z.string().optional(),
    address: z.string().optional(),
  })
  .strict();

export const SettingsCourierSchema = z
  .object({
    couriers: z.array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        // e.g. "https://track.example.com/{awb}" — the AWB placeholder
        // convention, not enforced here since it's display-only until
        // something reads this doc.
        trackingUrlTemplate: z.string().optional(),
      })
    ),
  })
  .strict();

export const SettingsDeliveryEstimatesSchema = z
  .object({
    zones: z.array(
      z.object({
        zoneCode: z.string().min(1),
        minDays: z.number().int().nonnegative(),
        maxDays: z.number().int().nonnegative(),
      })
    ),
  })
  .strict();

export const SettingsPaymentsSchema = z
  .object({
    codEnabled: z.boolean(),
    acceptedMethods: z.array(z.string().min(1)),
    // A UPI VPA for display (e.g. on an offline/QR payment flow), never a
    // secret — real payment credentials stay env-only
    // (RAZORPAY_KEY_ID/SECRET), never written to a Firestore doc every
    // admin/super_admin can read.
    upiId: z.string().optional(),
  })
  .strict();

export const SettingsNotificationsSchema = z
  .object({
    emailEnabled: z.boolean(),
    smsEnabled: z.boolean(),
    whatsappEnabled: z.boolean(),
  })
  .strict();

export const SettingsSeoSchema = z
  .object({
    defaultTitle: z.string().min(1),
    defaultDescription: z.string().min(1),
    ogImagePath: z.string().nullable().optional(),
    // Search Console / Bing Webmaster site-ownership codes (the content="…" value only).
    googleVerification: z.string().trim().regex(/^[A-Za-z0-9_-]{0,100}$/, 'Paste only the code from the content="…" part').optional(),
    bingVerification: z.string().trim().regex(/^[A-Za-z0-9_-]{0,100}$/, 'Paste only the code from the content="…" part').optional(),
  })
  .strict();

export const SettingsHeaderSchema = z
  .object({
    navLinks: z.array(z.object({ label: z.string().min(1), href: SafeHrefSchema })).max(12),
    // Show each top-level category in the menu automatically (default on).
    showCategories: z.boolean().optional(),
    // A logo image from the media library; the text logo shows when unset.
    logoMediaId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).nullable().optional(),
  })
  .strict();

export const SettingsFooterSchema = z
  .object({
    columns: z.array(
      z.object({
        title: z.string().min(1),
        links: z.array(z.object({ label: z.string().min(1), href: SafeHrefSchema })),
      })
    ),
    socialLinks: z.array(z.object({ platform: z.string().min(1), url: SafeHrefSchema })),
    // The short line under the shop name.
    tagline: z.string().max(160).optional(),
  })
  .strict();

export const SETTINGS_REGISTRY = {
  shipping: SettingsShippingSchema,
  gst: SettingsGstSchema,
  store: SettingsStoreSchema,
  courier: SettingsCourierSchema,
  deliveryEstimates: SettingsDeliveryEstimatesSchema,
  payments: SettingsPaymentsSchema,
  notifications: SettingsNotificationsSchema,
  seo: SettingsSeoSchema,
  header: SettingsHeaderSchema,
  footer: SettingsFooterSchema,
  // Festival themes: colours, decorations and their dates (packages/shared/src/schemas/theme.ts).
  theme: ThemeSettingsSchema,
  // Shop wording: trust badges, hero buttons, product-page reassurances.
  siteText: SiteTextSettingsSchema,
  // Typefaces, corner/button roundness, browser-tab icon, product-page sections (packages/shared/src/schemas/appearance.ts).
  appearance: AppearanceSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_REGISTRY;

export function isKnownSettingsKey(key: string): key is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);
}
