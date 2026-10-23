import { describe, it, expect, vi } from 'vitest';
import type { FrameModel } from '@bro-pics/shared';
import { remakeShopPhotos, pictureSourceOf, type LoadedSetup, type RemakeDeps } from './remake-photos';
import { photoKeyOf } from '../photo-key';

const model = { id: 'fm1', name: 'Normal Frame 1 inch', material: 'Other', colour: 'Brown', colourHex: '#5a3a1a', mouldingWidthIn: 1, image: null } as unknown as FrameModel;
const models = new Map([[model.id, model]]);

function setup(over: Partial<LoadedSetup['product']> = {}, gallery: LoadedSetup['gallery'] = [{ mediaId: 'plain', url: '/api/media/plain/image', alt: 'Collage', auto: false }]): LoadedSetup {
  return {
    product: {
      productType: 'collage', isLegacy: false, title: 'Heart Collage Frame', slug: 'heart-collage-frame', productCode: 'HEART', categoryId: 'c1',
      subject: 'heart', shortDesc: 'A heart collage', descriptionHtml: '<p>x</p>', highlights: [], howItWorks: [], careText: '', faq: [], badges: [],
      occasionTags: ['birthday'], status: 'published', isFeatured: false, allowsTextPersonalization: true, dispatchDaysMin: 1, dispatchDaysMax: 2,
      hsnCode: '', seo: { title: 't', description: 'd', focusKeyword: 'k', keywords: [], imageAlt: 'a', noindex: false },
      frameModelIds: ['fm1'], artwork: null, autoPhotoKey: null, glitter: { enabled: false, extraPrice: 10000 }, samplePhotos: ['/s1.jpg'], collageTemplateId: 'tpl1',
      ...over,
    },
    rows: [
      { variantId: 'v2', widthIn: 18, heightIn: 12, frameModelId: 'fm1', legacyFinish: null, mrp: 199900, price: 159900, cost: 50000, isActive: true },
      { variantId: 'v1', widthIn: 12, heightIn: 8, frameModelId: 'fm1', legacyFinish: null, mrp: 99900, price: 59900, cost: 20000, isActive: true },
    ],
    gallery,
  };
}

function deps(loaded: LoadedSetup) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let n = 0;
  const d: RemakeDeps = {
    api: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.includes('/personalization-templates/')) return { versions: [{ id: 'tpl1' }] };
      if (!init) return loaded;
      return { productId: 'p1', warnings: [] };
    }) as RemakeDeps['api'],
    upload: vi.fn(async () => ({ id: `m${++n}`, url: `/api/media/m${n}/image`, width: 1600, height: 1600, alt: '' })),
    makePhotos: vi.fn(async () => (['framed', 'sizes', 'frame', 'wall', 'picture'] as const).map((key) => ({ key, label: key, alt: `${key} alt`, dataUrl: 'data:image/jpeg;base64,AA==' }))),
    lookOf: () => null,
    renderCollage: vi.fn(async () => 'data:image/png;base64,AA=='),
    latestDesign: (v) => v[0] ?? null,
    samplePhoto: '/sample.jpg',
    sleep: async () => {},
  };
  return { d, calls };
}

describe('remakeShopPhotos', () => {
  it('saves the framed photos first, keeps the owner photos after, and records the editor’s photo key', async () => {
    const loaded = setup();
    const { d, calls } = deps(loaded);
    const r = await remakeShopPhotos(d, 'p1', models, () => {});
    expect(r).toEqual({ status: 'made', photos: 5 });
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    expect(put.path).toBe('/api/admin/products/p1/setup');
    const body = JSON.parse(String(put.init!.body));
    expect(body.gallery.map((g: { mediaId: string }) => g.mediaId)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'plain']);
    expect(body.gallery[0].auto).toBe(true);
    expect(body.gallery[5].auto).toBe(false);
    // Smallest size first: the same order the editor uses, so the editor sees the photos as up to date.
    expect(body.autoPhotoKey).toBe(
      photoKeyOf({ productType: 'collage', title: 'Heart Collage Frame', pictureSource: 'tpl1|/s1.jpg', models: [model], sizes: [{ widthIn: 12, heightIn: 8 }, { widthIn: 18, heightIn: 12 }], glitterExtra: 0 })
    );
    // Everything else is sent back as it was loaded.
    expect(body.status).toBe('published');
    expect(body.rows[0]).toEqual({ variantId: 'v2', widthIn: 18, heightIn: 12, frameModelId: 'fm1', mrp: 199900, price: 159900, cost: 50000, isActive: true });
    expect(body.collageTemplateId).toBe('tpl1');
    expect(body.samplePhotos).toEqual(['/s1.jpg']);
    expect(d.renderCollage).toHaveBeenCalledWith({ id: 'tpl1' }, ['/s1.jpg']);
  });

  it('leaves a product whose framed photos are already up to date', async () => {
    const key = photoKeyOf({ productType: 'collage', title: 'Heart Collage Frame', pictureSource: 'tpl1|/s1.jpg', models: [model], sizes: [{ widthIn: 12, heightIn: 8 }, { widthIn: 18, heightIn: 12 }], glitterExtra: 0 });
    const loaded = setup({ autoPhotoKey: key }, [{ mediaId: 'a1', url: '/api/media/a1/image', alt: '', auto: true }]);
    const { d, calls } = deps(loaded);
    expect(await remakeShopPhotos(d, 'p1', models, () => {})).toEqual({ status: 'up-to-date' });
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('skips older products whose sizes have no frame model, without saving', async () => {
    const loaded = setup();
    loaded.rows[0]!.frameModelId = null;
    const { d, calls } = deps(loaded);
    const r = await remakeShopPhotos(d, 'p1', models, () => {});
    expect(r.status).toBe('skipped');
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
  });

  it('uses the same picture source as the editor for each kind of frame', () => {
    const p = setup().product;
    expect(pictureSourceOf(p)).toBe('tpl1|/s1.jpg');
    expect(pictureSourceOf({ ...p, samplePhotos: [] })).toBe('tpl1|sample');
    expect(pictureSourceOf({ ...p, productType: 'ready_made', artwork: { mediaId: 'art1', url: '/a' } })).toBe('art1');
    expect(pictureSourceOf({ ...p, productType: 'single_photo', samplePhotos: [] })).toBe('sample');
  });
});
