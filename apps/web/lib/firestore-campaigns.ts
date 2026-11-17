import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { BannerSchema, OfferPageSchema, MarketingSettingsSchema, isOfferPageLive, type Banner, type OfferPage, type MarketingSettings } from '@bro-pics/shared';

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : typeof v === 'string' && v ? new Date(v) : null);

/** A banner as the shop shows it: plain strings and ISO dates only (safe to pass to client components). */
export type ShopBanner = Omit<Banner, 'startsAt' | 'endsAt'> & { startsAt: string | null; endsAt: string | null };

/**
 * The homepage offer banner: the first switched-on banner (by display priority, lowest first) that is inside its
 * schedule and has something to show. Null when there is none, so the homepage simply leaves the space out.
 */
export async function getActiveBanner(now: Date = new Date()): Promise<ShopBanner | null> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('banners').where('isActive', '==', true).get();
  const banners = snap.docs
    .map((d) => BannerSchema.safeParse({ ...d.data(), id: d.id, startsAt: toDate(d.get('startsAt')), endsAt: toDate(d.get('endsAt')) }))
    .filter((r): r is { success: true; data: Banner } => r.success)
    .map((r) => r.data)
    .filter((b) => (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt >= now))
    .filter((b) => b.title || b.image || b.tabletImage || b.mobileImage)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const b = banners[0];
  return b ? { ...b, startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null } : null;
}

export type ShopCampaign = Omit<OfferPage, 'startsAt' | 'endsAt' | 'updatedAt'> & { startsAt: string | null; endsAt: string | null; live: boolean };

/** An offer page's settings, or null when it does not exist (or is malformed). `live` = switched on and in schedule. */
export async function getCampaign(slug: string, now: Date = new Date()): Promise<ShopCampaign | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('offerPages').doc(slug).get();
  if (!snap.exists) return null;
  const parsed = OfferPageSchema.safeParse({ ...snap.data(), slug, startsAt: toDate(snap.get('startsAt')), endsAt: toDate(snap.get('endsAt')), updatedAt: undefined });
  if (!parsed.success) return null;
  const c = parsed.data;
  const { updatedAt: _u, ...rest } = c;
  return { ...rest, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, live: isOfferPageLive(c, now) };
}

/** Meta ad measurement settings (Pixel id etc.). Defaults to switched off. */
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection('settings').doc('marketing').get();
  const parsed = MarketingSettingsSchema.safeParse({ ...(snap.data() ?? {}), updatedAt: undefined });
  return parsed.success ? parsed.data : MarketingSettingsSchema.parse({});
}
