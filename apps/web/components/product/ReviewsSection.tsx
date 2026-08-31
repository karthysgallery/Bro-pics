import type { Product, Review } from '@bro-pics/shared';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReviewsSection({ product, reviews }: { product: Product; reviews: Review[] }) {
  const sorted = [...reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <section id="reviews" className="mt-12">
      <h2 className="font-display text-2xl mb-4">Reviews</h2>

      {reviews.length === 0 ? (
        <p className="text-sm text-charcoal/70">No reviews yet — be the first to share yours.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl font-medium">{product.ratingAverage}</span>
            <span className="text-sm text-charcoal/70">({product.ratingCount} reviews)</span>
          </div>

          <div className="mb-6 max-w-sm">
            {breakdown.map(({ star, count }) => (
              <div key={star} data-testid="rating-breakdown-row" className="flex items-center gap-2 text-xs mb-1">
                <span className="w-8">{star}★</span>
                <div className="flex-1 h-2 bg-cream rounded-full overflow-hidden">
                  <div className="h-full bg-terracotta" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            ))}
          </div>

          <ul className="space-y-4">
            {sorted.map((review) => (
              <li key={review.id} className="border-b border-charcoal/10 pb-4">
                <div className="flex items-center justify-between">
                  <span data-testid="review-title" className="font-medium text-sm">{review.title}</span>
                  <span className="text-xs text-charcoal/50">{formatDate(review.createdAt)}</span>
                </div>
                <p className="text-xs text-sage mb-1">{'★'.repeat(review.rating)}{review.isVerified && ' · Verified purchase'}</p>
                <p className="text-sm text-charcoal/80">{review.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
