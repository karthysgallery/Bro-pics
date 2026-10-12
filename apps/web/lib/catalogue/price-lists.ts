import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { PriceListSchema, type PriceList } from '@bro-pics/shared';

/** priceLists/{id} (server-only; no rule opens it to browsers). */
export const PRICE_LISTS = 'priceLists';

export async function listPriceLists(db: Firestore): Promise<PriceList[]> {
  const snap = await db.collection(PRICE_LISTS).get();
  return snap.docs
    .map((d) => PriceListSchema.safeParse(d.data()))
    .filter((r): r is { success: true; data: PriceList } => r.success)
    .map((r) => r.data)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Devotional frames" → "devotional-frames", unique among existing ids. */
export function priceListIdFrom(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'price-list';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
