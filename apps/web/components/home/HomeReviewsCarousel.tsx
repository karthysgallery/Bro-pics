import Link from 'next/link';
import type { HomepageReview } from '../../lib/firestore-homepage';
import { Section } from '../ui/Section';

interface HomeReviewsCarouselProps {
  title?: string;
  reviews?: HomepageReview[];
}

const DEFAULT_REVIEWS = [
  {
    id: 'rev_1',
    rating: 5,
    title: '"Our wedding photo finally has a home."',
    body: 'The print is gorgeous and the black frame feels so well made. Arrived beautifully packed.',
    author: 'Meera Iyer',
    location: 'Bengaluru',
  },
  {
    id: 'rev_2',
    rating: 5,
    title: '"A little gallery of our favourite days."',
    body: 'The preview made it easy to get the crops right. Our living room feels like us now.',
    author: 'Rohan Nair',
    location: 'Kochi',
  },
  {
    id: 'rev_3',
    rating: 5,
    title: '"Better than another photo on my phone."',
    body: 'Ordered the oak frame for my parents. Such a thoughtful gift, and delivery was right on time.',
    author: 'Divya Kapoor',
    location: 'Delhi',
  },
];

export function HomeReviewsCarousel({
  title = 'Loved in real homes.',
  reviews,
}: HomeReviewsCarouselProps) {
  const displayReviews =
    reviews && reviews.length > 0
      ? reviews.slice(0, 3).map((r, i) => ({
          id: r.id,
          rating: r.rating,
          title: r.title ? `"${r.title.replace(/^"|"$/g, '')}"` : DEFAULT_REVIEWS[i % 3].title,
          body: r.body || DEFAULT_REVIEWS[i % 3].body,
          author: DEFAULT_REVIEWS[i % 3].author,
          location: DEFAULT_REVIEWS[i % 3].location,
        }))
      : DEFAULT_REVIEWS;

  return (
    <Section>
      <div className="flex flex-col gap-10">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-line/50 pb-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink">{title}</h2>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="text-[#FCA311]">★★★★★</span>
            <span>4.9/5 · Verified customers</span>
          </div>
        </div>

        {/* 3 Testimonial Cards matching Figma */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayReviews.map((review) => (
            <div
              key={review.id}
              className="rounded-2xl border border-line bg-paper p-6 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="flex flex-col gap-3">
                <span className="text-[#FCA311] text-xs">★★★★★</span>
                <h3 className="text-sm font-bold text-ink leading-snug">{review.title}</h3>
                <p className="text-xs text-ink/70 leading-relaxed">{review.body}</p>
              </div>

              <div className="pt-2 border-t border-line/40">
                <p className="text-2xs font-semibold text-ink/60">
                  {review.author} · {review.location}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Dark Navy CTA Banner matching Figma */}
        <div className="rounded-3xl bg-[#14213D] text-paper p-8 sm:p-10 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-6 mt-4 shadow-lg">
          <div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-paper">
              Your favourite photo is waiting to be framed.
            </h3>
            <p className="text-sm text-paper/70 mt-2">
              Make something personal. We&apos;ll take care of the craft.
            </p>
          </div>

          <Link
            href="/category"
            className="self-start md:self-auto shrink-0 rounded-full bg-gold text-ink px-7 py-3 text-sm font-semibold hover:bg-gold-deep transition-all shadow-md active:scale-95"
          >
            Create your frame →
          </Link>
        </div>
      </div>
    </Section>
  );
}

