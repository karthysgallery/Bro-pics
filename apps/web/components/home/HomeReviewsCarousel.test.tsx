import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeReviewsCarousel } from './HomeReviewsCarousel';
import type { HomepageReview } from '../../lib/firestore-homepage';

vi.mock('../../lib/media-public-url', () => ({
  buildPublicMediaUrl: (path: string) => `https://cdn.test/${path}`,
}));

function review(overrides: Partial<HomepageReview> = {}): HomepageReview {
  return {
    id: 'r1',
    productId: 'p1',
    userId: 'u1',
    rating: 5,
    title: 'Lovely',
    body: 'Arrived well packed.',
    media: [],
    isVerified: true,
    status: 'approved',
    createdAt: new Date(),
    productSlug: 'classic',
    ...overrides,
  };
}

describe('HomeReviewsCarousel', () => {
  it('shows no invented reviews or names when there are none, only the closing CTA', () => {
    render(<HomeReviewsCarousel reviews={[]} />);
    expect(screen.queryByText(/verified review/)).not.toBeInTheDocument();
    expect(screen.queryByText('Meera Iyer')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your frame' })).toBeInTheDocument();
  });

  it('computes the average and count from the real reviews', () => {
    render(<HomeReviewsCarousel reviews={[review({ id: 'a', rating: 5 }), review({ id: 'b', rating: 4 })]} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2 verified reviews')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'See this frame' })[0]).toHaveAttribute('href', '/product/classic');
  });

  it('shows a customer photo only for public Storage paths', () => {
    render(
      <HomeReviewsCarousel
        reviews={[review({ id: 'a', media: ['private/x.jpg'] }), review({ id: 'b', media: ['public/reviews/b.jpg'] })]}
      />
    );
    const photos = screen.getAllByAltText('Photo shared by the customer');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAttribute('src', 'https://cdn.test/public/reviews/b.jpg');
  });
});
