'use client';

import { useSearchParams } from 'next/navigation';
import { ProductDetailClient, type ProductDetailClientProps } from './ProductDetailClient';

/**
 * Reads the two things a product address can carry in its query string — `?edit=` (re-edit a cart line's design) and
 * `?variantId=` (open on a given size, the address used for each size in the structured data) — in the BROWSER.
 *
 * The product page itself must not read the query string on the server: doing so turns a cacheable, pre-rendered page
 * into one rendered afresh (and uncached) for every visitor and every crawler. Rendered like this, the server sends the
 * same fast static HTML to everyone and the browser then applies the query string.
 */
export function ProductDetailWithUrlParams(props: Omit<ProductDetailClientProps, 'editPersonalizationId' | 'initialVariantId'>) {
  const params = useSearchParams();
  const edit = params.get('edit') ?? undefined;
  const requested = params.get('variantId');
  const variantId = requested && props.variants.some((v) => v.id === requested) ? requested : undefined;
  // A different query string is a different starting point: start the editor again from it.
  return <ProductDetailClient key={`${edit ?? ''}|${variantId ?? ''}`} {...props} editPersonalizationId={edit} initialVariantId={variantId} />;
}
