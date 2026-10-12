import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { DEFAULT_FRAMING_COST_RATES, type FrameModel, type PriceList } from '@bro-pics/shared';
import { ProductSetupBodySchema } from '../../../../lib/catalogue/product-setup';
import { AdminApiError } from '../../template-builder/use-admin-api';
import { processJob, BulkJobError, type BulkDeps, type BulkJob, type BulkSettings } from './bulk-runner';

const model = (id: string, name: string): FrameModel => ({
  id, name, code: id.toUpperCase(), colour: 'Brown', colourHex: '#5a3825', material: 'Wood', mouldingWidthIn: 1, image: null,
  costPerFoot: 3000, priceDelta: 0, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '',
});
const teak = model('teak', 'Teak Classic');
const priceList: PriceList = {
  id: 'devotional', name: 'Devotional', createdAt: '', updatedAt: '',
  rows: [
    { longIn: 12, shortIn: 8, frameModelId: 'teak', mrp: 99900, price: 79900, isActive: true },
    { longIn: 18, shortIn: 12, frameModelId: 'teak', mrp: 159900, price: 129900, isActive: true },
  ],
};
const settings = (over: Partial<BulkSettings> = {}): BulkSettings => ({
  categoryId: 'cat_frames', categoryName: 'Frames & Wall Décor', priceList, models: new Map([['teak', teak]]), rates: DEFAULT_FRAMING_COST_RATES,
  glitter: { enabled: false, extraPrice: 10000 }, makePhotos: true, dropSoft: true, dispatchDaysMin: 2, dispatchDaysMax: 4, ...over,
});
const job = (over: Partial<BulkJob> = {}): BulkJob => ({ id: 'j1', file: new File(['x'], 'murugan.jpg', { type: 'image/jpeg' }), name: 'Lord Murugan', subject: '', orientation: 'auto', width: 4000, height: 6000, ...over });
const photos = (n = 5) => Array.from({ length: n }, (_, i) => ({ key: 'framed' as const, label: `p${i}`, alt: `alt ${i}`, dataUrl: 'data:image/jpeg;base64,/9j/' }));

let uploads = 0;
function deps(over: Partial<BulkDeps> = {}): BulkDeps & { posts: unknown[] } {
  const posts: unknown[] = [];
  return {
    posts,
    api: vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup') {
        posts.push(JSON.parse(String(init?.body)));
        return { productId: `p${posts.length}`, warnings: ['Row 2: Margin is under 20%.'] };
      }
      throw new Error(`unexpected ${path}`);
    }) as unknown as BulkDeps['api'],
    upload: vi.fn(async () => ({ id: `m${++uploads}`, url: `/api/media/m${uploads}/image?w=1600`, width: 4000, height: 6000, alt: '' })),
    makePhotos: vi.fn(async () => photos()),
    lookOf: () => null,
    sleep: vi.fn(async () => {}),
    ...over,
  };
}
const noop = () => {};
const fresh = () => ({ slugs: new Set<string>(), codes: new Set<string>() });

describe('processJob', () => {
  beforeEach(() => { uploads = 0; });

  it('makes one draft: uploads the picture and the five shop photos, saves a body the server accepts', async () => {
    const d = deps();
    const patches: Partial<BulkJob>[] = [];
    const res = await processJob(d, settings(), job({ subject: 'Lord Murugan' }), fresh(), (p) => patches.push(p), noop);
    expect(res).toMatchObject({ productId: 'p1', slug: 'lord-murugan-photo-frame', title: 'Lord Murugan Photo Frame' });
    expect(d.upload).toHaveBeenCalledTimes(6); // artwork + 5 photos
    const body = d.posts[0] as Record<string, unknown> & { rows: Array<{ widthIn: number; heightIn: number }>; gallery: unknown[] };
    expect(body).toMatchObject({ status: 'draft', productType: 'ready_made', categoryId: 'cat_frames', frameModelIds: ['teak'], artworkMediaId: 'm1', glitter: { enabled: false } });
    // A portrait picture hangs the list's 12×8 as 8 wide × 12 high.
    expect(body.rows[0]).toMatchObject({ widthIn: 8, heightIn: 12 });
    expect(body.gallery).toHaveLength(5);
    expect(ProductSetupBodySchema.safeParse(body).success).toBe(true);
    expect(patches.some((p) => p.productId === 'p1')).toBe(true);
  });

  it('passes glitter on and makes the sixth photo', async () => {
    const d = deps({ makePhotos: vi.fn(async () => photos(6)) });
    await processJob(d, settings({ glitter: { enabled: true, extraPrice: 15000 } }), job(), fresh(), noop, noop);
    expect(d.makePhotos).toHaveBeenCalledWith(expect.objectContaining({ glitter: { extraPrice: 15000 } }));
    const body = d.posts[0] as { glitter: unknown; gallery: unknown[] };
    expect(body.glitter).toEqual({ enabled: true, extraPrice: 15000 });
    expect(body.gallery).toHaveLength(6);
  });

  it('skips the shop photos when asked, and saves no photo key', async () => {
    const d = deps();
    await processJob(d, settings({ makePhotos: false }), job(), fresh(), noop, noop);
    expect(d.makePhotos).not.toHaveBeenCalled();
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.posts[0]).toMatchObject({ gallery: [], autoPhotoKey: null });
  });

  it('waits out the rate limit instead of failing the picture', async () => {
    let first = true;
    const d = deps({ upload: vi.fn(async () => { if (first) { first = false; throw new AdminApiError(429, 'Too many requests, please try again shortly'); } return { id: 'm1', url: '/api/media/m1/image?w=1600', width: 4000, height: 6000, alt: '' }; }) });
    const steps: string[] = [];
    await processJob(d, settings({ makePhotos: false }), job(), fresh(), noop, (t) => steps.push(t));
    expect(d.sleep).toHaveBeenCalledWith(15_000);
    expect(steps.some((t) => /slow down/.test(t))).toBe(true);
  });

  it('gives the next free address when the web address is taken, and numbers a repeated product code', async () => {
    let calls = 0;
    const d = deps({
      api: vi.fn(async (_p: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        if (++calls === 1) throw new AdminApiError(409, `Another product already uses the web address /product/${body.slug}.`);
        return { productId: 'p9', warnings: [] };
      }) as unknown as BulkDeps['api'],
    });
    const taken = { slugs: new Set<string>(), codes: new Set(['LORDMURUGAN']) };
    const res = await processJob(d, settings({ makePhotos: false }), job(), taken, noop, noop);
    expect(res.slug).toBe('lord-murugan-photo-frame-2');
    expect(vi.mocked(d.api).mock.calls).toHaveLength(2);
    expect(taken.codes.has('LORDMURUGAN2')).toBe(true);
  });

  it('on a retry, keeps the picture and photos already uploaded and does not repeat them', async () => {
    const first = deps({ api: vi.fn(async () => { throw new AdminApiError(500, 'The product could not be saved.'); }) as unknown as BulkDeps['api'] });
    const state: Partial<BulkJob> = {};
    await expect(processJob(first, settings(), job(), fresh(), (p) => Object.assign(state, p), noop)).rejects.toThrow('could not be saved');
    expect(state.artwork?.id).toBe('m1');
    expect(state.gallery).toHaveLength(5);

    const second = deps();
    const res = await processJob(second, settings(), job(state), fresh(), noop, noop);
    expect(res.productId).toBe('p1');
    expect(second.upload).not.toHaveBeenCalled();
    expect(second.makePhotos).not.toHaveBeenCalled();
    expect((second.posts[0] as { artworkMediaId: string }).artworkMediaId).toBe('m1');
  });

  it('after a lost answer, finds the product it may already have made instead of making a twin', async () => {
    const lost = deps({ api: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as BulkDeps['api'] });
    const state: Partial<BulkJob> = {};
    await expect(processJob(lost, settings({ makePhotos: false }), job(), fresh(), (p) => Object.assign(state, p), noop)).rejects.toThrow('Failed to fetch');
    expect(state.maybeSaved).toBe(true);
    expect(state.slug).toBe('lord-murugan-photo-frame');

    const again = deps({
      api: vi.fn(async (path: string) => {
        if (path.startsWith('/api/admin/products?q=')) return { products: [{ id: 'existing1', slug: 'lord-murugan-photo-frame' }] };
        throw new Error('must not save again');
      }) as unknown as BulkDeps['api'],
    });
    const res = await processJob(again, settings({ makePhotos: false }), job(state), fresh(), noop, noop);
    expect(res.productId).toBe('existing1');
  });

  it('refuses a picture too small for any size, in plain words', async () => {
    const d = deps({ upload: vi.fn(async () => ({ id: 'm1', url: '/u?w=1600', width: 600, height: 400, alt: '' })) });
    await expect(processJob(d, settings(), job({ width: 600, height: 400 }), fresh(), noop, noop)).rejects.toThrow(/too small to print sharp/);
  });

  it('refuses a price list whose frame models are gone, before uploading anything', async () => {
    const d = deps();
    await expect(processJob(d, settings({ models: new Map() }), job(), fresh(), noop, noop)).rejects.toBeInstanceOf(BulkJobError);
    expect(d.upload).not.toHaveBeenCalled();
  });
});
