import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import OrderDetailPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

const mockAddItem = vi.fn();
vi.mock('../../../../lib/cart-context', () => ({
  useCart: vi.fn(() => ({ addItem: mockAddItem })),
}));
vi.mock('../../../../lib/session-id', () => ({
  getOrCreateSessionId: vi.fn(() => 'session_1'),
}));

describe('OrderDetailPage', () => {
  it('[FE-01] shows "Order not found" instead of an infinite skeleton for a missing/foreign order id', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'does-not-exist' })} />);

    expect(await screen.findByText('Order not found')).toBeInTheDocument();
  });

  it('[FE-01] shows a retryable error instead of an infinite skeleton when the order read fails', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));
    mockGetDocs.mockResolvedValue({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_1' })} />);

    expect(await screen.findByText('Could not load this order')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('renders line items and the event timeline in chronological order', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00001', status: 'shipped', total: 105000 }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [{ data: () => ({ id: 'item_1', title: 'Classic Wooden Frame', qty: 1 }) }] })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ id: 'evt_1', status: 'paid', note: null, courier: null, awbNumber: null, createdAt: '2026-09-01T00:00:00.000Z' }) },
          { data: () => ({ id: 'evt_2', status: 'shipped', note: null, courier: 'BlueDart', awbNumber: 'BD123', createdAt: '2026-09-03T00:00:00.000Z' }) },
        ],
      });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_1' })} />);

    expect(await screen.findByText('Classic Wooden Frame')).toBeInTheDocument();
    // The activity history lists events oldest-first, using the customer-facing
    // status labels (not raw snake_case ids).
    const history = (await screen.findByText('Activity history')).parentElement as HTMLElement;
    const rows = within(history).getAllByRole('listitem');
    expect(rows[1].textContent).toContain('Payment confirmed');
    expect(rows[rows.length - 1].textContent).toContain('Shipped');
    expect(await screen.findByText('BlueDart')).toBeInTheDocument();
    expect(await screen.findByText('BD123')).toBeInTheDocument();

    // Each event row should also render its own formatted date (not just the
    // now-dead synthetic "Order placed" block), derived from event.createdAt.
    const expectedDate = new Date('2026-09-01T00:00:00.000Z').toLocaleString('en-IN');
    expect(await screen.findByText(expectedDate)).toBeInTheDocument();
  });

  it('shows a synthetic "Order placed" row even when there are no staff events yet', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        orderNo: 'BP-2026-00002',
        status: 'paid',
        total: 50000,
        placedAt: { toDate: () => new Date('2026-09-05T10:00:00.000Z') },
      }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_2' })} />);

    expect(await screen.findByText('Order placed')).toBeInTheDocument();
  });

  it('suppresses the synthetic "Order placed" row when a real pending_payment event exists', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        orderNo: 'BP-2026-00003',
        status: 'paid',
        total: 50000,
        placedAt: { toDate: () => new Date('2026-09-06T10:00:00.000Z') },
      }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              id: 'evt_1',
              status: 'pending_payment',
              note: null,
              courier: null,
              awbNumber: null,
              createdAt: '2026-09-06T10:00:00.000Z',
            }),
          },
        ],
      });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_3' })} />);

    const history = (await screen.findByText('Activity history')).parentElement as HTMLElement;
    expect(within(history).getByText('Awaiting payment')).toBeInTheDocument();
    expect(screen.queryByText('Order placed')).not.toBeInTheDocument();
  });

  it('offers to return a delivered order, and shows the request status once submitted', async () => {
    // Branches on method rather than call order — the GET-existing-returns
    // fetch (on mount) and the POST-new-return fetch (on submit) are two
    // independent async flows with no ordering guarantee relative to when
    // "Return product" first appears, so a plain FIFO mockResolvedValueOnce
    // queue would be a race.
    const mockFetch = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return { ok: true, json: async () => ({ return: { status: 'requested', reason: 'Frame arrived damaged' } }) };
      }
      return { ok: true, json: async () => ({ returns: [] }) };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00004', status: 'delivered', total: 50000 }),
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_4' })} />);

    const returnButton = await screen.findByText('Return product');
    fireEvent.click(returnButton);

    // [FE-23] Not testing the evidence-upload flow here — a non-damage
    // category keeps this test focused on the general submit flow.
    fireEvent.change(screen.getByLabelText(/what's the issue/i), { target: { value: 'other' } });
    fireEvent.change(await screen.findByLabelText(/tell us more/i), { target: { value: 'Frame arrived damaged' } });
    fireEvent.click(screen.getByText('Submit return request'));

    expect(await screen.findByText('Return requested')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/orders/order_4/returns',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reasonCategory: 'other', reason: 'Frame arrived damaged', preferredResolution: 'refund' }),
      })
    );
  });

  it('[FE-23] blocks a damage claim with no evidence photo, then uploads one and submits it with the return', async () => {
    const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/returns/evidence')) {
        return { ok: true, json: async () => ({ path: 'returns/order_4/ev1/evidence.jpg' }) };
      }
      if (options?.method === 'POST') {
        return { ok: true, json: async () => ({ return: { status: 'requested', reason: 'Cracked frame' } }) };
      }
      return { ok: true, json: async () => ({ returns: [] }) };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00004', status: 'delivered', total: 50000 }),
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_4' })} />);
    fireEvent.click(await screen.findByText('Return product'));
    // Default category is 'damaged' — the evidence field should already
    // be showing without switching anything.
    fireEvent.change(await screen.findByLabelText(/tell us more/i), { target: { value: 'Cracked frame' } });
    fireEvent.click(screen.getByText('Submit return request'));

    expect(await screen.findByText('Please attach at least one photo of the damage.')).toBeInTheDocument();
    expect(mockFetch.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);

    const fileInput = screen.getByLabelText(/photo of the damage/i) as HTMLInputElement;
    const file = new File(['x'], 'damage.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Submit return request'));

    expect(await screen.findByText('Return requested')).toBeInTheDocument();
    const evidenceCall = mockFetch.mock.calls.find((c) => c[0] === '/api/orders/order_4/returns/evidence');
    const returnCall = mockFetch.mock.calls.find((c) => c[0] === '/api/orders/order_4/returns' && c[1]?.method === 'POST');
    expect(evidenceCall).toBeDefined();
    expect(returnCall).toBeDefined();
    expect(JSON.parse(returnCall![1]!.body as string).evidencePaths).toEqual(['returns/order_4/ev1/evidence.jpg']);
  });

  it('[FE-24] reorders a delivered item by copying its personalization into a new cart line', async () => {
    const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/customizations/reorder') {
        return { ok: true, json: async () => ({ personalizationId: 'personalization_new' }) };
      }
      return { ok: true, json: async () => ({ returns: [] }) };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ orderNo: 'BP-2026-00005', status: 'delivered', total: 50000 }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ slug: 'classic-wooden-frame' }),
      });
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              productId: 'product_1',
              variantId: 'variant_1',
              personalizationId: 'personalization_old',
              title: 'Classic Wooden Frame',
              unitPrice: 50000,
              qty: 2,
              previewPath: 'previews/order_5/item_1.jpg',
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [] });

    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_5' })} />);

    const reorderButton = await screen.findByText('Reorder');
    fireEvent.click(reorderButton);

    await screen.findByText('Reorder');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/customizations/reorder',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ personalizationId: 'personalization_old' }),
      })
    );
    expect(mockAddItem).toHaveBeenCalledWith({
      variantId: 'variant_1',
      personalizationId: 'personalization_new',
      title: 'Classic Wooden Frame',
      unitPriceSnapshot: 50000,
      qty: 2,
      previewPath: 'previews/order_5/item_1.jpg',
      productSlug: 'classic-wooden-frame',
    });
  });

  describe('customer-facing status, delivery and totals', () => {
    function loadOrder(over: Record<string, unknown>) {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          orderNo: 'BP-2026-00009',
          status: 'print_rendering',
          paymentStatus: 'paid',
          subtotal: 159800,
          discount: 20000,
          couponId: 'FIRST15',
          shipping: 0,
          total: 139800,
          taxLines: [{ rate: 18, amount: 21325 }],
          customerName: 'Asha Raman',
          addressJson: { line1: '12 MG Road', line2: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', phone: '+919000000002', deliveryInstructions: 'Ring twice' },
          placedAt: { toDate: () => new Date('2026-10-05T10:00:00.000Z') },
          ...over,
        }),
      });
      mockGetDocs
        .mockResolvedValueOnce({
          docs: [{ data: () => ({ id: 'i1', title: 'Classic Wooden Photo Frame', qty: 2, unitPrice: 79900, sizeLabel: '8x12 in', frameColour: 'Black', material: 'Solid wood' }) }],
        })
        .mockResolvedValueOnce({ docs: [] });
      render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_9' })} />);
    }

    it('never calls a paid order in an automatic production stage "Pending payment"', async () => {
      loadOrder({ status: 'print_rendering' });
      expect(await screen.findByText('Your print is being prepared')).toBeInTheDocument();
      expect(screen.queryByText('Pending payment')).not.toBeInTheDocument();
      expect(screen.getAllByText('Preparing your print').length).toBeGreaterThan(0);
    });

    it('shows a cancelled order as cancelled, not as "checking your photos"', async () => {
      loadOrder({ status: 'cancelled' });
      expect(await screen.findByText('This order was cancelled')).toBeInTheDocument();
      expect(screen.queryByText("We're checking your photos")).not.toBeInTheDocument();
      expect(screen.queryByText(/Estimated dispatch/)).not.toBeInTheDocument();
    });

    it('does not say "Paid" or offer an invoice for an unpaid order, and links back to checkout', async () => {
      loadOrder({ status: 'pending_payment', paymentStatus: 'pending', total: 159800, discount: 0, taxLines: [] });
      expect(await screen.findByText('Waiting for your payment')).toBeInTheDocument();
      expect(screen.getAllByText(/Awaiting payment/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/· Paid /)).not.toBeInTheDocument();
      expect(screen.queryByText('View invoice')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Return to checkout' })).toHaveAttribute('href', '/checkout');
    });

    it('shows the delivery address from the order snapshot, with name, phone and note', async () => {
      loadOrder({});
      expect(await screen.findByText('Asha Raman')).toBeInTheDocument();
      expect(screen.getByText(/12 MG Road, Anna Nagar/)).toBeInTheDocument();
      expect(screen.getByText(/Chennai, Tamil Nadu 600001/)).toBeInTheDocument();
      expect(screen.getByText('+919000000002')).toBeInTheDocument();
      expect(screen.getByText(/Ring twice/)).toBeInTheDocument();
    });

    it('shows the price breakdown from the order snapshot: subtotal, discount, shipping, GST, total, payment', async () => {
      loadOrder({});
      const summary = (await screen.findByText('Order summary')).parentElement as HTMLElement;
      expect(within(summary).getByText('₹1,598')).toBeInTheDocument(); // subtotal
      expect(within(summary).getByText('Discount (FIRST15)')).toBeInTheDocument();
      expect(within(summary).getByText('−₹200')).toBeInTheDocument();
      expect(within(summary).getByText('Free')).toBeInTheDocument();
      expect(within(summary).getByText('Includes GST (18%)')).toBeInTheDocument();
      expect(within(summary).getByText('₹1,398')).toBeInTheDocument(); // total
      expect(within(summary).getByText('Paid')).toBeInTheDocument();
    });

    it('shows the purchased variant (size · colour · material) frozen on the line item', async () => {
      loadOrder({});
      expect(await screen.findByText('8x12 in · Black · Solid wood')).toBeInTheDocument();
    });

    it('only promises a refund when the order was actually paid', async () => {
      loadOrder({ status: 'print_ready', paymentStatus: 'paid' });
      fireEvent.click(await screen.findByText('Cancel order'));
      expect(await screen.findByText(/refund of your payment will be arranged/i)).toBeInTheDocument();
    });

    it('tells an unpaid customer they have not been charged when cancelling', async () => {
      loadOrder({ status: 'pending_payment', paymentStatus: 'pending' });
      fireEvent.click(await screen.findByText('Cancel order'));
      expect(await screen.findByText(/haven't been charged/i)).toBeInTheDocument();
    });
  });

  it('mentions the personalization on a personalised line: photo count and the customer\'s text', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00044', status: 'print_rendering', paymentStatus: 'paid', subtotal: 1000, discount: 0, shipping: 0, total: 1000, taxLines: [], addressJson: {}, placedAt: { toDate: () => new Date('2026-10-05T10:00:00.000Z') } }),
    });
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ id: 'i1', title: 'Names frame', qty: 1, unitPrice: 1000, personalization: { state: { slots: { photo_01: {}, photo_02: {} }, texts: { name: { value: 'Asha & Ravi' } } } } }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_44' })} />);
    expect(await screen.findByText(/Personalised · 2 photos · “Asha & Ravi”/)).toBeInTheDocument();
  });
});
