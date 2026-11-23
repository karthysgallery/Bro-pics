import { paperSizeName, type Variant } from '@bro-pics/shared';

type SizeLike = Pick<Variant, 'sizeLabel' | 'widthIn' | 'heightIn'>;

/**
 * Which size wears the "Most loved size" badge. A merchandising choice, not a sales statistic: A3 (12×18) when the
 * product sells it, otherwise the largest size. No badge when there is only one size or no size information.
 */
export function mostLovedSize(sizes: SizeLike[]): string | null {
  const unique = [...new Map(sizes.filter((s) => s.widthIn > 0 && s.heightIn > 0).map((s) => [s.sizeLabel, s])).values()];
  if (unique.length < 2) return null;
  const a3 = unique.find((s) => paperSizeName(s) === 'A3');
  if (a3) return a3.sizeLabel;
  return unique.reduce((big, s) => (s.widthIn * s.heightIn > big.widthIn * big.heightIn ? s : big)).sizeLabel;
}

const is12x18 = (v: Pick<Variant, 'widthIn' | 'heightIn'>) => Math.max(v.widthIn, v.heightIn) === 18 && Math.min(v.widthIn, v.heightIn) === 12;

/**
 * The variant a product page opens on: the one asked for (a cart line, a link), else 12×18 in stock (the shop's
 * default size, in the same frame and orientation as the first in-stock variant when possible), else the first in
 * stock, else the first.
 */
export function defaultVariant<V extends Pick<Variant, 'id' | 'widthIn' | 'heightIn' | 'stockStatus' | 'frameColour'>>(
  variants: V[],
  requestedId?: string
): V | null {
  const requested = requestedId ? variants.find((v) => v.id === requestedId) : undefined;
  if (requested) return requested;
  const firstInStock = variants.find((v) => v.stockStatus === 'in_stock') ?? null;
  const twelveEighteen = variants.filter((v) => v.stockStatus === 'in_stock' && is12x18(v));
  if (twelveEighteen.length) {
    const sameLook = firstInStock
      ? twelveEighteen.find((v) => v.frameColour === firstInStock.frameColour && (v.widthIn > v.heightIn) === (firstInStock.widthIn > firstInStock.heightIn))
      : undefined;
    return sameLook ?? twelveEighteen[0];
  }
  return firstInStock ?? variants[0] ?? null;
}
