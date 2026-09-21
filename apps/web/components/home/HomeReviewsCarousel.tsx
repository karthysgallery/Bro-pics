import Link from 'next/link';
import Image from 'next/image';
import type { HomepageReview } from '../../lib/firestore-homepage';
import { RatingStars } from '../ui/RatingStars';
import { Section } from '../ui/Section';
import { SectionHeader } from '../ui/SectionHeader';

interface HomeReviewsCarouselProps {
  title: string;
  reviews: HomepageReview[];
}

// Cross-product customer reviews, unlike the per-product ReviewsSection on
// the PDP. Bordered here on purpose: these are quotes, not products, and the
// border is what stops them reading as another catalogue row.
export function HomeReviewsCarousel({ title, reviews }: HomeReviewsCarouselProps) {
  if (reviews.length === 0) return null;

  return (
    <Section>
      <SectionHeader title={title} />
      <div className="rail flex gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
        {reviews.slice(0, 6).map((review) => (
          <Link
            key={review.id}
            href={review.productSlug ? `/product/${review.productSlug}#reviews` : '#'}
            className="w-64 md:w-auto shrink-0 rounded-2xl border border-line bg-paper p-5 flex flex-col gap-2 hover:border-gold transition-colors"
          >
            <RatingStars rating={review.rating} />
            <p className="text-sm font-semibold text-ink">{review.title}</p>
            <p className="text-sm text-ink/60 line-clamp-3">{review.body}</p>
            {review.media[0] && (
              <div className="relative aspect-square rounded-xl overflow-hidden bg-tint mt-1">
                <Image src={review.media[0]} alt="" fill sizes="256px" className="object-cover" />
              </div>
            )}
          </Link>
        ))}
      </div>
    </Section>
  );
}
