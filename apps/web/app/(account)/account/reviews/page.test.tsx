import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyReviewsPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1', getIdToken: () => Promise.resolve('id-token') }, loading: false })),
}));

describe('MyReviewsPage', () => {
  it('[FE-01] shows an error instead of an infinite skeleton when the fetch itself throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    render(<MyReviewsPage />);

    expect(await screen.findByText('Could not load your reviews.')).toBeInTheDocument();
  });
});
