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

  it('[FE-38] shows a "Pending reviews" prompt for a delivered item with no review yet, linking to its review form', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url === '/api/reviews/mine') {
        return Promise.resolve({ ok: true, json: async () => ({ reviews: [] }) });
      }
      if (url === '/api/reviews/pending') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            pending: [{ productId: 'prod_1', title: 'Classic Wooden Frame', orderId: 'order_1', slug: 'classic-wooden-frame' }],
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;

    render(<MyReviewsPage />);

    expect(await screen.findByText('Pending reviews')).toBeInTheDocument();
    expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument();
    const link = screen.getByText('Write a review');
    expect(link).toHaveAttribute('href', '/product/classic-wooden-frame#reviews');
  });

  it('[FE-38] shows no "Pending reviews" section when there is nothing pending', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url === '/api/reviews/mine') {
        return Promise.resolve({ ok: true, json: async () => ({ reviews: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ pending: [] }) });
    }) as unknown as typeof fetch;

    render(<MyReviewsPage />);

    await screen.findByText('No reviews yet');
    expect(screen.queryByText('Pending reviews')).not.toBeInTheDocument();
  });
});
