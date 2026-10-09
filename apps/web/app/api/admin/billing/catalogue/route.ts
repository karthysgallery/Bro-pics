import { NextResponse } from 'next/server';
import type { Product, Variant } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../lib/billing/server';

export interface CatalogueHit {
  productId: string;
  variantId: string;
  title: string;
  variantLabel: string;
  sku: string;
  price: number;
  /** Units on hand when counted; null = made to order (no limit). */
  stockQty: number | null;
  stockStatus: Variant['stockStatus'];
}

let cache: { at: number; products: Array<{ product: Product; variants: Variant[] }> } | null = null;

/**
 * GET /api/admin/billing/catalogue?q= — the SAME catalogue the website sells
 * (products + sizes), searched by name, SKU or size, with today's price and
 * stock. Prices shown here are for display; the sale route re-reads them.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'billing:create');
  if (!g.ok) return g.response;
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  const db = billingDb();
  // Product list cached briefly (names change rarely); stock is always read fresh below.
  if (!cache || Date.now() - cache.at > 60_000) {
    const products = await db.collection('products').where('isActive', '==', true).get();
    const rows = await Promise.all(
      products.docs.map(async (p) => ({ product: p.data() as Product, variants: (await p.ref.collection('variants').get()).docs.map((v) => ({ ...(v.data() as Variant), id: v.id })) }))
    );
    cache = { at: Date.now(), products: rows.filter((r) => r.product.status !== 'archived') };
  }
  const words = q.split(/\s+/).filter(Boolean);
  const hits: Array<{ productId: string; variantId: string }> = [];
  for (const { product, variants } of cache.products) {
    for (const v of variants) {
      if (v.isActive === false) continue;
      const hay = `${product.title} ${v.sku} ${v.sizeLabel} ${v.frameColour}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) hits.push({ productId: product.id, variantId: v.id });
    }
  }
  const top = hits.slice(0, 30);
  const fresh = await Promise.all(top.map((h) => db.collection('products').doc(h.productId).collection('variants').doc(h.variantId).get()));
  const items: CatalogueHit[] = top.map((h, i) => {
    const product = cache!.products.find((p) => p.product.id === h.productId)!.product;
    const v = fresh[i]!.data() as Variant;
    return {
      productId: h.productId,
      variantId: h.variantId,
      title: product.title,
      variantLabel: [v.sizeLabel, v.frameColour].filter(Boolean).join(' · '),
      sku: v.sku,
      price: v.price,
      stockQty: v.trackStock ? (v.stockQty ?? 0) : null,
      stockStatus: v.stockStatus,
    };
  });
  return NextResponse.json({ items, total: hits.length }, { status: 200 });
}
