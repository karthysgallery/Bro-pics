import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductFilters } from './ProductFilters';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/category/frames-wall-decor',
}));

describe('ProductFilters', () => {
  it('[FE-30] opens a bottom sheet on mobile when Filters is clicked, and closes it on Done', () => {
    render(
      <ProductFilters
        availableSizes={['8x12 in']}
        availableColours={['Black']}
        availableOrientations={['portrait']}
        initialSearch=""
      />
    );
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  });

  it('[FE-30] navigates with a minRating param when a rating chip is clicked', () => {
    render(
      <ProductFilters
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        initialSearch=""
      />
    );
    const ratingChips = screen.getAllByText('4★ & up');
    fireEvent.click(ratingChips[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('minRating=4'));
  });

  it('[FE-30] navigates with an inStockOnly param when the availability checkbox is toggled', () => {
    render(
      <ProductFilters
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        initialSearch=""
      />
    );
    const checkboxes = screen.getAllByLabelText('In stock only');
    fireEvent.click(checkboxes[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('inStockOnly=true'));
  });

  it('[FE-30] navigates with a sort param when the sort select changes', () => {
    render(
      <ProductFilters
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        initialSearch=""
      />
    );
    const sortSelects = screen.getAllByLabelText('Sort by');
    fireEvent.change(sortSelects[0], { target: { value: 'price_asc' } });
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sort=price_asc'));
  });
});
