import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OrderDetailPage from './page';

// Stable references: the page's effects depend on `user` and the unwrapped
// params, so fresh objects per render would refetch forever.
const stableAuth = { user: { uid: 'admin_1', getIdToken: () => Promise.resolve('tok') }, loading: false };
const stableParams = { id: 'ord_1' };
vi.mock('../../../../lib/auth-context', () => ({ useAuth: () => stableAuth }));
// The page unwraps its route params with React 19's use(); Next's bundled React
// provides it at runtime but the React 18 that vitest loads does not.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  use: () => stableParams,
}));
const stableRouter = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => stableRouter }));
const mockShowToast = vi.fn();
const stableToast = { showToast: mockShowToast };
vi.mock('../../../../components/ui/Toast', () => ({ useToast: () => stableToast }));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function orderPayload(over: Record<string, unknown> = {}) {
  return {
    order: {
      id: 'ord_1',
      orderNo: 'BP-2026-00001',
      status: 'print_rendering',
      paymentStatus: 'paid',
      paymentMode: 'prepaid',
      paymentProvider: 'mock',
      subtotal: 159800,
      discount: 0,
      shipping: 5000,
      total: 164800,
      amountPaidOnline: 164800,
      amountDueOnDelivery: 0,
      customerName: 'Asha Raman',
      placedAt: { _seconds: 1790000000 },
      addressJson: {
        id: 'a1', label: 'Home', line1: '12 MG Road', line2: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu',
        pincode: '600001', phone: '+919000000002', deliveryInstructions: 'Ring twice',
      },
      ...over,
    },
    items: [{ id: 'i1', title: 'Classic Wooden Photo Frame', qty: 2, unitPrice: 79900, previewPath: null }],
    events: [],
    customizations: [],
  };
}

async function renderPage(payload = orderPayload()) {
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
  render(<OrderDetailPage params={Promise.resolve({ id: 'ord_1' })} />);
  await screen.findByText(/Order #BP-2026-00001/);
}

describe('admin order detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('shows money in rupees, never raw paise', async () => {
    await renderPage();
    expect(screen.getByText('Qty:', { exact: false }).closest('p')).toHaveTextContent('× ₹799');
    expect(screen.getAllByText('₹1,648').length).toBeGreaterThan(0); // total
    expect(screen.queryByText(/164800|159800|79900/)).not.toBeInTheDocument();
  });

  it('shows the full street address, the delivery note and the customer name for the courier label', async () => {
    await renderPage();
    expect(screen.getByText(/12 MG Road, Anna Nagar/)).toBeInTheDocument();
    expect(screen.getByText(/Chennai, Tamil Nadu - 600001/)).toBeInTheDocument();
    expect(screen.getByText('Asha Raman')).toBeInTheDocument();
    expect(screen.getByText(/Ring twice/)).toBeInTheDocument();
  });

  it('flags a mock-provider order as a test payment', async () => {
    await renderPage();
    expect(screen.getByText(/mock payment provider/i)).toBeInTheDocument();
  });

  it('only offers status moves the state machine allows from print_rendering', async () => {
    await renderPage();
    const select = screen.getByLabelText(/Target Status/);
    const offered = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(offered).toEqual(['print_ready', 'cancelled']);
  });

  it('asks for confirmation before cancelling and only then calls the advance API', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Target Status/), { target: { value: 'cancelled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Advance Order' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/advance'))).toBe(false);

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(orderPayload({ status: 'cancelled' })) });
    fireEvent.click(screen.getByRole('button', { name: /Yes, mark cancelled/i }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/advance'))).toBe(true));
  });

  it('does not ask for confirmation for an ordinary forward move', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Target Status/), { target: { value: 'print_ready' } });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(orderPayload({ status: 'print_ready' })) });
    fireEvent.click(screen.getByRole('button', { name: 'Advance Order' }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/advance'))).toBe(true));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps "Advance Order" disabled for shipped until the courier and AWB are entered', async () => {
    await renderPage(orderPayload({ status: 'packed' }));
    fireEvent.change(screen.getByLabelText(/Target Status/), { target: { value: 'shipped' } });
    const advance = screen.getByRole('button', { name: 'Advance Order' });
    expect(advance).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Courier Partner/), { target: { value: 'Delhivery' } });
    expect(advance).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/AWB Tracking Number/), { target: { value: 'AWB123' } });
    expect(advance).not.toBeDisabled();

    // Irreversible and customer-visible, so it still asks first.
    fireEvent.click(advance);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/advance'))).toBe(false);
  });

  it('attributes timeline events to the right actor (system, customer, staff)', async () => {
    const payload = orderPayload();
    (payload.order as { userId?: string }).userId = 'cust_9';
    payload.events = [
      { status: 'pending_payment', createdBy: 'cust_9', createdAt: '2026-10-05T01:00:00.000Z' },
      { status: 'paid', createdBy: 'system', createdAt: '2026-10-05T01:01:00.000Z' },
      { status: 'print_ready', createdBy: 'staff_abcdef123456', createdAt: '2026-10-05T01:02:00.000Z' },
    ] as never[];
    await renderPage(payload);
    expect(screen.getByText(/By Customer/)).toBeInTheDocument();
    expect(screen.getByText(/By System/)).toBeInTheDocument();
    expect(screen.getByText(/By Staff staff_ab/)).toBeInTheDocument();
  });

  it('offers no status changes for a closed order', async () => {
    await renderPage(orderPayload({ status: 'cancelled' }));
    expect(screen.getByText(/no further status changes are available/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Target Status/)).not.toBeInTheDocument();
  });
});
