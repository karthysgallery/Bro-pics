import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { parseBusinessProfile } from '@bro-pics/shared';
import { getFirebaseApp } from './firebase-client';

export interface InvoiceSeller {
  name: string;
  legalName?: string;
  address?: string;
  gstin?: string;
}

const DEFAULT_SELLER: InvoiceSeller = { name: 'KarthysGallery' };

/**
 * Seller identity for invoices, exactly as the owner saved it in Admin >
 * Store settings (business profile; the address is assembled from its address fields) (settings/{key} is world-readable). Nothing is invented: a
 * field the owner hasn't entered is simply absent, and the GSTIN only appears
 * when GST is actually switched on. Any read failure falls back to just the
 * brand name rather than blocking the invoice.
 */
export async function getInvoiceSeller(): Promise<InvoiceSeller> {
  try {
    const db = getFirestore(getFirebaseApp());
    const [storeSnap, gstSnap] = await Promise.all([getDoc(doc(db, 'settings', 'store')), getDoc(doc(db, 'settings', 'gst'))]);
    const store = (storeSnap.exists() ? parseBusinessProfile(storeSnap.data()) : null) ?? { name: DEFAULT_SELLER.name };
    const gst = gstSnap.exists() ? (gstSnap.data() as { gstEnabled?: boolean; gstin?: string }) : {};
    return {
      name: store.name || DEFAULT_SELLER.name,
      ...('legalName' in store && store.legalName && { legalName: store.legalName }),
      ...('addressOneLine' in store && store.addressOneLine && { address: store.addressOneLine }),
      ...(gst.gstEnabled && gst.gstin && { gstin: gst.gstin }),
    };
  } catch {
    return DEFAULT_SELLER;
  }
}
