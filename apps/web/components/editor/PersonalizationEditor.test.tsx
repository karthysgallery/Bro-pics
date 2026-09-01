import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Variant } from '@bro-pics/shared';

let lastEditorCanvasProps: Record<string, unknown> | undefined;
vi.mock('./EditorCanvas', () => ({
  EditorCanvas: (props: Record<string, unknown>) => {
    lastEditorCanvasProps = props;
    return <div data-testid="editor-canvas" />;
  },
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
    lastEditorCanvasProps = undefined;
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
    expect(formData.get('variantId')).toBe('var_1');
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

  it('shows a distinct error (not "too small") when the upload fails for a non-422 reason', async () => {
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
      status: 400,
      json: async () => ({ error: 'Unable to process image' }),
    } as Response);

    render(<PersonalizationEditor variant={variant} photoSlots={1} onComplete={() => {}} onClose={() => {}} />);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'corrupt.jpg', { type: 'image/jpeg' })] } });

    const error = await screen.findByText(/couldn't process this photo/i);
    expect(error).toBeInTheDocument();
    expect(screen.queryByText(/too small/i)).not.toBeInTheDocument();
  });

  it('requires a fresh, per-slot confirmation for each red-tier photo — one slot\'s confirmation does not cover another', async () => {
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
    // Slot 0 upload: tiny photo -> red-tier DPI at this print size.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'up_1',
        sessionId: 's_1',
        originalUrl: '/uploaded-1.jpg',
        widthPx: 300,
        heightPx: 300,
        mime: 'image/jpeg',
        bytes: 12345,
        exifStripped: true,
        status: 'ready',
      }),
    } as Response);

    render(<PersonalizationEditor variant={variant} photoSlots={2} onComplete={() => {}} onClose={() => {}} />);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'small.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    // Red-tier confirmation checkbox appears for slot 0; confirm it.
    const checkbox = await screen.findByRole('checkbox', { name: /use this photo anyway/i });
    fireEvent.click(checkbox);

    // Done still disabled: slot 1 has no photo at all yet.
    const doneButton = screen.getByRole('button', { name: /done/i });
    expect(doneButton).toBeDisabled();

    // Switch to slot 1 and upload another red-tier photo — its own
    // checkbox must be unchecked (slot 0's confirmation must not leak).
    fireEvent.click(screen.getByRole('button', { name: /slot 2/i }));

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'up_2',
        sessionId: 's_1',
        originalUrl: '/uploaded-2.jpg',
        widthPx: 300,
        heightPx: 300,
        mime: 'image/jpeg',
        bytes: 12345,
        exifStripped: true,
        status: 'ready',
      }),
    } as Response);

    const input2 = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input2, { target: { files: [new File(['x'], 'small2.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

    const checkbox2 = await screen.findByRole('checkbox', { name: /use this photo anyway/i });
    expect(checkbox2).not.toBeChecked();
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled();
  });

  describe('zoom and rotate controls (Finding 8)', () => {
    async function renderWithOnePhoto() {
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
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(lastEditorCanvasProps?.rotationDeg).toBeDefined());
    }

    it('renders zoom in/out and rotate controls once a slot has a photo', async () => {
      await renderWithOnePhoto();
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rotate/i })).toBeInTheDocument();
    });

    it('does not render zoom/rotate controls before any photo is uploaded', async () => {
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
      render(<PersonalizationEditor variant={variant} photoSlots={1} onComplete={() => {}} onClose={() => {}} />);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.queryByRole('button', { name: /zoom in/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /rotate/i })).not.toBeInTheDocument();
    });

    it('clicking rotate cycles rotationDeg 0 -> 90 -> 180 -> 270 -> 0 on the active slot', async () => {
      await renderWithOnePhoto();
      const rotateButton = screen.getByRole('button', { name: /rotate/i });

      fireEvent.click(rotateButton);
      await waitFor(() => expect(lastEditorCanvasProps?.rotationDeg).toBe(90));

      fireEvent.click(rotateButton);
      await waitFor(() => expect(lastEditorCanvasProps?.rotationDeg).toBe(180));

      fireEvent.click(rotateButton);
      await waitFor(() => expect(lastEditorCanvasProps?.rotationDeg).toBe(270));

      fireEvent.click(rotateButton);
      await waitFor(() => expect(lastEditorCanvasProps?.rotationDeg).toBe(0));
    });

    it('clicking zoom in increases scale, and zoom out decreases it back down but never below the cover-fit minimum', async () => {
      await renderWithOnePhoto();
      const initialScale = lastEditorCanvasProps?.scale as number;

      const zoomIn = screen.getByRole('button', { name: /zoom in/i });
      fireEvent.click(zoomIn);
      await waitFor(() => expect(lastEditorCanvasProps?.scale as number).toBeGreaterThan(initialScale));

      const zoomOut = screen.getByRole('button', { name: /zoom out/i });
      // Click zoom-out more times than the single zoom-in, to prove the
      // scale clamps at the cover-fit minimum rather than continuing to
      // shrink below it (which would leave gaps in the slot).
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      await waitFor(() => {
        const finalScale = lastEditorCanvasProps?.scale as number;
        expect(finalScale).toBeCloseTo(initialScale, 5);
      });
    });
  });
});
