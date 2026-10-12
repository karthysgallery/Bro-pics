import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_FRAMING_COST_RATES, type FrameModel, type PriceList } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const readPicture = vi.hoisted(() => vi.fn());
const makeProductPhotos = vi.hoisted(() => vi.fn());
vi.mock('../../template-builder/use-admin-api', async (orig) => ({ ...(await orig<typeof import('../../template-builder/use-admin-api')>()), useAdminApi: () => api }));
vi.mock('../use-catalogue-upload', async (orig) => ({ ...(await orig<typeof import('../use-catalogue-upload')>()), useCatalogueUpload: () => upload }));
vi.mock('../product-photos', () => ({ makeProductPhotos }));
vi.mock('../FramedPreview', () => ({ lookOf: () => null }));
vi.mock('./bulk-picture', () => ({ readPicture }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { BulkAdd } from './BulkAdd';

const teak: FrameModel = { id: 'teak', name: 'Teak Classic', code: 'TK', colour: 'Brown', colourHex: '#5a3825', material: 'Wood', mouldingWidthIn: 1, image: null, costPerFoot: 3000, priceDelta: 0, isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' };
const list: PriceList = {
  id: 'devotional', name: 'Devotional frames', createdAt: '', updatedAt: '',
  rows: [
    { longIn: 12, shortIn: 8, frameModelId: 'teak', mrp: 99900, price: 79900, isActive: true },
    { longIn: 24, shortIn: 16, frameModelId: 'teak', mrp: 299900, price: 249900, isActive: true },
  ],
};
const pic = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

let created: Array<Record<string, unknown>>;
beforeEach(() => {
  created = [];
  api.mockReset();
  upload.mockReset();
  readPicture.mockReset();
  makeProductPhotos.mockReset();
  readPicture.mockImplementation(async (f: File) => (f.name.startsWith('small') ? { width: 1200, height: 1800, thumb: 'data:,' } : { width: 4000, height: 6000, thumb: 'data:,' }));
  let n = 0;
  upload.mockImplementation(async (f: File) => (f.name.startsWith('small') ? { id: `a${++n}`, url: `/u${n}?w=1600`, width: 1200, height: 1800, alt: '' } : { id: `a${++n}`, url: `/u${n}?w=1600`, width: 4000, height: 6000, alt: '' }));
  makeProductPhotos.mockResolvedValue([]);
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/admin/products/setup/options') return { categories: [{ id: 'cat_frames', name: 'Frames', slug: 'frames' }], frameModels: [teak], rates: DEFAULT_FRAMING_COST_RATES };
    if (path === '/api/admin/price-lists') return { priceLists: [list] };
    if (path === '/api/admin/products') return { products: [] };
    if (path === '/api/admin/products/setup') {
      const body = JSON.parse(String(init?.body));
      created.push(body);
      return { productId: `p${created.length}`, warnings: [] };
    }
    if (path.startsWith('/api/admin/products/p') && init?.method === 'PATCH') return { product: {} };
    throw new Error(`unexpected ${path}`);
  });
});

async function setup() {
  const view = render(<BulkAdd />);
  await screen.findByText('Add many frames');
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cat_frames' } });
  fireEvent.change(screen.getByLabelText(/Price list/), { target: { value: 'devotional' } });
  fireEvent.click(screen.getByLabelText(/Make the shop photos/)); // off: this test is about the batch, not the photos
  return view;
}
async function addFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Choose pictures'), { target: { files } });
  await screen.findByLabelText(`Name for ${files[0]!.name}`);
}

describe('BulkAdd', () => {
  it('names pictures from their files, asks for a name when the file name says nothing, and blocks Create until every picture has one', async () => {
    await setup();
    await addFiles([pic('lord_murugan.jpg'), pic('IMG_2041.jpg')]);
    expect((screen.getByLabelText('Name for lord_murugan.jpg') as HTMLInputElement).value).toBe('Lord Murugan');
    expect((screen.getByLabelText('Name for IMG_2041.jpg') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: /Create 2 drafts/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name for IMG_2041.jpg'), { target: { value: 'Rajinikanth' } });
    expect((screen.getByRole('button', { name: /Create 2 drafts/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('warns about a soft picture and says which sizes it leaves out', async () => {
    await setup();
    await addFiles([pic('small_ganesha.jpg')]);
    // 1200×1800 prints 150 ppi at 12×8 (good) but only 75 ppi at 16×24 (the picture is portrait).
    expect(screen.getByText(/Leaves out 16x24 \(too soft\)/)).toBeTruthy();
    expect(screen.getByText(/ppi/)).toBeTruthy();
  });

  it('makes every picture as a draft, one by one, with the price list’s sizes, then publishes the selected drafts', async () => {
    await setup();
    await addFiles([pic('lord_murugan.jpg'), pic('ganesha.jpg'), pic('murugan.jpg')]);
    fireEvent.click(screen.getByRole('button', { name: /Create 3 drafts/ }));
    await waitFor(() => expect(screen.getAllByText('Draft saved')).toHaveLength(3), { timeout: 5000 });
    expect(created).toHaveLength(3);
    expect(created.every((b) => b.status === 'draft' && b.categoryId === 'cat_frames' && b.productType === 'ready_made')).toBe(true);
    // Different names → different web addresses.
    expect(new Set(created.map((b) => b.slug)).size).toBe(3);
    // Portrait pictures: the list's 12×8 hangs as 8 wide × 12 high.
    expect((created[0]!.rows as Array<{ widthIn: number; heightIn: number }>)[0]).toMatchObject({ widthIn: 8, heightIn: 12 });

    // Untick one, publish the rest.
    fireEvent.click(screen.getByLabelText(/Select Ganesha/));
    fireEvent.click(screen.getByRole('button', { name: /Publish selected \(2\)/ }));
    await waitFor(() => expect(screen.getAllByText('Published')).toHaveLength(2));
    const patches = api.mock.calls.filter(([p, i]) => String(p).startsWith('/api/admin/products/p') && i?.method === 'PATCH');
    expect(patches.map(([p]) => p)).toEqual(['/api/admin/products/p1', '/api/admin/products/p3']);
    expect(patches.every(([, i]) => JSON.parse(String(i.body)).status === 'published')).toBe(true);
  });

  it('numbers a repeated name and keeps going when one picture fails; a retry makes only the failed one', async () => {
    let failOnce = true;
    const original = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/products/setup') {
        const body = JSON.parse(String(init?.body));
        if (body.title.startsWith('Ganesha') && failOnce) {
          failOnce = false;
          throw new Error('The product could not be saved.');
        }
      }
      return original(path, init);
    });
    await setup();
    await addFiles([pic('murugan.jpg'), pic('ganesha.jpg'), pic('Murugan (1).jpg')]);
    fireEvent.click(screen.getByRole('button', { name: /Create 3 drafts/ }));
    await waitFor(() => expect(screen.getAllByText('Draft saved')).toHaveLength(2), { timeout: 5000 });
    expect(screen.getAllByText('Failed')).toHaveLength(1);
    expect(screen.getByText('The product could not be saved.')).toBeTruthy();
    expect((screen.getByLabelText('Name for Murugan (1).jpg') as HTMLInputElement).value).toBe('Murugan 2');

    const before = created.length;
    fireEvent.click(screen.getByRole('button', { name: /Retry failed \(1\)/ }));
    await waitFor(() => expect(screen.getAllByText('Draft saved')).toHaveLength(3), { timeout: 5000 });
    expect(created.length).toBe(before + 1); // only the failed one was made again
    // The picture was uploaded once, not again on the retry.
    expect(upload.mock.calls.filter(([f]) => (f as File).name === 'ganesha.jpg')).toHaveLength(1);
  });

  it('keeps Create off until a category and a price list are chosen', async () => {
    render(<BulkAdd />);
    await screen.findByText('Add many frames');
    await addFiles([pic('murugan.jpg')]);
    expect((screen.getByRole('button', { name: /Create 1 draft/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByLabelText('Pictures in this batch')).getByText('Ready')).toBeTruthy();
  });
});
