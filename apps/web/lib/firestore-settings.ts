import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { DEFAULT_SHIPPING_SETTINGS } from './checkout-calc';
import { ThemeSettingsSchema, defaultThemeSettings, resolveSiteText, upgradeThemeSettings, type SiteText, type ThemeSettings } from '@bro-pics/shared';

export async function getAnnouncementBarSettings(): Promise<{
  text: string;
  link?: string;
} | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('announcementBar').get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data || typeof data.text !== 'string' || data.text.length === 0) return null;
  // [ABE-20] `isActive` is honored here now that a write path
  // (POST /api/admin/settings/announcement-bar) actually sets it —
  // absent (a doc written before this field existed) still means "on",
  // same default `UpdateAnnouncementBarBodySchema` uses.
  if (data.isActive === false) return null;

  return {
    text: data.text,
    ...(typeof data.link === 'string' && data.link.length > 0 && { link: data.link }),
  };
}

// Placeholder values — the client hasn't supplied real shipping rules yet
// (PROJECT_STATUS.md §6). Flat ₹50, free above ₹1500, express ₹150 flat,
// all in paise (DEFAULT_SHIPPING_SETTINGS, checkout-calc.ts — the single
// source shared with the client-safe delivery-method selector). Settings
// are stored one document per key (settings/{key}), matching how
// getAnnouncementBarSettings above already reads settings/announcementBar —
// NOT as one combined document, despite SettingsSchema's shape suggesting
// that; nothing in this codebase actually writes a single combined document.

export async function getShippingSettings(): Promise<{
  freeShippingThreshold: number;
  flatShippingCharge: number;
  expressShippingCharge: number;
}> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('shipping').get();
  if (!doc.exists) return DEFAULT_SHIPPING_SETTINGS;

  const data = doc.data();
  const freeShippingThreshold =
    typeof data?.freeShippingThreshold === 'number'
      ? data.freeShippingThreshold
      : DEFAULT_SHIPPING_SETTINGS.freeShippingThreshold;
  const flatShippingCharge =
    typeof data?.flatShippingCharge === 'number'
      ? data.flatShippingCharge
      : DEFAULT_SHIPPING_SETTINGS.flatShippingCharge;
  const expressShippingCharge =
    typeof data?.expressShippingCharge === 'number'
      ? data.expressShippingCharge
      : DEFAULT_SHIPPING_SETTINGS.expressShippingCharge;

  return { freeShippingThreshold, flatShippingCharge, expressShippingCharge };
}

// [BE-22] Same per-key settings/{key} document convention as
// getShippingSettings above. Defaults to GST disabled — no admin UI
// exists yet to turn this on, so behavior is unchanged (order.taxLines
// stays empty) until someone deliberately writes settings/gst.
export async function getGstSettings(): Promise<{ gstEnabled: boolean; taxRate: number; gstin?: string }> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('gst').get();
  if (!doc.exists) return { gstEnabled: false, taxRate: 0 };

  const data = doc.data();
  const gstEnabled = data?.gstEnabled === true;
  const taxRate = typeof data?.taxRate === 'number' ? data.taxRate : 0;
  const gstin = typeof data?.gstin === 'string' && data.gstin.length > 0 ? data.gstin : undefined;
  return { gstEnabled, taxRate, ...(gstin && { gstin }) };
}

// [FE-42] Same per-key settings/{key} convention as the others above.
// Defaults to null — no admin UI wrote settings/seo before ABE-24.
// `ogImagePath` is a Storage object path (never a URL, same convention
// as every other `*Path` field in this codebase), resolved by the
// caller via `buildPublicMediaUrl` — this function stays a plain data
// reader, not an image-URL builder.
export async function getSeoSettings(): Promise<{ defaultTitle: string; defaultDescription: string; ogImagePath?: string } | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('seo').get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (typeof data?.defaultTitle !== 'string' || typeof data?.defaultDescription !== 'string') return null;
  return {
    defaultTitle: data.defaultTitle,
    defaultDescription: data.defaultDescription,
    ...(typeof data.ogImagePath === 'string' && data.ogImagePath.length > 0 && { ogImagePath: data.ogImagePath }),
  };
}

// [FE-27] Same per-key settings/{key} convention as the others above.
// Defaults to null — no admin UI wrote settings/header before ABE-24, so
// the header keeps its own hardcoded extra menu items (see Header.tsx)
// until an admin deliberately configures this.
export interface HeaderSettings {
  navLinks: { label: string; href: string }[];
  showCategories: boolean;
  logoMediaId: string | null;
}

export async function getHeaderSettings(): Promise<HeaderSettings | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('header').get();
  if (!doc.exists) return null;

  const data = doc.data();
  const navLinks = Array.isArray(data?.navLinks) ? data.navLinks : [];
  return {
    navLinks: navLinks.filter(
      (l: unknown): l is { label: string; href: string } =>
        !!l && typeof (l as { label?: unknown }).label === 'string' && (l as { label: string }).label.length > 0 && typeof (l as { href?: unknown }).href === 'string' && (l as { href: string }).href.length > 0
    ),
    showCategories: data?.showCategories !== false,
    logoMediaId: typeof data?.logoMediaId === 'string' && data.logoMediaId.length > 0 ? data.logoMediaId : null,
  };
}

// [FE-27] Same convention. Defaults to null — the footer keeps its own
// hardcoded columns/social links (see Footer.tsx) until an admin
// deliberately configures settings/footer.
export async function getFooterSettings(): Promise<{
  columns: { title: string; links: { label: string; href: string }[] }[];
  socialLinks: { platform: string; url: string }[];
  tagline?: string;
} | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('footer').get();
  if (!doc.exists) return null;

  const data = doc.data();
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  const socialLinks = Array.isArray(data?.socialLinks) ? data.socialLinks : [];
  const tagline = typeof data?.tagline === 'string' && data.tagline.trim() ? data.tagline.trim() : undefined;
  if (columns.length === 0 && socialLinks.length === 0 && !tagline) return null;
  return { columns, socialLinks, ...(tagline && { tagline }) };
}

// [FE-27] Same convention, for the footer's/contact page's "contact us"
// phone number. Defaults to null — no admin UI wrote settings/store
// before ABE-24.
export async function getStoreSettings(): Promise<{ name: string; supportPhone: string } | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('store').get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (typeof data?.name !== 'string' || typeof data?.supportPhone !== 'string') return null;
  return { name: data.name, supportPhone: data.supportPhone };
}

// [BE-23] Same per-key settings/{key} convention as the others above.
// Defaults to [] — no admin UI exists yet to curate this list, so
// search-suggestions simply shows nothing extra for a blank query until
// someone deliberately writes settings/search.
export async function getPopularSearches(): Promise<string[]> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('search').get();
  if (!doc.exists) return [];

  const data = doc.data();
  const terms = data?.popularSearches;
  if (!Array.isArray(terms)) return [];
  return terms.filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/**
 * Festival/everyday theme settings (settings/theme). Before an admin has ever
 * saved them — or if the stored doc no longer parses — the built-in presets
 * are used with the Everyday theme on, so the shop always has a valid look.
 */
export async function getThemeSettings(): Promise<ThemeSettings> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('theme').get();
  if (!doc.exists) return defaultThemeSettings();
  const parsed = ThemeSettingsSchema.safeParse(upgradeThemeSettings(doc.data()));
  return parsed.success ? parsed.data : defaultThemeSettings();
}

/** Admin-edited shop wording (settings/siteText) over the original defaults. */
export async function getSiteText(): Promise<SiteText> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('siteText').get();
  return resolveSiteText(doc.exists ? doc.data() : null);
}
