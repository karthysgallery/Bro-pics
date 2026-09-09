import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from './ReviewForm';
import { useAuth } from '../../lib/auth-context';

vi.mock('../../lib/auth-context', () => ({ useAuth: vi.fn() }));

const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('ReviewForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a sign-in prompt when signed out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as unknown as ReturnType<typeof useAuth>);
    render(<ReviewForm productId="prod_1" />);
    expect(screen.getByText(/sign in to write a review/i)).toBeInTheDocument();
  });

  it('submits a review and shows the pending-confirmation message', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user_1', getIdToken: mockGetIdToken },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'review_1', status: 'pending' }) });

    render(<ReviewForm productId="prod_1" />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Great frame' } });
    fireEvent.change(screen.getByLabelText(/your review/i), { target: { value: 'Really happy with it' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument());
  });

  it('shows the duplicate message on a 409 response', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'user_1', getIdToken: mockGetIdToken },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, json: () => Promise.resolve({ error: 'already reviewed' }) });

    render(<ReviewForm productId="prod_1" />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Great frame' } });
    fireEvent.change(screen.getByLabelText(/your review/i), { target: { value: 'Really happy with it' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/already reviewed/i)).toBeInTheDocument());
  });
});
