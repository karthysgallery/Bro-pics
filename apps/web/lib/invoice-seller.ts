import { getFirestore, doc, getDoc } from 'firebase/firestore';
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
 * Store settings (settings/{key} is world-readable). Nothing is invented: a
 * field the owner hasn't entered is simply absent, and the GSTIN only appears
 * when GST is actually switched on. Any read failure falls back to just the
 * brand name rather than blocking the invoice.
 */
export async function getInvoiceSeller(): Promise<InvoiceSeller> {
  try {
    const db = getFirestore(getFirebaseApp());
    const [storeSnap, gstSnap] = await Promise.all([getDoc(doc(db, 'settings', 'store')), getDoc(doc(db, 'settings', 'gst'))]);
    const store = storeSnap.exists() ? (storeSnap.data() as { name?: string; legalName?: string; address?: string }) : {};
    const gst = gstSnap.exists() ? (gstSnap.data() as { gstEnabled?: boolean; gstin?: string }) : {};
    return {
      name: store.name || DEFAULT_SELLER.name,
      ...(store.legalName && { legalName: store.legalName }),
      ...(store.address && { address: store.address }),
      ...(gst.gstEnabled && gst.gstin && { gstin: gst.gstin }),
    };
  } catch {
    return DEFAULT_SELLER;
  }
}
