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
 *
 * Each photo is listed once, even when a mosaic repeats it in many spaces. A space whose photo had its
 * background removed lists the cut-out AND the customer's untouched original, for anyone redesigning it.
 */
export async function listItemOriginals(db: Firestore, item: Pick<OrderItem, 'personalizationId' | 'personalization'>): Promise<ItemOriginal[]> {
  const slots = item.personalization?.state?.slots;
  if (slots && Object.keys(slots).length > 0) {
    // In the design's own order (fill order), so "Photo 1" is the first space.
    const order = item.personalization?.template?.photoSlots?.map((s) => s.id) ?? Object.keys(slots);
    const ids = [...order.filter((id) => slots[id]), ...Object.keys(slots).filter((id) => !order.includes(id))];
    const uses = new Map<string, { first: number; count: number }>();
    ids.forEach((slotId, index) => {
      const assetId = slots[slotId]!.assetId;
      const seen = uses.get(assetId);
      if (seen) seen.count++;
      else uses.set(assetId, { first: index, count: 1 });
    });
    const unique = [...uses.entries()];
    const records = await Promise.all(unique.map(([assetId]) => db.collection('uploads').doc(assetId).get()));
    const list: ItemOriginal[] = [];
    unique.forEach(([assetId, use], i) => {
      const base = `Photo ${use.first + 1}${use.count > 1 ? ` (used in ${use.count} spaces)` : ''}`;
      const cutoutOf = records[i]!.exists ? (records[i]!.data() as Upload).cutoutOf : undefined;
      list.push({ uploadId: assetId, label: cutoutOf ? `${base} — background removed` : base });
      if (cutoutOf) list.push({ uploadId: cutoutOf, label: `Photo ${use.first + 1} — original, before background removal` });
    });
    return list;
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
