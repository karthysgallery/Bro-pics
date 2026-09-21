import type { Product, Review } from '@bro-pics/shared';
import { ReviewForm } from './ReviewForm';
import { RatingStars } from '../ui/RatingStars';

// review.createdAt arrives as a real Date in some paths and as an
// ISO-8601 string in others (server components that route Firestore data
// through serializeDoc for RSC-boundary safety produce strings) — accept
// either rather than assuming one shape.
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatDate(date: Date | string): string {
  return toDate(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReviewsSection({ product, reviews }: { product: Product; reviews: Review[] }) {
  const sorted = [...reviews].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <section id="reviews" className="mt-12">
      <h2 className="text-xl md:text-2xl font-semibold text-ink mb-4">Reviews</h2>

      {reviews.length === 0 ? (
        <p className="text-sm text-ink/70">No reviews yet — be the first to share yours.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl font-semibold text-ink">{product.ratingAverage}</span>
            <span className="text-sm text-ink/70">({product.ratingCount} reviews)</span>
          </div>

          <div className="mb-6 max-w-sm">
            {breakdown.map(({ star, count }) => (
              <div key={star} data-testid="rating-breakdown-row" className="flex items-center gap-2 text-xs mb-1">
                <span className="w-8">{star}★</span>
                <div className="flex-1 h-1.5 bg-tint rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            ))}
          </div>

          <ul className="space-y-4">
            {sorted.map((review) => (
              <li key={review.id} className="border-b border-line pb-4">
                <div className="flex items-center justify-between">
                  <span data-testid="review-title" className="font-medium text-sm">{review.title}</span>
                  <span className="text-xs text-ink/50">{formatDate(review.createdAt)}</span>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-ink/50 mb-1">
                  <RatingStars rating={review.rating} size={12} />
                  {review.isVerified && <span>· Verified purchase</span>}
                </p>
                <p className="text-sm text-ink/80">{review.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <ReviewForm productId={product.id} />
    </section>
  );
}
