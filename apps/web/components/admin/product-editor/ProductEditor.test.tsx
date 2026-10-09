import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_FRAMING_COST_RATES, type FrameModel } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock('../template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('./use-catalogue-upload', async (orig) => ({ ...(await orig<typeof import('./use-catalogue-upload')>()), useCatalogueUpload: () => upload }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
// The framed preview draws on a canvas, which jsdom has not got.
vi.mock('./FramedPreview', () => ({ FramedPreview: ({ label }: { label?: string }) => <div data-testid="framed-preview">{label}</div>, lookOf: () => null }));

import { ProductEditor } from './ProductEditor';

const model = (id: string, name: string, priceDelta = 0): FrameModel => ({
  id, name, code: id.toUpperCase(), colour: 'Brown', colourHex: '#5a3825', material: 'Wood', mouldingWidthIn: 1, image: null,
  costPerFoot: 3000, priceDelta, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '',
});

describe('guided product editor', () => {
  beforeEach(() => {
    api.mockReset();
    replace.mockReset();
    upload.mockReset();
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup/options')
        return { categories: [{ id: 'devotional', name: 'Devotional', slug: 'devotional' }], frameModels: [model('teak', 'Teak Classic'), model('gold', 'Royal Gold', 20000)], rates: DEFAULT_FRAMING_COST_RATES, collageTemplates: [] };
      if (path === '/api/admin/products/setup' && init?.method === 'POST') return { productId: 'p_new', warnings: ['Row 2: Margin is under 20%.'] };
      throw new Error(`unexpected ${path}`);
    });
    upload.mockResolvedValue({ id: 'art1', url: '/api/media/art1/image?w=1600', width: 4000, height: 6000, alt: '' });
  });

  it('builds a ready-made frame end to end: type, name, generated details, artwork, two frame models, priced sizes, then publishes', async () => {
    render(<ProductEditor productId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ready-made frame/ }));
    fireEvent.change(screen.getByPlaceholderText('Lord Murugan Photo Frame'), { target: { value: 'Lord Murugan' } });
    fireEvent.change(within(document.getElementById('details')!).getByPlaceholderText('Lord Murugan'), { target: { value: 'Lord Murugan' } });

    // Artwork
    const file = new File(['x'], 'murugan.jpg', { type: 'image/jpeg' });
    fireEvent.change(document.querySelector('input[type=file]:not([multiple])')!, { target: { files: [file] } });
    await screen.findByText('4000 × 6000 pixels');

    // Teak is pre-selected as the default; add Royal Gold.
    fireEvent.click(screen.getByRole('button', { name: /Royal Gold/ }));
    // Two sizes → 2 sizes × 2 frames = 4 price lines.
    fireEvent.click(screen.getByRole('button', { name: '8×12' }));
    fireEvent.click(screen.getByRole('button', { name: '12×18' }));
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
    fireEvent.click(screen.getByRole('button', { name: '8×10' }));
    fireEvent.change(screen.getByLabelText('MRP 8x10 in Teak Classic'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Selling price 8x10 in Teak Classic'), { target: { value: '600' } });
    expect(screen.getByText('Selling price is more than the MRP.')).toBeTruthy();
  });
});
