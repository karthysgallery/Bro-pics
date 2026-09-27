import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Product, Variant, ProductMedia, FrameTemplate } from '@bro-pics/shared';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import { ToastProvider } from '../ui/Toast';
import { saveDraft, loadDraft, clearDraft } from '../../lib/personalization-draft';

// The inline editor now lives inside ProductDetailClient (canvas + upload +
// text/clipart controls), with BuyBox's Add-to-Cart button reading the same
// lifted state — this file covers that end-to-end flow, replacing the old
// PersonalizationEditor.test.tsx which tested the same logic back when it
// lived self-contained inside a modal.

let lastEditorCanvasProps: Record<string, unknown> | undefined;
// Toggled by individual tests (via withheldPreviewFrame()) to simulate the
// real EditorCanvas's null-preview window — e.g. the async first draw not
// having completed yet, or toDataURL() throwing on a canvas-taint
// SecurityError — where onCanvasUpdate is never called with a real string.
// Reset in beforeEach so it never leaks into other tests, which all rely on
// the default (a real preview frame reported synchronously on mount).
let withholdPreviewFrame = false;
vi.mock('../editor/EditorCanvas', () => ({
  EditorCanvas: (props: Record<string, unknown>) => {
    lastEditorCanvasProps = props;
    // Simulates the real canvas reporting a rendered frame back to the
    // parent, the same way the actual EditorCanvas calls onCanvasUpdate
    // after every draw — needed so tests can exercise the Preview button's
    // lightbox, which reads previewDataUrl from that same callback.
    useEffect(() => {
      if (withholdPreviewFrame) return;
      (props.onCanvasUpdate as ((url: string) => void) | undefined)?.('data:image/png;base64,mockPreview');
    }, [props.onCanvasUpdate]);
    return <div data-testid="editor-canvas" />;
  },
}));

global.fetch = vi.fn();

// This environment's jsdom/Node localStorage interop is unreliable (a
// pre-existing, unrelated quirk — see lib/session-id.test.ts and
// lib/cart-context.test.tsx, both already in the same known-failing bucket
// before this file existed). getOrCreateSessionId only needs to return a
// stable string for these tests; mocking it sidesteps the broken global
// rather than working around it inline at every call site.
vi.mock('../../lib/session-id', () => ({
  getOrCreateSessionId: () => 'sess_test',
  resetSessionId: () => {},
  SESSION_ID_STORAGE_KEY: 'bropics_session_id',
}));

const Providers = CartProvider;

function makeTemplate(overrides: Partial<FrameTemplate> = {}): FrameTemplate {
  return {
    id: 'ft_1',
    variantId: 'var_1',
    mockupUrl: '/mockup.png',
    maskUrl: null,
    overlayUrl: null,
    printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 }],
    bleedMm: 2,
    matInset: 0,
    version: 1,
    isCurrent: true,
    textZones: [],
    clipartOptions: [],
    ...overrides,
  };
}

// Templates are now a server-fetched prop (initialTemplatesByVariant), not a
// client-side fetch — this builds that prop from a flat list, keyed by each
// template's own variantId, mirroring getFrameTemplatesByProductId's shape.
function templatesByVariantProp(templates: FrameTemplate[]): Record<string, FrameTemplate> {
  return Object.fromEntries(templates.map((t) => [t.variantId, t]));
}

function mockUploadFetch(overrides: Partial<Record<string, unknown>> = {}) {
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
      ...overrides,
    }),
  } as Response);
}

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

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1', title: 'Test Frame', slug: 'test-frame', categoryId: 'cat_1',
    shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '',
    basePrice: 4999, isActive: true, isFeatured: false, badges: [], dispatchDaysMin: 3, dispatchDaysMax: 5,
    photoSlots: 1, allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
    availableSizes: ['8x10'], availableColours: ['black'], availableMaterials: ['wood'],
    minPrice: 4999, maxPrice: 4999, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
    titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '/generic.svg', hoverImageUrl: null,
    ...overrides,
  } satisfies Product;
}

const media: ProductMedia[] = [
  { id: 'm_generic', productId: 'prod_1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0 },
];

function renderProduct(product: Product, variants: Variant[] = [variant], templates: FrameTemplate[] = []) {
  return render(
    <Providers>
      <ProductDetailClient
        product={product}
        variants={variants}
        media={media}
        initialTemplatesByVariant={templatesByVariantProp(templates)}
      />
    </Providers>
  );
}

describe('ProductDetailClient — inline personalization', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    // Not localStorage.clear() — this environment's jsdom/Node localStorage
    // interop doesn't reliably expose .clear() (a pre-existing, unrelated
    // quirk also hit by lib/session-id.test.ts and others). None of these
    // tests depend on a clean slate across runs (each uses distinct upload
    // URLs/session state), so this is safely omitted rather than worked
    // around.
    lastEditorCanvasProps = undefined;
    withholdPreviewFrame = false;
  });

  it('disables Add to Cart until every slot has a photo', async () => {
    renderProduct(
      makeProduct({ photoSlots: 2 }),
      [variant],
      [
        makeTemplate({
          printableRects: [
            { slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            { slotIndex: 1, x: 0.55, y: 0.1, width: 0.4, height: 0.4 },
          ],
        }),
      ]
    );

    const addButton = await screen.findByRole('button', { name: /add to cart/i });
    expect(addButton).toBeDisabled();
  });

  it('uploads a photo via /api/uploads and enables Add to Cart once the slot is filled with a good-quality photo', async () => {
    mockUploadFetch();

    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const [uploadUrl, uploadInit] = vi.mocked(fetch).mock.calls[0];
    expect(uploadUrl).toBe('/api/uploads');
    expect((uploadInit?.headers as Record<string, string>)['X-Session-Id']).toBeTruthy();
    const formData = uploadInit?.body as FormData;
    expect(formData.get('variantId')).toBe('var_1');
    expect(formData.get('file')).toBe(file);

    const addButton = await screen.findByRole('button', { name: /add to cart/i });
    await waitFor(() => expect(addButton).toBeEnabled());
  });

  it('[FE-10] replacing a photo in a filled slot keeps the same slot, refits the transform, and recomputes DPI for the new photo', async () => {
    mockUploadFetch({ id: 'up_1', widthPx: 2400, heightPx: 3000 });
    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'first.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const slotByIndex0 = () =>
      (lastEditorCanvasProps?.slots as Array<{ slotIndex: number; scale: number; photoUrl: string }>).find((s) => s.slotIndex === 0)!;
    await waitFor(() => expect(slotByIndex0()).toBeDefined());
    const firstScale = slotByIndex0().scale;
    // This file's `variant` fixture already puts a 2400x3000 upload into
    // the "lower quality print" (amber) tier — see the "good-quality
    // photo" test above, which enables Add to Cart at this same DPI.
    expect(screen.getByText(/lower quality print/i)).toBeInTheDocument();
    expect(screen.queryByText(/too low resolution/i)).not.toBeInTheDocument();

    // A much smaller, lower-resolution replacement into the SAME slot — a
    // cover-fit refit needs a different scale (the photo's own pixel
    // dimensions changed), and the DPI badge must drop a further tier to
    // "too low resolution" (red), not silently keep the first photo's
    // amber badge.
    mockUploadFetch({ id: 'up_2', originalUrl: '/replaced.jpg', widthPx: 600, heightPx: 750 });
    const replaceInput = (await screen.findByLabelText(/replace a photo/i)) as HTMLInputElement;
    fireEvent.change(replaceInput, { target: { files: [new File(['y'], 'second.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      const slots = lastEditorCanvasProps?.slots as Array<{ slotIndex: number; photoUrl: string }>;
      expect(slots).toHaveLength(1);
      expect(slots[0].slotIndex).toBe(0); // same slot, not a second one
      expect(slots[0].photoUrl).toBe('/replaced.jpg');
    });
    expect(slotByIndex0().scale).not.toBeCloseTo(firstScale, 5);
    await waitFor(() => expect(screen.getByText(/too low resolution/i)).toBeInTheDocument());
  });

  it('shows an error and leaves the slot empty when the upload fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'bad' }) } as Response);

    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'corrupt.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByText(/couldn't process this photo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();
  });

  it('[FE-06] maps a specific server error code to a specific message, and offers a "Try again" retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 408,
      json: async () => ({ error: 'timed out', code: 'decode_timeout' }),
    } as Response);

    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'slow.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByText(/took too long to process/i)).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('[FE-05] accepts an explicit .heic/.heif file extension, not just image/* MIME types', async () => {
    const input = (await (async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      return screen.findByLabelText(/upload a photo/i);
    })()) as HTMLInputElement;
    expect(input.accept).toContain('.heic');
    expect(input.accept).toContain('.heif');
  });

  it('a low-resolution photo is still accepted — quality is surfaced later via the DPI badge, not an upload-time rejection', async () => {
    mockUploadFetch({ originalUrl: '/tiny-photo.jpg', widthPx: 300, heightPx: 300 });

    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'small.jpg', { type: 'image/jpeg' })] } });

    expect(screen.queryByText(/too small/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/too low resolution|lower quality print|good quality print/i)).toBeInTheDocument());
  });

  it('rejects a file over 25MB before making any network request', async () => {
    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    const bigFile = new File([new Uint8Array(1)], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 26 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a fresh, per-slot confirmation for each red-tier photo — one slot's confirmation does not cover another", async () => {
    mockUploadFetch({ originalUrl: '/uploaded-1.jpg', widthPx: 300, heightPx: 300 });

    renderProduct(
      makeProduct({ photoSlots: 2 }),
      [variant],
      [
        makeTemplate({
          printableRects: [
            { slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            { slotIndex: 1, x: 0.55, y: 0.1, width: 0.4, height: 0.4 },
          ],
        }),
      ]
    );

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'small.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const checkbox = await screen.findByRole('checkbox', { name: /use this photo anyway/i });
    fireEvent.click(checkbox);

    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /slot 2/i }));
    mockUploadFetch({ originalUrl: '/uploaded-2.jpg', widthPx: 300, heightPx: 300 });

    const input2 = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input2, { target: { files: [new File(['x'], 'small2.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    const checkbox2 = await screen.findByRole('checkbox', { name: /use this photo anyway/i });
    expect(checkbox2).not.toBeChecked();
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();
  });

  describe('zoom and rotate controls', () => {
    async function renderWithOnePhoto(
      productOverrides: Partial<Product> = {},
      variantOverride = variant,
      uploadOverrides: Partial<Record<string, unknown>> = {}
    ) {
      mockUploadFetch(uploadOverrides);
      renderProduct(makeProduct(productOverrides), [variantOverride], [makeTemplate({ variantId: variantOverride.id })]);
      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect((lastEditorCanvasProps?.slots as unknown[])?.length).toBeGreaterThan(0));
    }

    function activeSlot() {
      const slots = lastEditorCanvasProps?.slots as Array<{ slotIndex: number; rotationDeg: number; scale: number }>;
      const activeIndex = lastEditorCanvasProps?.activeSlotIndex as number;
      return slots.find((s) => s.slotIndex === activeIndex)!;
    }

    it('renders zoom slider and rotate/reset controls once a slot has a photo', async () => {
      await renderWithOnePhoto();
      expect(screen.getByRole('slider', { name: /zoom/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rotate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset position/i })).toBeInTheDocument();
    });

    it('does not render zoom/rotate controls before any photo is uploaded', async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.queryByRole('slider', { name: /zoom/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /rotate/i })).not.toBeInTheDocument();
    });

    it('clicking rotate cycles rotationDeg 0 -> 90 -> 180 -> 270 -> 0 on the active slot', async () => {
      await renderWithOnePhoto();
      const rotateButton = screen.getByRole('button', { name: /rotate/i });

      fireEvent.click(rotateButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));
      fireEvent.click(rotateButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(180));
      fireEvent.click(rotateButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(270));
      fireEvent.click(rotateButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(0));
    });

    it('[FE-09] Undo reverts the last settled change (a rotate) and Redo brings it back', async () => {
      await renderWithOnePhoto();
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
      // Let the post-upload state settle into its own history entry BEFORE
      // rotating — two actions inside the same 400ms debounce window
      // collapse into one entry by design (see the history-watcher's own
      // comment in ProductDetailClient.tsx), so back-to-back fireEvents
      // with no real gap would otherwise leave only one entry to undo to.
      await new Promise((resolve) => setTimeout(resolve, 500));

      fireEvent.click(screen.getByRole('button', { name: /rotate/i }));
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));
      // The history watcher debounces 400ms after the change settles —
      // this is a real timer, not a mocked one, since fake timers would
      // also have to fake every findBy/waitFor call this file already
      // relies on throughout.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const undoButton = await screen.findByRole('button', { name: 'Undo' });
      expect(undoButton).toBeEnabled();
      fireEvent.click(undoButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(0));

      const redoButton = screen.getByRole('button', { name: 'Redo' });
      expect(redoButton).toBeEnabled();
      fireEvent.click(redoButton);
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));
    });

    it('[FE-09] Ctrl+Z undoes and Ctrl+Shift+Z redoes', async () => {
      await renderWithOnePhoto();
      await new Promise((resolve) => setTimeout(resolve, 500));

      fireEvent.click(screen.getByRole('button', { name: /rotate/i }));
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));
      await new Promise((resolve) => setTimeout(resolve, 500));

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(0));

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));
    });

    it('reset restores the cover-fit centered transform and clears any rotation', async () => {
      await renderWithOnePhoto();
      fireEvent.click(screen.getByRole('button', { name: /rotate/i }));
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));

      fireEvent.click(screen.getByRole('button', { name: /reset position/i }));
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(0));
    });

    it('zoom slider increases scale, and zoom-out button decreases it back down but never below the cover-fit minimum', async () => {
      await renderWithOnePhoto();
      const initialScale = activeSlot().scale;

      const slider = screen.getByRole('slider', { name: /zoom/i });
      fireEvent.change(slider, { target: { value: String(initialScale * 2) } });
      await waitFor(() => expect(activeSlot().scale).toBeGreaterThan(initialScale));

      const zoomOut = screen.getByRole('button', { name: /zoom out/i });
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      fireEvent.click(zoomOut);
      await waitFor(() => expect(activeSlot().scale).toBeCloseTo(initialScale, 5));
    });

    it('recomputes the DPI badge/tier as the customer zooms', async () => {
      await renderWithOnePhoto();
      expect(screen.queryByRole('checkbox', { name: /use this photo anyway/i })).not.toBeInTheDocument();
      expect(screen.getByText(/lower quality print/i)).toBeInTheDocument();

      const slider = screen.getByRole('slider', { name: /zoom/i });
      const zoomBounds = lastEditorCanvasProps; // not directly exposed; drive via slider max
      fireEvent.change(slider, { target: { value: '999' } }); // clamped internally to max

      await waitFor(() => {
        expect(screen.getByText(/too low resolution/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('checkbox', { name: /use this photo anyway/i })).toBeInTheDocument();
      expect(zoomBounds).toBeDefined();
    });

    it('recomputes the DPI tier with the rotation-aware axis swap after a 90-degree rotate', async () => {
      // A landscape 3000x2000 upload against a 10x8in variant: at cover-fit
      // scale the crop is a centered 2000x2000 square regardless of
      // rotation (the canvas slot itself is square), isolating exactly one
      // variable — whether widthIn/heightIn get axis-swapped for rotation.
      // Unswapped (0deg): effectiveDpi ≈ 166.67 (amber). Swapped (90deg):
      // effectiveDpi ≈ 133.33 (red) — crossing the 150 DPI tier boundary.
      const dpiVariant: Variant = { ...variant, widthIn: 10, heightIn: 8 };
      await renderWithOnePhoto({}, dpiVariant, { widthPx: 3000, heightPx: 2000 });

      expect(screen.getByText(/lower quality print/i)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /use this photo anyway/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /rotate/i }));
      await waitFor(() => expect(activeSlot().rotationDeg).toBe(90));

      await waitFor(() => {
        expect(screen.getByText(/too low resolution/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('checkbox', { name: /use this photo anyway/i })).toBeInTheDocument();
    });
  });

  describe('text personalization', () => {
    it('does not render text fields when the product does not allow text personalization', async () => {
      renderProduct(makeProduct({ allowsTextPersonalization: false }), [variant], [makeTemplate()]);
      await screen.findByRole('button', { name: /add to cart/i });
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    });

    it('renders per-template text zones with font/colour pickers, and enabled Add to Cart even with empty text', async () => {
      mockUploadFetch();

      renderProduct(
        makeProduct({ allowsTextPersonalization: true }),
        [variant],
        [
          makeTemplate({
            textZones: [
              { fieldKey: 'name', label: 'Name', x: 0.08, y: 0.84, width: 0.84, height: 0.065, maxLength: 40, align: 'center' },
            ],
          }),
        ]
      );

      const nameInput = (await screen.findByLabelText('Name')) as HTMLInputElement;
      expect(nameInput).toBeInTheDocument();
      expect(screen.getByRole('group', { name: /name font/i })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: /name colour/i })).toBeInTheDocument();

      const input = screen.getByLabelText(/upload a photo/i) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(screen.getByRole('button', { name: /add to cart/i })).not.toBeDisabled());
    });
  });

  it('submits every filled slot to /api/customizations with templateVersion, then adds one cart line', async () => {
    mockUploadFetch();
    // The EditorCanvas mock now reports a rendered frame on mount (see the
    // shared mock above), so previewDataUrl is populated by the time
    // Add to Cart is clicked — just like the real canvas — and
    // handleAddToCart uploads that shared preview via /api/uploads/preview
    // before posting each slot to /api/customizations.
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ previewPath: 'uploads/sess/previews/p1/slot-0.png' }) } as Response); // /api/uploads/preview
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // /api/customizations

    renderProduct(makeProduct(), [variant], [makeTemplate({ version: 3 })]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });

    const addButton = await screen.findByRole('button', { name: /add to cart/i });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const [url, init] = vi.mocked(fetch).mock.calls[2];
    expect(url).toBe('/api/customizations');
    const body = JSON.parse((init?.body as string) ?? '{}');
    expect(body.templateVersion).toBe(3);
    expect(body.variantId).toBe('var_1');
  });

  it('[FE-14] a failed Add to Cart submission never loses the uploaded photo/slot state — the customer can just retry', async () => {
    mockUploadFetch();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')); // /api/uploads/preview

    renderProduct(makeProduct(), [variant], [makeTemplate()]);
    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });

    const addButton = await screen.findByRole('button', { name: /add to cart/i });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    expect(await screen.findByText(/couldn't save your personalization/i)).toBeInTheDocument();
    // The slot still shows a photo (not reset to the empty "Upload a
    // photo" state) and Add to Cart is enabled again for a retry.
    expect(screen.getByLabelText(/replace a photo/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /add to cart/i })).toBeEnabled();
    expect((lastEditorCanvasProps?.slots as unknown[]).length).toBeGreaterThan(0);
  });

  describe('[FE-11] draft autosave/restore', () => {
    // Every test here that calls saveDraft under prod_1/var_1 overwrites
    // its own fixture at start, but a test that only ever CHECKS for the
    // banner (never restores or discards) would otherwise leave that
    // draft in localStorage for whichever unrelated test in this file
    // renders prod_1/var_1 next — this file's other ~25 tests all use
    // exactly that product/variant and don't expect a banner.
    afterEach(() => clearDraft('prod_1', 'var_1'));

    it('shows a restore banner on mount when a saved draft exists for the default product/variant', async () => {
      saveDraft('prod_1', 'var_1', {
        activeSlotIndex: 0,
        selectedClipartId: null,
        slots: [{ slotIndex: 0, uploadId: 'up_saved', scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, confirmedLowDpi: false }],
        textFields: [],
      });

      renderProduct(makeProduct(), [variant], [makeTemplate()]);

      expect(await screen.findByText(/continue where you left off/i)).toBeInTheDocument();
    });

    it('does not show a restore banner when no draft was ever saved', async () => {
      renderProduct(makeProduct({ id: 'prod_never_saved' }), [{ ...variant, productId: 'prod_never_saved' }], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.queryByText(/continue where you left off/i)).not.toBeInTheDocument();
    });

    it('"Start fresh" dismisses the banner and clears the saved draft', async () => {
      saveDraft('prod_1', 'var_1', {
        activeSlotIndex: 0,
        selectedClipartId: null,
        slots: [{ slotIndex: 0, uploadId: 'up_saved', scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, confirmedLowDpi: false }],
        textFields: [],
      });
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      fireEvent.click(await screen.findByText('Start fresh'));

      await waitFor(() => expect(screen.queryByText(/continue where you left off/i)).not.toBeInTheDocument());
      expect(loadDraft('prod_1', 'var_1')).toBeNull();
    });

    it('"Restore my design" re-fetches each upload by id and rebuilds the slot with a fresh preview URL', async () => {
      saveDraft('prod_1', 'var_1', {
        activeSlotIndex: 0,
        selectedClipartId: null,
        slots: [{ slotIndex: 0, uploadId: 'up_saved', scale: 1.5, offsetX: 3, offsetY: -2, rotationDeg: 90, confirmedLowDpi: true }],
        textFields: [],
      });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'up_saved', status: 'ready', widthPx: 2400, heightPx: 3000, previewUrl: '/restored-fresh-url.jpg' }),
      } as Response);

      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      fireEvent.click(await screen.findByText('Restore my design'));

      await waitFor(() => {
        const slots = lastEditorCanvasProps?.slots as Array<{ slotIndex: number; photoUrl: string; scale: number; rotationDeg: number }>;
        expect(slots).toHaveLength(1);
        expect(slots[0].photoUrl).toBe('/restored-fresh-url.jpg');
        expect(slots[0].scale).toBe(1.5);
        expect(slots[0].rotationDeg).toBe(90);
      });
      const [restoreUrl, restoreInit] = vi.mocked(fetch).mock.calls[0];
      expect(restoreUrl).toBe('/api/uploads/up_saved');
      expect((restoreInit?.headers as Record<string, string>)['X-Session-Id']).toBeTruthy();
      expect(screen.queryByText(/continue where you left off/i)).not.toBeInTheDocument();
    });

    it('shows an error and clears the stale draft when the saved upload has expired/is gone', async () => {
      saveDraft('prod_1', 'var_1', {
        activeSlotIndex: 0,
        selectedClipartId: null,
        slots: [{ slotIndex: 0, uploadId: 'up_gone', scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, confirmedLowDpi: false }],
        textFields: [],
      });
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as Response);

      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      fireEvent.click(await screen.findByText('Restore my design'));

      expect(await screen.findByText(/couldn't restore your saved design/i)).toBeInTheDocument();
      expect(loadDraft('prod_1', 'var_1')).toBeNull();
    });
  });

  describe('[FE-13] variant switching refits the transform and warns on a DPI regression', () => {
    // Deliberately extreme, aspect-matched print sizes (both exactly the
    // upload's own 0.8 aspect ratio, so cover-fit never crops and the DPI
    // math reduces to a plain widthPx/printWidthIn division) — this
    // removes any ambiguity about which tier either variant actually
    // lands in, rather than relying on a hand-derived DPI for the
    // shared `variant` fixture's specific 8x10in size.
    const tinyPrintVariant: Variant = { ...variant, id: 'var_tiny', frameColour: 'black', widthIn: 1, heightIn: 1.25 };
    const hugePrintVariant: Variant = { ...variant, id: 'var_huge', frameColour: 'white', widthIn: 100, heightIn: 125 };

    it('refits the transform and shows a toast when switching variant makes the DPI tier worse', async () => {
      mockUploadFetch({ widthPx: 2400, heightPx: 3000 });
      render(
        <CartProvider>
          <ToastProvider>
            <ProductDetailClient
              product={makeProduct()}
              variants={[tinyPrintVariant, hugePrintVariant]}
              media={media}
              initialTemplatesByVariant={templatesByVariantProp([
                makeTemplate({ variantId: 'var_tiny' }),
                makeTemplate({ id: 'ft_2', variantId: 'var_huge' }),
              ])}
            />
          </ToastProvider>
        </CartProvider>
      );

      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByText(/lower quality print|too low resolution/i)).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'white' }));

      await waitFor(() => expect(screen.getByText('Too low resolution for a sharp print')).toBeInTheDocument());
      expect(await screen.findByText(/photo quality for slot 1 is lower on this size\/colour/i)).toBeInTheDocument();
    });

    it('does not show a warning when the switch does not make the DPI tier worse', async () => {
      mockUploadFetch({ widthPx: 2400, heightPx: 3000 });
      render(
        <CartProvider>
          <ToastProvider>
            <ProductDetailClient
              product={makeProduct()}
              variants={[tinyPrintVariant, { ...tinyPrintVariant, id: 'var_tiny_2', frameColour: 'white' }]}
              media={media}
              initialTemplatesByVariant={templatesByVariantProp([
                makeTemplate({ variantId: 'var_tiny' }),
                makeTemplate({ id: 'ft_tiny_2', variantId: 'var_tiny_2' }), // same geometry, different doc id
              ])}
            />
          </ToastProvider>
        </CartProvider>
      );

      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await screen.findByRole('button', { name: /add to cart/i });

      fireEvent.click(screen.getByRole('button', { name: 'white' }));

      expect(screen.queryByText(/photo quality.*is lower on this size\/colour/i)).not.toBeInTheDocument();
    });
  });

  describe('preview lightbox', () => {
    it('does not render a Preview button before any photo is uploaded', async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.queryByRole('button', { name: /^preview$/i })).not.toBeInTheDocument();
    });

    it('shows a Preview button once a slot has a photo, and opens the lightbox with the current canvas preview on click', async () => {
      mockUploadFetch();
      renderProduct(makeProduct(), [variant], [makeTemplate()]);

      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      const previewButton = await screen.findByRole('button', { name: /^preview$/i });
      fireEvent.click(previewButton);

      const dialog = await screen.findByRole('dialog');
      const img = within(dialog).getByRole('img');
      expect(img.getAttribute('src')).toContain('mockPreview');
    });

    it('does not render the Preview button when a slot has a photo but the canvas has not reported a preview frame yet', async () => {
      // Covers the gap the shared mock otherwise hides: EditorCanvas calls
      // onCanvasUpdate(null) on a canvas-taint SecurityError, and there's
      // also an ordinary timing window where a slot is filled before the
      // canvas's first async draw completes — in both cases previewDataUrl
      // stays null even though slots.size > 0. Without the
      // `previewDataUrl` guard on the Preview button's render condition,
      // the button would render and be clickable while doing nothing.
      withholdPreviewFrame = true;
      mockUploadFetch();
      renderProduct(makeProduct(), [variant], [makeTemplate()]);

      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      // Wait for the slot to register as filled (the zoom slider only
      // renders once activeSlot is set), then assert the Preview button is
      // still absent even though the slot has a photo.
      await screen.findByRole('slider', { name: /zoom/i });
      expect(screen.queryByRole('button', { name: /^preview$/i })).not.toBeInTheDocument();
    });
  });

  describe('gallery strip', () => {
    it('renders a thumbnail for each product media item alongside the live editor', async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.getByRole('button', { name: /view product photo 1/i })).toBeInTheDocument();
    });
  });
});
