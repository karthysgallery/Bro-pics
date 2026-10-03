import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminTemplateFormPage from './page';

const mockGetIdToken = vi.fn().mockResolvedValue('token-123');
const mockUser = { uid: 'admin_1', getIdToken: mockGetIdToken };
vi.mock('../../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    loading: false,
  })),
}));

const mockShowToast = vi.fn();
vi.mock('../../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const productData = {
  products: [{ id: 'prod_1', title: 'Classic Frame' }],
};

const variantsData = {
  variants: [
    { id: 'var_1', sku: 'CF-8X12', sizeLabel: '8x12', frameColour: 'Black', widthIn: 8, heightIn: 12 },
  ],
};

const templateData = [
  {
    id: 'tpl_1',
    variantId: 'var_1',
    mockupUrl: 'https://example.com/mockup.png',
    maskUrl: null,
    overlayUrl: null,
    version: 1,
    isCurrent: true,
    printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
    textZones: [
      {
        fieldKey: 'heading',
        label: 'Heading',
        x: 0.1,
        y: 0.8,
        width: 0.8,
        height: 0.1,
        maxLength: 40,
        align: 'center',
        defaultFontFamily: 'dancing-script',
        defaultColor: '#1A1815',
      },
    ],
    clipartOptions: [],
    bleedMm: 3,
    matInset: 0,
  },
];

describe('AdminTemplateFormPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockShowToast.mockClear();

    // Default mock fetch dispatcher
    mockFetch.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/admin/products?id=prod_1')) {
        return { ok: true, json: async () => productData };
      }
      if (urlStr.includes('/api/admin/products/prod_1/variants')) {
        return { ok: true, json: async () => variantsData };
      }
      if (urlStr.includes('/api/frame-templates/var_1')) {
        return { ok: true, json: async () => templateData };
      }
      if (urlStr.includes('/api/admin/frame-templates/test-render')) {
        return {
          ok: true,
          blob: async () => new Blob(['rendered-png-data'], { type: 'image/png' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-preview');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders the template builder with loaded product, variant, and text zones', async () => {
    render(<AdminTemplateFormPage params={Promise.resolve({ id: 'prod_1' })} />);

    expect(await screen.findByText('Visual Frame Template Builder')).toBeInTheDocument();
    expect(await screen.findByText(/CF-8X12/)).toBeInTheDocument();
    expect(await screen.findByText(/Zone #1: Heading/)).toBeInTheDocument();
  });

  it('triggers test render API call and creates a preview blob', async () => {
    render(<AdminTemplateFormPage params={Promise.resolve({ id: 'prod_1' })} />);

    // Wait for product, variant, and template to finish loading
    await screen.findByText(/CF-8X12/);
    await screen.findByText('Live Mockup Canvas');

    const file = new File(['test-image-content'], 'sample.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText(/Sample Photo/);
    fireEvent.change(fileInput, { target: { files: [file] } });

    const renderBtn = await screen.findByText(/Render & Download Test Print/);
    expect(renderBtn).toBeInTheDocument();

    fireEvent.click(renderBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/frame-templates/test-render',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
          body: expect.any(FormData),
        })
      );
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        '300 DPI test print rendered & downloaded!',
        'success'
      );
    });
  });
});
