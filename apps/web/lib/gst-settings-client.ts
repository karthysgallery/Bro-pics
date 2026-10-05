import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFirebaseApp } from './firebase-client';

export interface GstDisplaySettings {
  gstEnabled: boolean;
  taxRate: number;
}

// Same display-only contract as shipping-settings-client.ts: settings/{key}
// is world-readable, and the server recomputes tax at create-order, so a
// stale read here is cosmetic. Failure => GST not shown (never a made-up rate).
export async function getGstSettingsClient(): Promise<GstDisplaySettings> {
  try {
    const db = getFirestore(getFirebaseApp());
    const snapshot = await getDoc(doc(db, 'settings', 'gst'));
    if (!snapshot.exists()) return { gstEnabled: false, taxRate: 0 };
    const data = snapshot.data();
    return {
      gstEnabled: data?.gstEnabled === true,
      taxRate: typeof data?.taxRate === 'number' ? data.taxRate : 0,
    };
  } catch {
    return { gstEnabled: false, taxRate: 0 };
  }
}
