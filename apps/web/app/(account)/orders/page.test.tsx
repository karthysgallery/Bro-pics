import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrdersPage from './page';

vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
}));

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(orders: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: orders.map((o) => ({ id: o.id, data: () => o.data })) };
}

describe('OrdersPage (customer order list)', () => {
  it('shows an empty state with no orders', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([]));
    render(<OrdersPage />);
    expect(await screen.findByText(/no orders yet/i)).toBeInTheDocument();
  });

  it('lists orders with a link to each detail page', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([{ id: 'order_1', data: { orderNo: 'BP-2026-00001', status: 'shipped', total: 105000 } }])
    );
    render(<OrdersPage />);
    const link = await screen.findByText('BP-2026-00001');
    expect(link.closest('a')).toHaveAttribute('href', '/account/orders/order_1');
  });
});
