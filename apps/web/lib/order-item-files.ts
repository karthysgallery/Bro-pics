import type { Firestore } from 'firebase-admin/firestore';
import type { OrderItem, Upload } from '@bro-pics/shared';

/** One photo the customer uploaded for an order item, in the order they appear in the design. */
export interface ItemOriginal {
  uploadId: string;
  /** "Photo 1", "Photo 2"… */
  label: string;
}

/**
 * The customer's original (unedited) photos for an order item. A template-engine item keeps its photos in
 * the personalization snapshot; a classic frame keeps one customization per photo slot. Either way the
 * answer is the same list, so the admin screens and the download route agree on what "this item's photos" are.
 */
export async function listItemOriginals(db: Firestore, item: Pick<OrderItem, 'personalizationId' | 'personalization'>): Promise<ItemOriginal[]> {
  const slots = item.personalization?.state?.slots;
  if (slots && Object.keys(slots).length > 0) {
    return Object.values(slots).map((photo, index) => ({ uploadId: photo.assetId, label: `Photo ${index + 1}` }));
  }
  // A plain equality query sorted in memory: an equality filter plus orderBy on another field would need a composite index.
  const snap = await db.collection('customizations').where('personalizationId', '==', item.personalizationId).get();
  return snap.docs
    .map((doc) => doc.data() as { uploadId: string; slotIndex: number })
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((c) => ({ uploadId: c.uploadId, label: `Photo ${c.slotIndex + 1}` }));
}

export interface ItemOriginalDetail extends ItemOriginal {
  widthPx: number | null;
  heightPx: number | null;
  originalPath: string | null;
}

/** The originals with their stored size and file location (null when the upload record is gone). */
export async function describeItemOriginals(db: Firestore, originals: ItemOriginal[]): Promise<ItemOriginalDetail[]> {
  return Promise.all(
    originals.map(async (o) => {
      const snap = await db.collection('uploads').doc(o.uploadId).get();
      const upload = snap.exists ? (snap.data() as Upload) : null;
      return { ...o, widthPx: upload?.widthPx ?? null, heightPx: upload?.heightPx ?? null, originalPath: upload?.originalPath ?? null };
    })
  );
}

/** A file name that is safe on every operating system. */
export function safeFileName(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'file';
}

export function fileExtension(path: string, fallback: string): string {
  const match = /\.([A-Za-z0-9]{2,5})$/.exec(path);
  return match ? match[1]!.toLowerCase() : fallback;
}

export const printFilePath = (orderId: string, itemId: string) => `print-files/${orderId}/${itemId}/print.png`;
