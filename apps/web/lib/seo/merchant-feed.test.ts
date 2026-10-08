import { describe, it, expect } from 'vitest';
import { buildMerchantFeed, buildMerchantItem } from './merchant-feed';

const product = { id: 'p1', title: 'Desk Photo Frame', slug: 'desk-photo-frame', shortDesc: 'A compact desk frame for one photo.', photoSlots: 1, allowsTextPersonalization: false, seo: {}, primaryImageUrl: '/p/desk.jpg', minPrice: 34900, categoryName: 'Frames' };
const variant = { id: 'v1', sku: 'DESK-4X6-BLK', price: 34900, stockStatus: 'in_stock', sizeLabel: '4x6 in', frameColour: 'Black', material: 'Wood' } as never;

describe('Merchant feed', () => {
  it('builds one item per variant from real catalogue data, with a variant-specific link and group id', () => {
    const xml = buildMerchantItem(product, variant)!;
    expect(xml).toContain('<g:id>DESK-4X6-BLK</g:id>');
    expect(xml).toContain('<g:item_group_id>p1</g:item_group_id>');
    expect(xml).toContain('<title>Desk Photo Frame — 4x6 in, Black</title>');
    expect(xml).toContain('<link>https://karthysgallery.in/product/desk-photo-frame?variantId=v1</link>');
    expect(xml).toContain('<g:image_link>https://karthysgallery.in/p/desk.jpg</g:image_link>');
    expect(xml).toContain('<g:price>349.00 INR</g:price>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>');
    expect(xml).toContain('<g:size>4x6 in</g:size>');
  });

  it('maps stock states and skips an item that has no image or no price rather than inventing values', () => {
    expect(buildMerchantItem(product, { ...(variant as object), stockStatus: 'out_of_stock' } as never)).toContain('<g:availability>out_of_stock</g:availability>');
    expect(buildMerchantItem({ ...product, primaryImageUrl: '' }, variant)).toBeNull();
    expect(buildMerchantItem(product, { ...(variant as object), price: 0 } as never)).toBeNull();
  });

  it('wraps items in a valid RSS 2.0 feed with the g: namespace and escapes text', () => {
    const feed = buildMerchantFeed([buildMerchantItem({ ...product, title: 'Mom & Dad <3' }, variant), null]);
    expect(feed).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(feed).toContain('Mom &amp; Dad &lt;3');
    expect(feed.match(/<item>/g)).toHaveLength(1);
  });
});
