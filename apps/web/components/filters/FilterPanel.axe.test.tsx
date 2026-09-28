import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FilterPanel } from './FilterPanel';

describe('[FE-44] FilterPanel accessibility', () => {
  it('has no axe violations with every filter section shown', async () => {
    const { container } = render(
      <FilterPanel
        availableSizes={['8x12 in']}
        availableColours={['Black']}
        availableOrientations={['portrait']}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
        minRating={4}
        onSetMinRating={vi.fn()}
        inStockOnly={true}
        onToggleInStockOnly={vi.fn()}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
