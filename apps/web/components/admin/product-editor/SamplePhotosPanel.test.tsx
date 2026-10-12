import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock('../template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('./use-catalogue-upload', async (orig) => ({ ...(await orig<typeof import('./use-catalogue-upload')>()), useCatalogueUpload: () => upload }));
vi.mock('../../../lib/auth-context', () => ({ useAuth: () => ({ user: { getIdToken: async () => 'tok' } }) }));
vi.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { SamplePhotosPanel } from './SamplePhotosPanel';

const stock = (id: number) => ({ id, alt: `kid ${id}`, thumb: `https://images.pexels.com/t${id}.jpg`, full: `https://images.pexels.com/f${id}.jpg`, photographer: 'Asha', photographerUrl: 'u', pageUrl: 'p' });

describe('SamplePhotosPanel', () => {
  beforeEach(() => {
    api.mockReset();
    upload.mockReset();
    let n = 0;
    upload.mockImplementation(async () => ({ id: `m${++n}`, url: `/api/media/m${n}/image?w=1600`, width: 1000, height: 1500, alt: '' }));
    global.fetch = vi.fn().mockImplementation(async () => new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 })) as unknown as typeof fetch;
  });

  it('asks for one photo per photo space and says how many are missing', () => {
    render(<SamplePhotosPanel slots={6} photos={['/a?w=1', '/b?w=1']} onChange={vi.fn()} />);
    expect(screen.getByText(/Sample photos for the shop pictures \(2 of 6\)/)).toBeTruthy();
    expect(screen.getByText(/This design has 6 photo spaces/)).toBeTruthy();
    expect(screen.getByText(/The 4 empty spaces repeat the photos you add/)).toBeTruthy();
    expect(screen.getAllByAltText(/Sample photo \d/)).toHaveLength(2);
  });

  it('searches free photos by the owner’s words and fills every empty space from the results', async () => {
    api.mockResolvedValue({ photos: [1, 2, 3, 4, 5].map(stock) });
    const onChange = vi.fn();
    render(<SamplePhotosPanel slots={3} photos={['/a?w=1']} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('What should the photo show?'), { target: { value: 'child' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find free photos' }));
    await screen.findByText(/Free photos from/);
    expect(api).toHaveBeenCalledWith('/api/admin/stock-photos?q=child');
    fireEvent.click(screen.getByRole('button', { name: /Fill 2 spaces with these/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // Only Pexels addresses are fetched, through this site, and each is saved to the media library.
    expect(vi.mocked(global.fetch).mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/admin/stock-photos/file?u=https%3A%2F%2Fimages.pexels.com%2Ff1.jpg',
      '/api/admin/stock-photos/file?u=https%3A%2F%2Fimages.pexels.com%2Ff2.jpg',
    ]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(['/a?w=1', '/api/media/m1/image?w=2000', '/api/media/m2/image?w=2000']);
  });

  it('uploads the owner’s own photos into the empty spaces, never beyond the number of spaces', async () => {
    const onChange = vi.fn();
    const { container } = render(<SamplePhotosPanel slots={2} photos={[]} onChange={onChange} />);
    const files = [1, 2, 3].map((i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }));
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]![0]).toHaveLength(2);
  });

  it('removes a photo', () => {
    const onChange = vi.fn();
    render(<SamplePhotosPanel slots={3} photos={['/a?w=1', '/b?w=1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove sample photo 1' }));
    expect(onChange).toHaveBeenCalledWith(['/b?w=1']);
  });
});
