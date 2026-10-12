import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_FRAMING_COST_RATES, type FrameModel } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
// The editor gets whatever function this holds, so a test can hand it a new one (as a sign-in refresh does).
const apiHolder = vi.hoisted(() => ({ current: null as unknown as (...a: unknown[]) => unknown }));
vi.mock('../template-builder/use-admin-api', () => ({ useAdminApi: () => apiHolder.current ?? api }));
vi.mock('./use-catalogue-upload', async (orig) => ({ ...(await orig<typeof import('./use-catalogue-upload')>()), useCatalogueUpload: () => upload }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
// The framed preview draws on a canvas, which jsdom has not got.
vi.mock('./FramedPreview', () => ({ FramedPreview: ({ label }: { label?: string }) => <div data-testid="framed-preview">{label}</div>, lookOf: () => null, SAMPLE_PHOTO: '/sample.jpg' }));
vi.mock('../../../lib/auth-context', () => ({ useAuth: () => ({ user: { getIdToken: async () => 'tok' } }) }));
const makeProductPhotos = vi.hoisted(() => vi.fn());
vi.mock('./product-photos', () => ({ makeProductPhotos }));

import { ProductEditor } from './ProductEditor';

const model = (id: string, name: string, priceDelta = 0): FrameModel => ({
  id, name, code: id.toUpperCase(), colour: 'Brown', colourHex: '#5a3825', material: 'Wood', mouldingWidthIn: 1, image: null,
  costPerFoot: 3000, priceDelta, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '',
});

describe('guided product editor', () => {
  beforeEach(() => {
    api.mockReset();
    apiHolder.current = api;
    replace.mockReset();
    upload.mockReset();
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup/options')
        return { categories: [{ id: 'devotional', name: 'Devotional', slug: 'devotional' }], frameModels: [model('teak', 'Teak Classic'), model('gold', 'Royal Gold', 20000)], rates: DEFAULT_FRAMING_COST_RATES, collageTemplates: [] };
      if (path === '/api/admin/products/setup' && init?.method === 'POST') return { productId: 'p_new', warnings: ['Row 2: Margin is under 20%.'] };
      throw new Error(`unexpected ${path}`);
    });
    let n = 0;
    upload.mockImplementation(async (file: File) =>
      file.name.endsWith('.jpg') && file.name !== 'murugan.jpg'
        ? { id: `auto${++n}`, url: `/api/media/auto${n}/image?w=1600`, width: 1600, height: 1600, alt: '' }
        : { id: 'art1', url: '/api/media/art1/image?w=1600', width: 4000, height: 6000, alt: '' }
    );
    makeProductPhotos.mockReset();
    makeProductPhotos.mockResolvedValue(
      (['framed', 'sizes', 'frame', 'wall', 'picture'] as const).map((key) => ({ key, label: key, alt: `Lord Murugan ${key}`, dataUrl: 'data:image/jpeg;base64,/9j/' }))
    );
  });

  it('builds a ready-made frame end to end: type, name, generated details, artwork, two frame models, priced sizes, then publishes', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ready-made frame/ }));
    fireEvent.change(screen.getByPlaceholderText('Lord Murugan Photo Frame'), { target: { value: 'Lord Murugan' } });
    fireEvent.change(within(document.getElementById('details')!).getByPlaceholderText('Lord Murugan'), { target: { value: 'Lord Murugan' } });
    // No category is pre-chosen: the owner picks where it is listed.
    expect((document.querySelector('#details select') as HTMLSelectElement).value).toBe('');
    fireEvent.change(document.querySelector('#details select')!, { target: { value: 'devotional' } });

    // Artwork
    const file = new File(['x'], 'murugan.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type=file]:not([multiple])')!, { target: { files: [file] } });
    await screen.findByText('4000 × 6000 pixels');

    // Teak is pre-selected as the default; add Royal Gold.
    fireEvent.click(screen.getByRole('button', { name: /Royal Gold/ }));
    // Two sizes → 2 sizes × 2 frames = 4 price lines. The artwork is portrait, so 12×8 hangs as 8 wide × 12 high.
    expect(screen.getByRole('button', { name: /Portrait/, pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '12×8' }));
    fireEvent.click(screen.getByRole('button', { name: '18×12' }));
    const set = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
    set('MRP 8x12 in Teak Classic', '999');
    set('Selling price 8x12 in Teak Classic', '799');
    set('MRP 12x18 in Teak Classic', '1599');
    set('Selling price 12x18 in Teak Classic', '1299');
    fireEvent.click(screen.getByRole('button', { name: 'Fill other frames from Teak Classic' }));
    // Royal Gold is ₹200 dearer by its price change.
    expect((screen.getByLabelText('Selling price 12x18 in Royal Gold') as HTMLInputElement).value).toBe('1499');
    // Sharpness of the artwork per size: 4000×6000 at 12×18 = 333 ppi.
    expect(screen.getByTitle('333 pixels per inch at this size')).toBeTruthy();

    // Generate details → SEO 100 (artwork counts as the photo).
    fireEvent.click(screen.getByRole('button', { name: /Generate details/ }));
    await waitFor(() => expect(within(document.querySelector('aside')!).getByText('100')).toBeTruthy());
    expect((screen.getByDisplayValue('Lord Murugan Photo Frame') as HTMLInputElement).value).toBe('Lord Murugan Photo Frame');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/products/p_new'));
    expect(await screen.findByText('Row 2: Margin is under 20%.')).toBeTruthy();

    const body = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/products/setup' && i?.method === 'POST')![1].body));
    expect(body).toMatchObject({
      productType: 'ready_made', title: 'Lord Murugan Photo Frame', slug: 'lord-murugan-photo-frame', productCode: 'LORDMURUGAN', subject: 'Lord Murugan',
      categoryId: 'devotional', status: 'published', frameModelIds: ['teak', 'gold'], artworkMediaId: 'art1', collageTemplateId: null,
      seo: { focusKeyword: 'lord murugan photo frame' },
    });
    expect(body.rows).toHaveLength(4);
    expect(body.rows.find((r: { widthIn: number; frameModelId: string }) => r.widthIn === 12 && r.frameModelId === 'gold')).toMatchObject({ mrp: 179900, price: 149900, isActive: true });
    expect(body.rows.every((r: { cost: number }) => r.cost > 0)).toBe(true); // making costs suggested
    expect(body.descriptionHtml).toContain('<h3>Sizes and frames</h3>');
    expect(body.faq.length).toBeGreaterThanOrEqual(4);
    // The five shop photos were made from the artwork and default frame, uploaded and put first.
    expect(makeProductPhotos).toHaveBeenCalledWith(expect.objectContaining({ isSample: false, sizes: [{ widthIn: 8, heightIn: 12 }, { widthIn: 12, heightIn: 18 }], frames: [expect.objectContaining({ name: 'Teak Classic' }), expect.objectContaining({ name: 'Royal Gold' })] }));
    expect(body.gallery).toEqual([1, 2, 3, 4, 5].map((i) => expect.objectContaining({ mediaId: `auto${i}`, auto: true })));
    expect(typeof body.autoPhotoKey).toBe('string');
  });

  it('will not publish until the essentials are done, and says what is missing', async () => {
    render(<ProductEditor productId={null} />);
    await screen.findByRole('button', { name: /Ready-made frame/ });
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
    const rail = document.querySelector('aside')!;
    expect(within(rail).getByText('Kind of frame chosen')).toBeTruthy();
    expect(within(rail).getByText('Every size priced')).toBeTruthy();
    // Generate is disabled until a kind of frame and a name exist.
    expect((screen.getByRole('button', { name: /Generate details/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags a selling price above the MRP on the line itself', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Single photo frame/ }));
    fireEvent.click(screen.getByRole('button', { name: '8×6' }));
    fireEvent.change(screen.getByLabelText('MRP 8x6 in Teak Classic'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Selling price 8x6 in Teak Classic'), { target: { value: '600' } });
    expect(screen.getByText('Selling price is more than the MRP.')).toBeTruthy();
  });

  it('converts an older product whose finishes match no frame model, keeping every old size id and adding no duplicates', async () => {
    const old = (id: string, w: number, h: number, finish: string, price: number) => ({ variantId: id, widthIn: w, heightIn: h, frameModelId: null, legacyFinish: finish, mrp: price, price, cost: 0, isActive: true });
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup/options')
        return { categories: [{ id: 'frames', name: 'Frames', slug: 'frames' }], frameModels: [model('teak', 'Teak Classic'), model('gold', 'Royal Gold', 20000)], rates: DEFAULT_FRAMING_COST_RATES, collageTemplates: [] };
      if (path === '/api/admin/products/old1/setup' && !init) {
        return {
          product: {
            id: 'old1', productType: 'single_photo', isLegacy: true, title: 'Classic Wooden Frame', slug: 'classic-wooden-frame', productCode: 'CWF', categoryId: 'frames', subject: '',
            shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '', faq: [], badges: [], occasionTags: [], status: 'published', isFeatured: false,
            allowsTextPersonalization: false, dispatchDaysMin: 2, dispatchDaysMax: 4, hsnCode: '', seo: { title: '', description: '', focusKeyword: '', keywords: [], imageAlt: '', noindex: false },
            frameModelIds: [], artwork: null, collageTemplateId: null, primaryImageUrl: '/x.jpg',
          },
          rows: [old('v_8_blk', 8, 12, 'Black', 79900), old('v_8_wht', 8, 12, 'White', 79900), old('v_12_blk', 12, 18, 'Black', 129900), old('v_12_wht', 12, 18, 'White', 129900)],
          gallery: [{ mediaId: null, url: '/x.jpg', alt: '' }],
        };
      }
      if (path === '/api/admin/products/old1/setup' && init?.method === 'PUT') return { productId: 'old1', warnings: [] };
      throw new Error(`unexpected ${path}`);
    });
    render(<ProductEditor productId="old1" />);
    const pick = async (index: number, value: string) => {
      const selects = await screen.findAllByLabelText('Frame model for this size');
      fireEvent.change(selects[index]!, { target: { value } });
    };
    // Black (8x12) → Teak: every Black line follows; White → Royal Gold.
    await pick(0, 'teak');
    expect(screen.getAllByLabelText('Frame model for this size')).toHaveLength(2);
    await pick(0, 'gold');
    expect(screen.queryAllByLabelText('Frame model for this size')).toHaveLength(0);
    expect(screen.queryByText('This size and frame model is listed twice.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.mock.calls.some(([p, i]) => p === '/api/admin/products/old1/setup' && i?.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/products/old1/setup' && i?.method === 'PUT')![1].body));
    expect(body.frameModelIds).toEqual(['teak', 'gold']);
    expect(body.rows.map((r: { variantId?: string; frameModelId: string }) => [r.variantId, r.frameModelId]).sort()).toEqual([
      ['v_12_blk', 'teak'], ['v_12_wht', 'gold'], ['v_8_blk', 'teak'], ['v_8_wht', 'gold'],
    ]);
    expect(body.gallery).toEqual([]); // older photos are kept on the server, not resent
  });

  it('keeps the chosen frame models when the editor reloads its lists (e.g. the sign-in refreshes)', async () => {
    const { rerender } = render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Royal Gold/ }));
    fireEvent.click(screen.getByRole('button', { name: '12×8' }));
    expect(screen.getByLabelText('MRP 12x8 in Royal Gold')).toBeTruthy();
    // A new api function (as after a token refresh) makes the editor fetch its lists again.
    const before = api.mock.calls.filter(([p]) => p === '/api/admin/products/setup/options').length;
    apiHolder.current = (...a: unknown[]) => (api as (...x: unknown[]) => unknown)(...a);
    rerender(<ProductEditor productId={null} />);
    await waitFor(() => expect(api.mock.calls.filter(([p]) => p === '/api/admin/products/setup/options').length).toBe(before + 1));
    expect(screen.getByRole('button', { name: /Royal Gold/, pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Teak Classic/, pressed: true })).toBeTruthy();
  });

  it('turns every size line the other way with the Landscape / Portrait switch', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Single photo frame/ }));
    fireEvent.click(screen.getByRole('button', { name: '12×8' }));
    fireEvent.click(screen.getByRole('button', { name: '24×16' }));
    expect(screen.getByLabelText('MRP 12x8 in Teak Classic')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Portrait/ }));
    expect(screen.getByLabelText('MRP 8x12 in Teak Classic')).toBeTruthy();
    expect(screen.getByLabelText('MRP 16x24 in Teak Classic')).toBeTruthy();
    expect(screen.getByRole('button', { name: '12×8', pressed: true })).toBeTruthy();
  });

  it('publishes with a switched-off size left at ₹0, and names the line when a sold size has no price', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Single photo frame/ }));
    fireEvent.change(screen.getByPlaceholderText('Classic Family Photo Frame'), { target: { value: 'Family Frame' } });
    fireEvent.change(document.querySelector('#details select')!, { target: { value: 'devotional' } });
    fireEvent.click(screen.getByRole('button', { name: /Royal Gold/ }));
    fireEvent.click(screen.getByRole('button', { name: '12×8' }));
    fireEvent.change(screen.getByLabelText('MRP 12x8 in Teak Classic'), { target: { value: '599' } });
    fireEvent.change(screen.getByLabelText('Selling price 12x8 in Teak Classic'), { target: { value: '444' } });
    // Royal Gold left at ₹0 but still ticked: Save names that line instead of a raw error.
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }));
    expect(await screen.findAllByText(/12x8 in · Royal Gold: Enter a selling price/)).toBeTruthy();
    expect(api.mock.calls.some(([p]) => p === '/api/admin/products/setup')).toBe(false);
    // Untick "Sell" for it: now it saves.
    fireEvent.click(screen.getByLabelText('Sell 12x8 in Royal Gold'));
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }));
    await waitFor(() => expect(api.mock.calls.some(([p, i]) => p === '/api/admin/products/setup' && i?.method === 'POST')).toBe(true));
    const body = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/products/setup' && i?.method === 'POST')![1].body));
    expect(body.rows.find((r: { frameModelId: string }) => r.frameModelId === 'gold')).toMatchObject({ isActive: false, price: 0, mrp: 0 });
  });

  it('glitter: switch it on, set the extra price; it is saved with the product and a sixth Matte vs Glitter photo is made', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ready-made frame/ }));
    fireEvent.change(screen.getByPlaceholderText('Lord Murugan Photo Frame'), { target: { value: 'Lord Murugan' } });
    fireEvent.change(within(document.getElementById('details')!).getByPlaceholderText('Lord Murugan'), { target: { value: 'Lord Murugan' } });
    fireEvent.change(document.querySelector('#details select')!, { target: { value: 'devotional' } });
    fireEvent.change(document.querySelector('input[type=file]:not([multiple])')!, { target: { files: [new File(['x'], 'murugan.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText('4000 × 6000 pixels');
    fireEvent.click(screen.getByRole('button', { name: '12×8' }));
    fireEvent.change(screen.getByLabelText('MRP 8x12 in Teak Classic'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('Selling price 8x12 in Teak Classic'), { target: { value: '799' } });
    fireEvent.click(screen.getByLabelText(/Offer glitter finish printing/));
    expect((screen.getByLabelText('Extra price per frame') as HTMLInputElement).value).toBe('100');
    fireEvent.change(screen.getByLabelText('Extra price per frame'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate details/ }));
    await waitFor(() => expect(within(document.querySelector('aside')!).getByText('100')).toBeTruthy());
    makeProductPhotos.mockResolvedValue(
      (['framed', 'sizes', 'frame', 'wall', 'picture', 'glitter'] as const).map((key) => ({ key, label: key, alt: `Lord Murugan ${key}`, dataUrl: 'data:image/jpeg;base64,/9j/' }))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(makeProductPhotos).toHaveBeenCalledWith(expect.objectContaining({ glitter: { extraPrice: 15000 } }));
    const body = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/products/setup' && i?.method === 'POST')![1].body));
    expect(body.glitter).toEqual({ enabled: true, extraPrice: 15000 });
    expect(body.gallery).toHaveLength(6);
  });

  it('collage: the shop photos ask for one sample photo per photo space of the chosen design', async () => {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup/options') {
        const o = (await base(path, init)) as Record<string, unknown>;
        return { ...o, collageTemplates: [{ id: 'c1', name: 'Forever & Always', type: 'collage', publishedVersion: 1, latestStatus: 'published' }] };
      }
      if (path === '/api/admin/personalization-templates/c1') {
        return { versions: [{ id: 'c1', version: 1, status: 'published', photoSlots: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}` })) }] };
      }
      return base(path, init);
    });
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Collage frame/ }));
    const pick = (await screen.findByText('Choose a collage design…')).closest('select')!;
    fireEvent.change(pick, { target: { value: 'c1' } });
    expect(await screen.findByText(/Sample photos for the shop pictures \(0 of 6\)/)).toBeTruthy();
    expect(screen.getByText(/This design has 6 photo spaces/)).toBeTruthy();
  });
});
