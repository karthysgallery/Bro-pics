import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import OrderDetailPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));
vi.mock('../../../../lib/cart-context', () => ({
  useCart: vi.fn(() => ({ addItem: vi.fn() })),
}));
vi.mock('../../../../lib/session-id', () => ({
  getOrCreateSessionId: vi.fn(() => 'session_1'),
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

describe('[FE-44] Order detail page accessibility', () => {
  it('has no axe violations with the return form open (damaged category, evidence field showing)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ returns: [] }) }) as unknown as typeof fetch;
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ orderNo: 'BP-2026-00001', status: 'delivered', total: 50000 }),
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });

    const { container } = render(<OrderDetailPage params={Promise.resolve({ orderId: 'order_1' })} />);
    fireEvent.click(await screen.findByText('Return product'));
    await waitFor(() => screen.getByLabelText(/tell us more/i));

    expect(await axe(container)).toHaveNoViolations();
  });
});
