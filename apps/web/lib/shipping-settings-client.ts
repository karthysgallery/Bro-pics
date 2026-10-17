import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { DEFAULT_STATE_SHIPPING, parseStateShipping, type StateShippingSettings } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';

// settings/{key} is world-readable per firestore.rules, so pages can read the configured shipping
// settings directly via the client SDK. This is DISPLAY data only: the server prices every order
// itself, from the address it holds, and never trusts anything the browser sends. A stale or
// failed read here is cosmetic, never a pricing bug.
export async function getShippingSettingsClient(): Promise<StateShippingSettings> {
  try {
    const db = getFirestore(getFirebaseApp());
    const snapshot = await getDoc(doc(db, 'settings', 'shipping'));
    return parseStateShipping(snapshot.exists() ? snapshot.data() : null);
  } catch {
    return DEFAULT_STATE_SHIPPING;
  }
}
