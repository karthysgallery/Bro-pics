import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvoicePage from './page';

vi.mock('../../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
}));

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('InvoicePage', () => {
  it('[FE-25] shows invoice no. and a taxable-value / GST breakdown when GST is enabled on the order', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        orderNo: 'BP-2026-00010',
        invoiceNo: 'INV-2026-00001',
        subtotal: 100000,
        discount: 0,
        shipping: 0,
        total: 100000,
        paymentStatus: 'paid',
        taxLines: [{ gstin: '29ABCDE1234F1Z5', rate: 18, amount: 15254 }],
        addressJson: {},
      }),
    });
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ data: () => ({ title: 'Classic Wooden Frame', qty: 1, unitPrice: 100000 }) }],
    });

    render(<InvoicePage params={Promise.resolve({ orderId: 'order_10' })} />);

    expect(await screen.findByText('INV-2026-00001')).toBeInTheDocument();
    expect(await screen.findByText('GST @ 18% (29ABCDE1234F1Z5)')).toBeInTheDocument();
    // Taxable value = total (100000) - GST amount (15254) = 84746
    expect(await screen.findByText('₹847.46')).toBeInTheDocument();
    expect(await screen.findByText('₹152.54')).toBeInTheDocument();
  });

  it('shows no tax breakdown at all when the order has no tax lines (GST not enabled)', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        orderNo: 'BP-2026-00011',
        subtotal: 50000,
        discount: 0,
        shipping: 0,
        total: 50000,
        paymentStatus: 'paid',
        taxLines: [],
        addressJson: {},
      }),
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [] });

    render(<InvoicePage params={Promise.resolve({ orderId: 'order_11' })} />);

    await screen.findByText('BP-2026-00011');
    expect(screen.queryByText(/GST @/)).not.toBeInTheDocument();
    expect(screen.queryByText('Taxable value')).not.toBeInTheDocument();
  });
});
