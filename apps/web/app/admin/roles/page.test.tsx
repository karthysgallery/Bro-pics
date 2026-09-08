import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminRolesPage from './page';
import { useAuth } from '../../../lib/auth-context';

const mockGetIdTokenResult = vi.fn();
const mockGetIdToken = vi.fn().mockResolvedValue('id-token');
const mockDefaultAuthImpl = () => ({
  user: { uid: 'admin_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
  loading: false,
});
vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => mockDefaultAuthImpl()),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('AdminRolesPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.mocked(useAuth).mockImplementation(() => mockDefaultAuthImpl() as unknown as ReturnType<typeof useAuth>);
  });

  it('shows "Not authorized" when the signed-in user is not an admin', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'staff' } });
    render(<AdminRolesPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('shows "Not authorized" for a signed-out visitor', async () => {
    vi.mocked(useAuth).mockImplementation(() => ({ user: null, loading: false }) as unknown as ReturnType<typeof useAuth>);
    render(<AdminRolesPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('looks up an account by phone and shows its current role', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ uid: 'user_9', phoneNumber: '+911234567890', role: 'staff' }),
    });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+911234567890' } });
    fireEvent.click(screen.getByText('Look up'));

    expect(await screen.findByText('+911234567890')).toBeInTheDocument();
    expect(await screen.findByText('Current role: staff')).toBeInTheDocument();
  });

  it('shows "No account with that phone number" on a 404', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+919999999999' } });
    fireEvent.click(screen.getByText('Look up'));

    expect(await screen.findByText(/no account/i)).toBeInTheDocument();
  });

  it('sets a new role and submits the change', async () => {
    mockGetIdTokenResult.mockResolvedValueOnce({ claims: { role: 'admin' } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ uid: 'user_9', phoneNumber: '+911234567890', role: null }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uid: 'user_9', role: 'admin' }) });

    render(<AdminRolesPage />);
    fireEvent.change(await screen.findByLabelText('Phone number'), { target: { value: '+911234567890' } });
    fireEvent.click(screen.getByText('Look up'));
    await waitFor(() => screen.getByLabelText('Role'));

    const roleSelect = screen.getByLabelText('Role');
    expect(within(roleSelect).getByRole('option', { name: 'Staff' })).toHaveValue('staff');

    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/users/user_9/role',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
          body: JSON.stringify({ role: 'admin' }),
        })
      )
    );
  });
});
