import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Product, Variant, FrameTemplate, ProductMedia } from '@bro-pics/shared';
import { ProductDetailClient } from '../product/ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import { ToastProvider } from '../ui/Toast';
import { PhotoCropModal } from './PhotoCropModal';
import { PhotoSlotCard } from './PhotoSlotCard';

vi.mock('../editor/EditorCanvas', () => ({
  EditorCanvas: (props: Record<string, unknown>) => {
    useEffect(() => {
      (props.onCanvasUpdate as ((url: string) => void) | undefined)?.('data:image/png;base64,mockPreview');
    }, [props.onCanvasUpdate]);
    return <div data-testid="editor-canvas" />;
  },
}));

global.fetch = vi.fn();

vi.mock('../../lib/session-id', () => ({
  getOrCreateSessionId: () => 'sess_test',
  resetSessionId: () => {},
  SESSION_ID_STORAGE_KEY: 'bropics_session_id',
}));

const variant: Variant = {
  id: 'var_1',
  productId: 'prod_1',
  sku: 'BP-1',
  widthIn: 8,
  heightIn: 12,
  frameColour: 'Black',
  material: 'Oak',
  price: 4999,
  stockStatus: 'in_stock',
  sizeLabel: '8×12"',
  printWidthPx: 2400,
  printHeightPx: 3600,
  minUploadPx: 1200,
  aspectRatio: 0.667,
  isActive: true,
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    slug: 'test-frame',
    title: 'Test Frame',
    shortDesc: 'Handmade wooden frame',
    descriptionHtml: '',
    highlights: [],
    howItWorks: [],
    careText: '',
    basePrice: 4999,
    isActive: true,
    isFeatured: false,
    badges: [],
    categoryId: 'cat_frames',
    photoSlots: 1,
    ratingAverage: 4.8,
    ratingCount: 12,
    dispatchDaysMin: 2,
    dispatchDaysMax: 4,
    seo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    allowsTextPersonalization: false,
    availableSizes: ['8×12"'],
    availableColours: ['Black'],
    availableMaterials: ['Oak'],
    minPrice: 4999,
    maxPrice: 4999,
    occasionTags: [],
    inStock: true,
    titleLower: 'test frame',
    searchTokens: ['test', 'frame'],
    faq: [],
    primaryImageUrl: '/classic-frame-1.jpg',
    hoverImageUrl: null,
    ...overrides,
  } satisfies Product;
}

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

const mockMedia: ProductMedia[] = [
  { id: 'm1', productId: 'prod_1', variantId: null, sortOrder: 0, url: '/classic-frame-1.jpg', type: 'image', alt: 'Frame 1' },
  { id: 'm2', productId: 'prod_1', variantId: null, sortOrder: 1, url: '/classic-frame-2.jpg', type: 'image', alt: 'Frame 2' },
];

function mockUploadFetch(overrides: Record<string, unknown> = {}) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url === '/api/uploads') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'up_' + Math.random().toString(36).slice(2, 7),
          sessionId: 'sess_test',
          originalUrl: '/test-photo.jpg',
          widthPx: 2400,
          heightPx: 3000,
          mime: 'image/jpeg',
          bytes: 1024 * 500,
          exifStripped: true,
          status: 'ready',
          ...overrides,
        }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadFetch();
});

describe('PhotoSlotCard Component', () => {
  it('renders empty slot with touch-friendly Add Photo button and file input', () => {
    const onSelect = vi.fn();
    const onFileChange = vi.fn();

    render(
      <PhotoSlotCard
        slotIndex={0}
        totalSlots={1}
        slotRect={{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }}
        isActive={true}
        isUploading={false}
        onSelect={onSelect}
        onFileChange={onFileChange}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onConfirmLowDpi={vi.fn()}
      />
    );

    expect(screen.getByText(/add photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload a photo for slot 1/i)).toBeInTheDocument();
  });

  it('renders filled slot with thumbnail, DPI badge, Change, Edit and Remove actions', () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();

    render(
      <PhotoSlotCard
        slotIndex={0}
        totalSlots={1}
        slot={{
          uploadId: 'up_1',
          originalUrl: '/test.jpg',
          widthPx: 2400,
          heightPx: 3000,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotationDeg: 0,
          effectiveDpi: 320,
          confirmedLowDpi: false,
        }}
        slotRect={{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }}
        isActive={true}
        isUploading={false}
        onSelect={vi.fn()}
        onFileChange={vi.fn()}
        onEdit={onEdit}
        onRemove={onRemove}
        onConfirmLowDpi={vi.fn()}
      />
    );

    expect(screen.getByText(/photo 1/i)).toBeInTheDocument();
    expect(screen.getByText(/300\+ dpi/i)).toBeInTheDocument();

    // Change action (file input label)
    expect(screen.getByLabelText(/replace a photo for slot 1/i)).toBeInTheDocument();

    // Edit action
    const editBtn = screen.getByRole('button', { name: /edit photo 1/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalled();

    // Remove action
    const removeBtn = screen.getByRole('button', { name: /remove photo 1/i });
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('PhotoCropModal Component', () => {
  it('allows zooming, rotating, and applying crop adjustments', () => {
    const onLiveTransformChange = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <PhotoCropModal
        isOpen={true}
        onClose={onClose}
        slotIndex={0}
        slot={{
          uploadId: 'up_1',
          originalUrl: '/test.jpg',
          widthPx: 2400,
          heightPx: 3000,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotationDeg: 0,
          effectiveDpi: 300,
          confirmedLowDpi: false,
        }}
        slotRect={{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }}
        variant={variant}
        onApply={onApply}
        onLiveTransformChange={onLiveTransformChange}
      />
    );

    expect(screen.getByRole('dialog', { name: /edit photo for slot 1/i })).toBeInTheDocument();

    // Rotate button
    const rotateBtn = screen.getByRole('button', { name: /rotate 90 degrees/i });
    fireEvent.click(rotateBtn);
    expect(onLiveTransformChange).toHaveBeenCalledWith(0, expect.objectContaining({ rotationDeg: 90 }));

    // Apply button commits and closes
    const applyBtn = screen.getByRole('button', { name: /apply photo/i });
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ rotationDeg: 90 }));
    expect(onClose).toHaveBeenCalled();
  });

  it('cancels and reverts live adjustments when Cancel is clicked', () => {
    const onLiveTransformChange = vi.fn();
    const onClose = vi.fn();

    render(
      <PhotoCropModal
        isOpen={true}
        onClose={onClose}
        slotIndex={0}
        slot={{
          uploadId: 'up_1',
          originalUrl: '/test.jpg',
          widthPx: 2400,
          heightPx: 3000,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotationDeg: 0,
          effectiveDpi: 300,
          confirmedLowDpi: false,
        }}
        slotRect={{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }}
        variant={variant}
        onApply={vi.fn()}
        onLiveTransformChange={onLiveTransformChange}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Cancel calls onLiveTransformChange with initial values and closes modal
    expect(onLiveTransformChange).toHaveBeenCalledWith(0, expect.objectContaining({ scale: 1, rotationDeg: 0 }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Multi-Photo Frame PDP Workflow', () => {
  it('supports 5-photo collage with independent slot upload and removal', async () => {
    const fiveSlotTemplate = makeTemplate({
      printableRects: [
        { slotIndex: 0, x: 0.05, y: 0.05, width: 0.4, height: 0.4 },
        { slotIndex: 1, x: 0.55, y: 0.05, width: 0.4, height: 0.4 },
        { slotIndex: 2, x: 0.3, y: 0.35, width: 0.4, height: 0.3 },
        { slotIndex: 3, x: 0.05, y: 0.65, width: 0.4, height: 0.3 },
        { slotIndex: 4, x: 0.55, y: 0.65, width: 0.4, height: 0.3 },
      ],
    });

    render(
      <CartProvider>
        <ToastProvider>
          <ProductDetailClient
            product={makeProduct({ photoSlots: 5 })}
            variants={[variant]}
            media={mockMedia}
            initialTemplatesByVariant={{ var_1: fiveSlotTemplate }}
          />
        </ToastProvider>
      </CartProvider>
    );

    // Initial state: 0/5 added, Add to cart disabled
    expect(screen.getByText(/your photos \(0\/5 added\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();

    // Upload Slot 1
    const slot1Input = (await screen.findByLabelText(/upload a photo for slot 1/i)) as HTMLInputElement;
    fireEvent.change(slot1Input, { target: { files: [new File(['x'], 'photo1.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByText(/your photos \(1\/5 added\)/i)).toBeInTheDocument());

    // Switch to Slot 2 and upload
    fireEvent.click(screen.getByRole('button', { name: /slot 2/i }));
    const slot2Input = (await screen.findByLabelText(/upload a photo for slot 2/i)) as HTMLInputElement;
    fireEvent.change(slot2Input, { target: { files: [new File(['y'], 'photo2.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByText(/your photos \(2\/5 added\)/i)).toBeInTheDocument());

    // Remove Slot 1 only
    const removeSlot1Btn = screen.getByRole('button', { name: /remove photo 1/i });
    fireEvent.click(removeSlot1Btn);

    // Slot 1 is removed (1/5 added), Slot 2 remains!
    await waitFor(() => expect(screen.getByText(/your photos \(1\/5 added\)/i)).toBeInTheDocument());
    expect(screen.getByText(/photo 2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /slot 1/i })).toBeInTheDocument();
  });

  it('supports Design Preview and View in Room modes', async () => {
    render(
      <CartProvider>
        <ToastProvider>
          <ProductDetailClient
            product={makeProduct({ photoSlots: 1 })}
            variants={[variant]}
            media={mockMedia}
            initialTemplatesByVariant={{ var_1: makeTemplate() }}
          />
        </ToastProvider>
      </CartProvider>
    );

    // Both modes available
    const designBtn = screen.getByRole('button', { name: /design preview/i });
    const roomBtn = screen.getByRole('button', { name: /view in room/i });
    expect(designBtn).toBeInTheDocument();
    expect(roomBtn).toBeInTheDocument();

    // Switch to View in Room
    fireEvent.click(roomBtn);
    expect(screen.getByTestId('lifestyle-preview')).toBeInTheDocument();
    // Living room, bedroom, wall and table scenes are offered and switching keeps the preview mounted.
    const group = screen.getByRole('group', { name: /choose a scene/i });
    expect(within(group).getByRole('button', { name: 'Living room' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: 'Table' }));
    expect(within(group).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lifestyle-preview')).toBeInTheDocument();

    // Switch back to Design Preview
    fireEvent.click(designBtn);
    expect(screen.getByTestId('editor-canvas')).toBeInTheDocument();
  });
});
