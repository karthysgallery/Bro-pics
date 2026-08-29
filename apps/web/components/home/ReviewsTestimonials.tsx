import type { Review } from '@bro-pics/shared';

interface ReviewsTestimonialsProps {
  title: string;
  reviews: Review[];
}

export function ReviewsTestimonials({ title, reviews }: ReviewsTestimonialsProps) {
  const average =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <section className="px-4 py-10 md:px-8 text-center">
      <h2 className="font-display text-2xl mb-2">{title}</h2>
      <p className="text-charcoal/70 mb-6">
        ★ {average.toFixed(1)} average from {reviews.length} reviews
      </p>
      <div className="flex gap-4 overflow-x-auto pb-2 justify-center">
        {reviews.slice(0, 6).map((review) => (
          <div key={review.id} className="w-64 flex-shrink-0 bg-surface rounded-lg p-4 text-left">
            <p className="text-sm">★ {review.rating}</p>
            <p className="font-medium">{review.title}</p>
            <p className="text-sm text-charcoal/70">{review.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
