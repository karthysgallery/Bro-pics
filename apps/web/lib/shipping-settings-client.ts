import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFirebaseApp } from './firebase-client';
import { DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from './checkout-calc';

// settings/{key} is world-readable per firestore.rules, so the checkout
// page can read the real configured shipping rates directly via the client
// SDK — no admin-backed route needed. This is DISPLAY data only (the
// server independently recomputes the real charge in /api/checkout/create-
// order and never trusts anything the client sends), so a stale or
// momentarily-wrong read here is cosmetic, never a pricing bug.
export async function getShippingSettingsClient(): Promise<Required<ShippingSettings>> {
  try {
    const db = getFirestore(getFirebaseApp());
    const snapshot = await getDoc(doc(db, 'settings', 'shipping'));
    if (!snapshot.exists()) return DEFAULT_SHIPPING_SETTINGS;

    const data = snapshot.data();
    return {
      freeShippingThreshold:
        typeof data?.freeShippingThreshold === 'number' ? data.freeShippingThreshold : DEFAULT_SHIPPING_SETTINGS.freeShippingThreshold,
      flatShippingCharge:
        typeof data?.flatShippingCharge === 'number' ? data.flatShippingCharge : DEFAULT_SHIPPING_SETTINGS.flatShippingCharge,
      expressShippingCharge:
        typeof data?.expressShippingCharge === 'number' ? data.expressShippingCharge : DEFAULT_SHIPPING_SETTINGS.expressShippingCharge,
    };
  } catch {
    return DEFAULT_SHIPPING_SETTINGS;
  }
}
