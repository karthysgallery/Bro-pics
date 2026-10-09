import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_BILLING_SETTINGS } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../../../../lib/auth-context', () => ({ useAuth: () => ({ user: { getIdToken: async () => 't' } }) }));

import NewBillPage from './page';

const frame = { productId: 'p1', variantId: 'v1', title: 'A4 Black Frame', variantLabel: 'A4 · Black', sku: 'A4-BLK', price: 49900, stockQty: 4, stockStatus: 'in_stock' };
const mug = { productId: 'p2', variantId: 'v2', title: 'Photo Mug', variantLabel: '11 oz', sku: 'MUG', price: 29900, stockQty: null, stockStatus: 'in_stock' };

describe('POS — New bill', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/billing/settings') return { settings: DEFAULT_BILLING_SETTINGS, gst: { enabled: true, rate: 18 }, whatsappMode: 'mock' };
      if (path.startsWith('/api/admin/billing/customers?phone=')) return { customer: null, phone: '+919876543210', account: { name: 'Asha Kumar', email: null } };
      if (path.startsWith('/api/admin/billing/catalogue')) return { items: [frame, mug] };
      if (path === '/api/admin/billing/sales' && init?.method === 'POST') return { invoiceId: 'pos_s1', invoiceNo: 'KG-INV-2026-000007', total: 119700, created: true, pdf: 'ready', whatsapp: { status: 'sent', error: null } };
      throw new Error(`unexpected ${path}`);
    });
  });

  it('finds the website account by mobile, adds items from search, totals the bill and completes the sale', async () => {
    render(<NewBillPage />);
    fireEvent.change(await screen.findByPlaceholderText('98765 43210'), { target: { value: '9876543210' } });
    await waitFor(() => expect((screen.getByPlaceholderText('Customer name') as HTMLInputElement).value).toBe('Asha Kumar'));
    expect(screen.getByText(/Has a website account/)).toBeTruthy();

    const search = screen.getByLabelText('Search products');
    fireEvent.change(search, { target: { value: 'frame' } });
    await screen.findByText('A4 Black Frame');
    fireEvent.keyDown(search, { key: 'Enter' }); // first hit
    fireEvent.change(search, { target: { value: 'mug' } });
    await screen.findByText('Photo Mug');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' }); // second hit
    fireEvent.click(screen.getByLabelText('One more A4 Black Frame'));
    // 2 × 499 + 299 = 1,297; 10% off the frames = 99.80 → 1,197.20
    fireEvent.change(screen.getByLabelText('Discount percent on A4 Black Frame'), { target: { value: '10' } });
    expect(screen.getByText('₹1,197.20', { selector: 'dd' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Complete sale/ }));
    await screen.findByText('Sale completed');
    expect(screen.getByText(/Invoice KG-INV-2026-000007 generated/)).toBeTruthy();
    expect(screen.getByText('✓ WhatsApp invoice sent')).toBeTruthy();
    const body = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/billing/sales' && i?.method === 'POST')![1].body));
    // Only what was chosen goes to the server — never prices or totals.
    expect(body.lines).toEqual([
      { productId: 'p1', variantId: 'v1', qty: 2, discountPercent: 10 },
      { productId: 'p2', variantId: 'v2', qty: 1 },
    ]);
    expect(body).toMatchObject({ customer: { phone: '9876543210', name: 'Asha Kumar' }, sendWhatsApp: true, consent: { transactional: 'opted_in' } });
    expect(body.payments).toEqual([{ method: 'cash', amount: 119720 }]);
    expect(body.clientRequestId).toMatch(/^[A-Za-z0-9-]{8,}$/);
  });

  it('warns about stock and the staff discount limit, and checks a split payment adds up before allowing completion', async () => {
    render(<NewBillPage />);
    fireEvent.change(await screen.findByPlaceholderText('98765 43210'), { target: { value: '9876543210' } });
    await waitFor(() => expect((screen.getByPlaceholderText('Customer name') as HTMLInputElement).value).toBe('Asha Kumar'));
    const search = screen.getByLabelText('Search products');
    fireEvent.change(search, { target: { value: 'frame' } });
    await screen.findByText('A4 Black Frame');
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Quantity of A4 Black Frame'), { target: { value: '5' } });
    expect(screen.getAllByText(/Only 4/).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: /Complete sale/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Quantity of A4 Black Frame'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Discount percent on A4 Black Frame'), { target: { value: '25' } });
    expect(screen.getByText(/Discounts above 10% need a manager/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Discount percent on A4 Black Frame'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Split payment'));
    fireEvent.change(screen.getByLabelText('Amount paid by Cash'), { target: { value: '100' } });
    expect(screen.getByText(/Paid ₹100.00 of ₹499.00/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Complete sale/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Amount paid by UPI'), { target: { value: '399' } });
    expect((screen.getByRole('button', { name: /Complete sale/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
