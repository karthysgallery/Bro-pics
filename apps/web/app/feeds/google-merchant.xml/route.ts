import { getFirestore } from 'firebase-admin/firestore';
import type { Category, Variant } from '@bro-pics/shared';
import { getAdminApp } from '../../../lib/firebase-admin';
import { getIndexableProducts } from '../../../lib/seo/sitemap-data';
import { buildMerchantFeed, buildMerchantItem } from '../../../lib/seo/merchant-feed';

export const revalidate = 3600;

/**
 * The product feed for Google Merchant Center (free listings): every published, indexable product, one item per
 * active size/finish, built live from the catalogue so new and edited products appear without any manual step.
 * Submit this address in Merchant Center as a scheduled fetch.
 */
export async function GET(): Promise<Response> {
  const db = getFirestore(getAdminApp());
  const [products, categorySnap] = await Promise.all([getIndexableProducts(), db.collection('categories').get()]);
  const categoryNames = new Map(categorySnap.docs.map((d) => [d.id, (d.data() as Category).name]));

  const items: Array<string | null> = [];
  for (const product of products) {
    const variantSnap = await db.collection('products').doc(product.id).collection('variants').where('isActive', '==', true).get();
    for (const doc of variantSnap.docs) {
      items.push(buildMerchantItem({ ...product, categoryName: categoryNames.get(product.categoryId) }, { ...(doc.data() as Variant), id: doc.id }));
    }
  }

  return new Response(buildMerchantFeed(items), {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
