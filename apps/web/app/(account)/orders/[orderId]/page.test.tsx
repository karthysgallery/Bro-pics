import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrderDetailPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
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
});
