'use client';

import { useEffect, useState } from 'react';
import type { Product, Variant } from '@bro-pics/shared';
import { useAdminApi } from './use-admin-api';

/**
 * "Use on products": attach this design to a whole product (every size) or to
 * single sizes. Customers see it once a version is published.
 */
export function ProductLinks({ templateId, live }: { templateId: string; live: boolean }) {
  const api = useAdminApi();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProducts = () =>
    api<{ products: Product[] }>('/api/admin/products')
      .then((res) => setProducts(res.products ?? []))
      .catch(() => setProducts([]));
  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const loadVariants = (id: string) =>
    api<{ variants: Variant[] }>(`/api/admin/products/${id}/variants`)
      .then((res) => setVariants(res.variants ?? []))
      .catch(() => setVariants([]));
  useEffect(() => {
    setVariants([]);
    if (productId) void loadVariants(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const product = products.find((p) => p.id === productId) ?? null;
  const linkedProducts = products.filter((p) => p.personalizationTemplateId === templateId);
  const productLinked = product?.personalizationTemplateId === templateId;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await Promise.all([loadProducts(), productId ? loadVariants(productId) : null]);
      setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'That change could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  const setProductLink = (linked: boolean) =>
    run(
      () => api(`/api/admin/products/${productId}`, { method: 'PATCH', body: JSON.stringify({ personalizationTemplateId: linked ? templateId : null }) }),
      linked ? 'Every size of this product now uses this design.' : 'Removed from this product.'
    );

  const setVariantLink = (variant: Variant, linked: boolean) =>
    run(
      () =>
        api(`/api/admin/products/${productId}/variants/${variant.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ personalizationTemplateId: linked ? templateId : null }),
        }),
      linked ? `${variant.sizeLabel} now uses this design.` : `${variant.sizeLabel} no longer has its own design.`
    );

  return (
    <section aria-labelledby="product-links" className="space-y-3">
      <div>
        <h3 id="product-links" className="text-sm font-semibold text-ink">
          Use on products
        </h3>
        <p className="text-2xs text-ink/55">
          {live ? 'Customers see the published version on these products.' : 'You can link it now; customers see it once a version is published.'}
        </p>
      </div>
      {linkedProducts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {linkedProducts.map((p) => (
            <li key={p.id} className="rounded-full bg-tint px-2.5 py-1 text-2xs font-semibold text-ink">
              {p.title}
            </li>
          ))}
        </ul>
      )}
      <select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink">
        <option value="">Choose a product…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.personalizationTemplateId === templateId ? ' (uses this design)' : ''}
          </option>
        ))}
      </select>
      {product && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={productLinked} disabled={busy} onChange={(e) => setProductLink(e.target.checked)} className="h-4 w-4 accent-[#c9861a]" />
            Every size of {product.title}
          </label>
          {variants.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-2">
              <p className="text-2xs text-ink/55">Or only some sizes (overrides the product setting):</p>
              {variants.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={v.personalizationTemplateId === templateId}
                    disabled={busy}
                    onChange={(e) => setVariantLink(v, e.target.checked)}
                    className="h-4 w-4 accent-[#c9861a]"
                  />
                  {v.sizeLabel} · {v.frameColour || 'Standard'} ({v.widthIn}×{v.heightIn} in)
                  {v.personalizationTemplateId && v.personalizationTemplateId !== templateId && <span className="text-ink/45"> · has another design</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-xs ${message.ok ? 'text-[#2f8f5b]' : 'text-alert'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
