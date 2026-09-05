import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StaffOrdersPage from './page';
import { useAuth } from '../../../lib/auth-context';

const mockGetIdTokenResult = vi.fn();
const mockGetIdToken = vi.fn().mockResolvedValue('id-token');
const mockDefaultAuthImpl = () => ({
  user: { uid: 'staff_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
  loading: false,
});
vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => mockDefaultAuthImpl()),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('StaffOrdersPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.mocked(useAuth).mockImplementation(() => mockDefaultAuthImpl() as unknown as ReturnType<typeof useAuth>);
  });

  it('shows "Not authorized" when the signed-in user has no staff/admin role claim', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: {} });
    render(<StaffOrdersPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('shows "Not authorized" (not a blank page) for a signed-out visitor', async () => {
    vi.mocked(useAuth).mockImplementation(() => ({ user: null, loading: false }) as unknown as ReturnType<typeof useAuth>);
    render(<StaffOrdersPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('looks up an order and shows a status-advance form for a staff user', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'staff' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          order: { orderNo: 'BP-2026-00001', status: 'printed_packed' },
          items: [{ title: 'Frame', qty: 1 }],
        }),
    });

    render(<StaffOrdersPage />);
    fireEvent.change(await screen.findByLabelText('Order number'), { target: { value: 'BP-2026-00001' } });
    fireEvent.click(screen.getByText('Look up'));

    await waitFor(() => expect(screen.getByText('Frame')).toBeInTheDocument());
    // printed_packed's only valid next steps are shipped and refunded — courier/AWB
    // fields should NOT show until 'shipped' is actually selected.
    expect(screen.queryByLabelText('Courier')).not.toBeInTheDocument();
  });

  it('shows courier/AWB fields only when the selected next status is shipped, and submits the advance', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ order: { orderNo: 'BP-2026-00001', status: 'printed_packed' }, items: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ order: { orderNo: 'BP-2026-00001', status: 'shipped' } }) });

    render(<StaffOrdersPage />);
    fireEvent.change(await screen.findByLabelText('Order number'), { target: { value: 'BP-2026-00001' } });
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() => screen.getByLabelText('Next status'));

    fireEvent.change(screen.getByLabelText('Next status'), { target: { value: 'shipped' } });
    expect(await screen.findByLabelText('Courier')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Courier'), { target: { value: 'BlueDart' } });
    fireEvent.change(screen.getByLabelText('AWB / tracking number'), { target: { value: 'BD123456789' } });
    fireEvent.click(screen.getByText('Advance'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/staff/orders/BP-2026-00001/advance',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
          body: JSON.stringify({ status: 'shipped', note: '', courier: 'BlueDart', awbNumber: 'BD123456789' }),
        })
      )
    );
  });
});
