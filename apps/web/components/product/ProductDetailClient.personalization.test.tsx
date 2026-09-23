import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Product, Variant, ProductMedia, FrameTemplate } from '@bro-pics/shared';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';

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

  it('shows an error and leaves the slot empty when the upload fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'bad' }) } as Response);

    renderProduct(makeProduct(), [variant], [makeTemplate()]);

    const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'corrupt.jpg', { type: 'image/jpeg' })] } });

    expect(await screen.findByText(/couldn't process this photo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();
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
