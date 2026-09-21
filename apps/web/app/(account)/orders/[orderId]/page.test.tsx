import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('OrderDetailPage', () => {
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
    const statusEls = await screen.findAllByText(/paid|shipped/);
    // 'paid' event should render before 'shipped' event, per the oldest-first ordering
    expect(statusEls[0].textContent).toContain('paid');
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

    await screen.findByText('pending_payment');
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

    fireEvent.change(await screen.findByLabelText(/why are you returning/i), { target: { value: 'Frame arrived damaged' } });
    fireEvent.click(screen.getByText('Submit return request'));

    expect(await screen.findByText('Return requested')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/orders/order_4/returns',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Frame arrived damaged' }) })
    );
  });
});
