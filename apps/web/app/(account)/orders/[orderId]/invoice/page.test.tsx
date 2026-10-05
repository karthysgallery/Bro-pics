import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const mockSeller = vi.fn();
vi.mock('../../../../../lib/invoice-seller', () => ({ getInvoiceSeller: () => mockSeller() }));
vi.mock('../../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('InvoicePage', () => {
  beforeEach(() => {
    mockSeller.mockReset();
    mockSeller.mockResolvedValue({ name: 'KarthysGallery' });
  });

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

  describe('seller identity, test orders and unpaid orders', () => {
    const baseOrder = {
      orderNo: 'BP-2026-00020',
      subtotal: 100000,
      discount: 0,
      shipping: 0,
      total: 100000,
      paymentStatus: 'paid',
      taxLines: [],
      customerName: 'Asha Raman',
      addressJson: { line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', label: 'Home' },
    };
    function load(order: Record<string, unknown>) {
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ ...baseOrder, ...order }) });
      mockGetDocs.mockResolvedValueOnce({ docs: [{ data: () => ({ title: 'Frame', qty: 1, unitPrice: 100000 }) }] });
      render(<InvoicePage params={Promise.resolve({ orderId: 'order_20' })} />);
    }

    it('prints only the seller details the owner has entered — no invented company, address or GSTIN', async () => {
      load({});
      expect(await screen.findByText('BP-2026-00020')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Invoice' })).toBeInTheDocument(); // not a "Tax invoice" without a GSTIN
      expect(screen.queryByText(/GSTIN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Private Limited/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Craft Lane/)).not.toBeInTheDocument();
    });

    it('shows the configured legal name, address and GSTIN, and calls it a tax invoice', async () => {
      mockSeller.mockResolvedValue({ name: 'KarthysGallery', legalName: 'Karthys Gallery LLP', address: '5 Gandhi Street, Chennai', gstin: '33ABCDE1234F1Z5' });
      load({});
      expect(await screen.findByText('Karthys Gallery LLP')).toBeInTheDocument();
      expect(screen.getByText('5 Gandhi Street, Chennai')).toBeInTheDocument();
      expect(screen.getByText('GSTIN 33ABCDE1234F1Z5')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Tax invoice' })).toBeInTheDocument();
    });

    it('bills to the customer by name, not by the address label', async () => {
      load({});
      expect(await screen.findByText('Asha Raman')).toBeInTheDocument();
    });

    it('marks a mock-payment order as a test order, not a valid tax invoice', async () => {
      load({ paymentProvider: 'mock' });
      expect(await screen.findByText(/not a valid tax invoice/i)).toBeInTheDocument();
      expect(screen.getByText(/Test payment \(no charge\)/)).toBeInTheDocument();
    });

    it('refuses to render an invoice for an order that has not been paid', async () => {
      load({ paymentStatus: 'pending' });
      expect(await screen.findByText('Invoice not available yet')).toBeInTheDocument();
      expect(screen.queryByText('Download PDF')).not.toBeInTheDocument();
    });
  });
});
