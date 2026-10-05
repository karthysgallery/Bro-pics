import Link from 'next/link';
import type { HomepageReview } from '../../lib/firestore-homepage';
import { buildPublicMediaUrl } from '../../lib/media-public-url';
import { Section } from '../ui/Section';

interface HomeReviewsCarouselProps {
  title?: string;
  reviews?: HomepageReview[];
}

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= rating ? '#FCA311' : '#E0DAD1'} aria-hidden="true">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

// Review photos are stored as `public/...` Storage paths. Anything else, or a
// missing bucket config, just means the card renders without a photo.
function reviewPhotoUrl(review: HomepageReview): string | null {
  const path = review.media.find((p) => p.startsWith('public/'));
  if (!path) return null;
  try {
    return buildPublicMediaUrl(path);
  } catch {
    return null;
  }
}

/**
 * Customer reviews as a swipeable row on phones and a three-up grid on wider
 * screens. Everything shown is a real approved review: the summary is
 * computed from them, and a card never carries a name the review doesn't have.
 * With no reviews yet the section is omitted — only the closing call to action remains.
 */
export function HomeReviewsCarousel({ title = 'Loved in real homes.', reviews = [] }: HomeReviewsCarouselProps) {
  const shown = reviews.slice(0, 6);
  const average = shown.length > 0 ? shown.reduce((sum, r) => sum + r.rating, 0) / shown.length : 0;

  return (
    <Section>
      <div className="flex flex-col gap-10 md:gap-12">
        {shown.length > 0 && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">{title}</h2>
              <div className="flex items-center gap-3">
                <span className="font-display text-4xl font-bold text-ink leading-none tabular-nums">
                  {average.toFixed(1)}
                </span>
                <div className="flex flex-col gap-1">
                  <Stars rating={Math.round(average)} />
                  <span className="text-[12px] text-ink/55">
                    {shown.length} verified {shown.length === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rail -mx-4 px-4 md:mx-0 md:px-0 flex md:grid md:grid-cols-3 gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2">
              {shown.map((review) => {
                const photo = reviewPhotoUrl(review);
                return (
                  <article
                    key={review.id}
                    className="snap-start shrink-0 w-[84%] sm:w-[46%] md:w-auto rounded-card border border-line bg-paper overflow-hidden flex flex-col"
                  >
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Storage URL, shown once, below the fold
                      <img src={photo} alt="Photo shared by the customer" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    )}
                    <div className="flex flex-1 flex-col justify-between gap-5 p-6">
                      <div className="flex flex-col gap-3">
                        <Stars rating={review.rating} />
                        <h3 className="font-display text-lg font-bold leading-snug text-ink">
                          &ldquo;{review.title.replace(/^"|"$/g, '')}&rdquo;
                        </h3>
                        <p className="text-[14px] text-ink/65 leading-relaxed line-clamp-5">{review.body}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-4 border-t border-line/60 text-[12px]">
                        <span className="font-semibold text-ink/70">
                          {review.isVerified ? 'Verified buyer' : 'Customer review'}
                        </span>
                        {review.productSlug && (
                          <Link href={`/product/${review.productSlug}`} className="font-medium text-accent hover:underline">
                            See this frame
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-card bg-ink text-paper p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-paper leading-tight tracking-tight">
              Your favourite photo is waiting to be framed.
            </h3>
            <p className="text-[14px] text-paper/60 mt-2">Choose a frame, upload your photo and preview it before you pay.</p>
          </div>
          <Link
            href="/category"
            className="self-start md:self-auto shrink-0 bg-gold text-ink px-6 py-3 text-[14px] font-semibold rounded-btn hover:bg-gold-deep transition-colors btn-press"
          >
            Create your frame
          </Link>
        </div>
      </div>
    </Section>
  );
}
