import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StaffReviewsPage from './page';
import { useAuth } from '../../../lib/auth-context';

vi.mock('../../../lib/auth-context', () => ({ useAuth: vi.fn() }));

const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
const mockGetIdTokenResult = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function mockSignedInAsStaff() {
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'staff_1', getIdToken: mockGetIdToken, getIdTokenResult: mockGetIdTokenResult },
    loading: false,
  } as unknown as ReturnType<typeof useAuth>);
  mockGetIdTokenResult.mockResolvedValue({ claims: { role: 'staff' } });
}

describe('StaffReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not flash "Not authorized" while the auth check is still loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as unknown as ReturnType<typeof useAuth>);
    render(<StaffReviewsPage />);
    expect(screen.queryByText(/not authorized/i)).not.toBeInTheDocument();
  });

  it('shows "Not authorized" for a signed-out visitor once loading resolves', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as unknown as ReturnType<typeof useAuth>);
    render(<StaffReviewsPage />);
    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it('loads the pending queue and removes a row after approving it', async () => {
    mockSignedInAsStaff();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            reviews: [
              { id: 'review_1', productId: 'prod_1', productTitle: 'Classic Wooden Photo Frame', userId: 'user_1', rating: 5, title: 'Great', body: 'Loved it', isVerified: true, status: 'pending' },
            ],
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'review_1', status: 'approved' }) });

    render(<StaffReviewsPage />);
    expect(await screen.findByText('Classic Wooden Photo Frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith('/api/staff/reviews/review_1/moderate', expect.objectContaining({ method: 'POST' }))
    );
    await waitFor(() => expect(screen.queryByText('Classic Wooden Photo Frame')).not.toBeInTheDocument());
  });
});
