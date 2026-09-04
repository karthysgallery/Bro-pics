import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';

export async function getAnnouncementBarSettings(): Promise<{
  text: string;
  link?: string;
} | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('announcementBar').get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data || typeof data.text !== 'string' || data.text.length === 0) return null;

  return {
    text: data.text,
    ...(typeof data.link === 'string' && data.link.length > 0 && { link: data.link }),
  };
}

// Placeholder values — the client hasn't supplied real shipping rules yet
// (PROJECT_STATUS.md §6). Flat ₹50, free above ₹1500, both in paise. Settings
// are stored one document per key (settings/{key}), matching how
// getAnnouncementBarSettings above already reads settings/announcementBar —
// NOT as one combined document, despite SettingsSchema's shape suggesting
// that; nothing in this codebase actually writes a single combined document.
const DEFAULT_SHIPPING_SETTINGS = { freeShippingThreshold: 150000, flatShippingCharge: 5000 };

export async function getShippingSettings(): Promise<{
  freeShippingThreshold: number;
  flatShippingCharge: number;
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

  return { freeShippingThreshold, flatShippingCharge };
}
