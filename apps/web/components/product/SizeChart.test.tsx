import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SizeChart } from './SizeChart';
import type { Variant } from '@bro-pics/shared';

function makeVariant(overrides: Partial<Variant>): Variant {
  return {
    id: 'v1', productId: 'p1', sku: 'SKU-1', sizeLabel: '8x10 in', widthIn: 8, heightIn: 10,
    frameColour: 'Black', material: 'Wood', price: 79900, stockStatus: 'in_stock',
    printWidthPx: 2400, printHeightPx: 3000, minUploadPx: 2400, aspectRatio: 0.8, isActive: true,
    ...overrides,
  };
}

describe('SizeChart', () => {
  it('shows a fallback message when there are no variants', () => {
    render(<SizeChart variants={[]} />);
    expect(screen.getByText(/aren't available/i)).toBeInTheDocument();
  });

  it('lists each distinct size with inches and centimetre dimensions', () => {
    const variants = [
      makeVariant({ id: 'v1', sizeLabel: '8x10 in', widthIn: 8, heightIn: 10, frameColour: 'Black' }),
      makeVariant({ id: 'v2', sizeLabel: '8x10 in', widthIn: 8, heightIn: 10, frameColour: 'White' }),
      makeVariant({ id: 'v3', sizeLabel: '12x18 in', widthIn: 12, heightIn: 18, frameColour: 'Black' }),
    ];
    render(<SizeChart variants={variants} />);

    // Deduped by sizeLabel: two rows, not three.
    expect(screen.getAllByText('8x10 in')).toHaveLength(1);
    expect(screen.getByText('12x18 in')).toBeInTheDocument();
    expect(screen.getByText('8 × 10 in')).toBeInTheDocument();
    expect(screen.getByText('20.3 × 25.4 cm')).toBeInTheDocument();
  });
});
