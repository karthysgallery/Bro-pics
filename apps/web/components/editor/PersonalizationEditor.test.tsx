import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Variant } from '@bro-pics/shared';

vi.mock('./EditorCanvas', () => ({
  EditorCanvas: () => <div data-testid="editor-canvas" />,
}));

global.fetch = vi.fn();

import { PersonalizationEditor } from './PersonalizationEditor';

const variant: Variant = {
  id: 'var_1',
  productId: 'prod_1',
  sku: 'SKU-1',
  sizeLabel: '8x10',
  widthIn: 8,
  heightIn: 10,
  frameColour: 'black',
  material: 'wood',
  price: 4999,
  stockStatus: 'in_stock',
  printWidthPx: 2400,
  printHeightPx: 3000,
  minUploadPx: 1200,
  aspectRatio: 0.8,
  isActive: true,
};

describe('PersonalizationEditor', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    localStorage.clear();
  });

  it('disables the Done button until every slot has a photo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'ft_1',
          variantId: 'var_1',
          mockupUrl: '/mockup.png',
          maskUrl: null,
          overlayUrl: null,
          printableRects: [
            { slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            { slotIndex: 1, x: 0.55, y: 0.1, width: 0.4, height: 0.4 },
          ],
          bleedMm: 2,
          matInset: 0,
        },
      ],
    } as Response);

    render(<PersonalizationEditor variant={variant} photoSlots={2} onComplete={() => {}} onClose={() => {}} />);

    const doneButton = await screen.findByRole('button', { name: /done/i });
    expect(doneButton).toBeDisabled();
  });

  it('uploads a photo via /api/uploads and enables Done once the slot is filled with a good-quality photo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'ft_1',
          variantId: 'var_1',
          mockupUrl: '/mockup.png',
          maskUrl: null,
          overlayUrl: null,
          printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 }],
          bleedMm: 2,
          matInset: 0,
        },
      ],
    } as Response);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'up_1',
        sessionId: 's_1',
        originalUrl: '/uploaded.jpg',
        widthPx: 2400,
        heightPx: 3000,
        mime: 'image/jpeg',
        bytes: 12345,
        exifStripped: true,
        status: 'ready',
      }),
    } as Response);

    render(<PersonalizationEditor variant={variant} photoSlots={1} onComplete={() => {}} onClose={() => {}} />);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    const [uploadUrl, uploadInit] = vi.mocked(fetch).mock.calls[1];
    expect(uploadUrl).toBe('/api/uploads');
    expect((uploadInit?.headers as Record<string, string>)['X-Session-Id']).toBeTruthy();
    const formData = uploadInit?.body as FormData;
    expect(formData.get('minUploadPx')).toBe('1200');
    expect(formData.get('file')).toBe(file);

    const doneButton = await screen.findByRole('button', { name: /done/i });
    await waitFor(() => expect(doneButton).toBeEnabled());
  });

  it('shows an error and leaves the slot empty when the upload is rejected as too low-resolution', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'ft_1',
          variantId: 'var_1',
          mockupUrl: '/mockup.png',
          maskUrl: null,
          overlayUrl: null,
          printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 }],
          bleedMm: 2,
          matInset: 0,
        },
      ],
    } as Response);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        id: 'up_2',
        sessionId: 's_1',
        originalUrl: 'rejected://not-uploaded',
        widthPx: 200,
        heightPx: 200,
        mime: 'image/jpeg',
        bytes: 100,
        exifStripped: true,
        status: 'rejected',
      }),
    } as Response);

    render(<PersonalizationEditor variant={variant} photoSlots={1} onComplete={() => {}} onClose={() => {}} />);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'small.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByText(/too small/i)).toBeInTheDocument();
    const doneButton = screen.getByRole('button', { name: /done/i });
    expect(doneButton).toBeDisabled();
  });
});
