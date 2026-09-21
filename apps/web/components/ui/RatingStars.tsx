import { GOLD, LINE } from '../../lib/design-tokens';

// Stars are drawn as solid shapes in two tones rather than filled/outlined —
// at the 12–14px sizes a catalogue row uses, an outlined star turns to mush.
// Filled is `gold`, which is what a rating row reads as and one of the few
// places the palette's accent gets to be a large graphic element; empty is
// `line`.
const FILLED = GOLD;
const EMPTY = LINE;

interface RatingStarsProps {
  rating: number;
  size?: number;
}

export function RatingStars({ rating, size = 13 }: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="inline-flex items-center gap-px" aria-label={`${rating} out of 5 stars`}>
      {stars.map((star) => (
        <svg
          key={star}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill={star <= Math.round(rating) ? FILLED : EMPTY}
          aria-hidden="true"
        >
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
