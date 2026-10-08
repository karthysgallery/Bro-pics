import type { Product, Variant } from '@bro-pics/shared';
import { escapeXml } from './sitemap-xml';
import { productSeoDescription } from './product-seo';
import { absoluteUrl, canonicalUrl, SITE_NAME } from './site';

export interface FeedProduct extends Pick<Product, 'id' | 'title' | 'slug' | 'shortDesc' | 'photoSlots' | 'allowsTextPersonalization' | 'seo' | 'primaryImageUrl' | 'minPrice'> {
  categoryName?: string;
}

type FeedVariant = Pick<Variant, 'id' | 'sku' | 'price' | 'stockStatus' | 'sizeLabel' | 'frameColour' | 'material'>;

const AVAILABILITY: Record<string, string> = { in_stock: 'in_stock', backorder: 'backorder', out_of_stock: 'out_of_stock' };

/**
 * One Google Merchant Center item per sellable size/finish. All values come from the catalogue: nothing is made up
 * (no GTIN/MPN — custom products have none, so identifier_exists is "no"; no Google category — the owner picks it in Merchant Center).
 */
export function buildMerchantItem(product: FeedProduct, variant: FeedVariant): string | null {
  if (!product.primaryImageUrl || variant.price <= 0) return null;
  const variantLabel = [variant.sizeLabel, variant.frameColour].filter(Boolean).join(', ');
  const title = `${product.title}${variantLabel ? ` — ${variantLabel}` : ''}`.slice(0, 150);
  const lines = [
    '    <item>',
    `      <g:id>${escapeXml(variant.sku || variant.id)}</g:id>`,
    `      <g:item_group_id>${escapeXml(product.id)}</g:item_group_id>`,
    `      <title>${escapeXml(title)}</title>`,
    `      <description>${escapeXml(productSeoDescription(product))}</description>`,
    `      <link>${escapeXml(`${canonicalUrl(`/product/${product.slug}`)}?variantId=${encodeURIComponent(variant.id)}`)}</link>`,
    `      <g:image_link>${escapeXml(absoluteUrl(product.primaryImageUrl))}</g:image_link>`,
    `      <g:availability>${AVAILABILITY[variant.stockStatus] ?? 'out_of_stock'}</g:availability>`,
    `      <g:price>${(variant.price / 100).toFixed(2)} INR</g:price>`,
    '      <g:condition>new</g:condition>',
    `      <g:brand>${SITE_NAME}</g:brand>`,
    '      <g:identifier_exists>no</g:identifier_exists>',
  ];
  if (product.categoryName) lines.push(`      <g:product_type>${escapeXml(product.categoryName)}</g:product_type>`);
  if (variant.sizeLabel) lines.push(`      <g:size>${escapeXml(variant.sizeLabel)}</g:size>`);
  if (variant.frameColour) lines.push(`      <g:color>${escapeXml(variant.frameColour)}</g:color>`);
  if (variant.material) lines.push(`      <g:material>${escapeXml(variant.material)}</g:material>`);
  lines.push('    </item>');
  return lines.join('\n');
}

export function buildMerchantFeed(items: Array<string | null>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    '  <channel>',
    `    <title>${SITE_NAME}</title>`,
    `    <link>${canonicalUrl('/')}</link>`,
    `    <description>${SITE_NAME} product feed</description>`,
    ...items.filter((i): i is string => i !== null),
    '  </channel>',
    '</rss>',
  ].join('\n');
}
