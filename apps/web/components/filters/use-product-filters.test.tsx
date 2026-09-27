import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useProductFilters } from './use-product-filters';

function TestConsumer({ initialSearch }: { initialSearch: string }) {
  // Simulate the URLSearchParams a Next.js page would receive, by
  // constructing them directly rather than depending on next/navigation
  // (which requires a full router context this unit test doesn't set up).
  const params = new URLSearchParams(initialSearch);
  const { filters, toggleSize, toggleColour, setPriceRange, setMinRating, toggleInStockOnly, setSort, clearAll } =
    useProductFilters(params);

  return (
    <div>
      <span data-testid="sizes">{filters.sizes?.join(',') ?? ''}</span>
      <span data-testid="colours">{filters.colours?.join(',') ?? ''}</span>
      <span data-testid="min-price">{filters.minPrice ?? ''}</span>
      <span data-testid="min-rating">{filters.minRating ?? ''}</span>
      <span data-testid="in-stock-only">{String(filters.inStockOnly ?? false)}</span>
      <span data-testid="sort">{filters.sort ?? ''}</span>
      <button onClick={() => toggleSize('8x12 in')}>Toggle 8x12</button>
      <button onClick={() => toggleColour('Black')}>Toggle Black</button>
      <button onClick={() => setPriceRange(50000, 150000)}>Set price</button>
      <button onClick={() => setMinRating(4)}>Set min rating 4</button>
      <button onClick={() => setMinRating(null)}>Clear min rating</button>
      <button onClick={toggleInStockOnly}>Toggle in stock only</button>
      <button onClick={() => setSort('price_asc')}>Sort price asc</button>
      <button onClick={clearAll}>Clear all</button>
    </div>
  );
}

function PageResetConsumer({ initialSearch }: { initialSearch: string }) {
  const params = new URLSearchParams(initialSearch);
  const { toggleSize, setMinRating, toggleInStockOnly, setSort } = useProductFilters(params);
  return (
    <div>
      <span data-testid="after-toggle-size">{toggleSize('8x12 in').get('page') ?? 'none'}</span>
      <span data-testid="after-min-rating">{setMinRating(4).get('page') ?? 'none'}</span>
      <span data-testid="after-in-stock">{toggleInStockOnly().get('page') ?? 'none'}</span>
      <span data-testid="after-sort">{setSort('newest').get('page') ?? 'none'}</span>
    </div>
  );
}

describe('useProductFilters', () => {
  it('parses sizes and colours from the initial URL params', () => {
    render(<TestConsumer initialSearch="size=8x12+in&colour=Black" />);
    expect(screen.getByTestId('sizes').textContent).toBe('8x12 in');
    expect(screen.getByTestId('colours').textContent).toBe('Black');
  });

  it('builds the correct SearchFilters shape from URL params', () => {
    render(<TestConsumer initialSearch="minPrice=50000&maxPrice=150000" />);
    expect(screen.getByTestId('min-price').textContent).toBe('50000');
  });

  it('returns an empty filters object for an empty query string', () => {
    render(<TestConsumer initialSearch="" />);
    expect(screen.getByTestId('sizes').textContent).toBe('');
  });

  it('[FE-30] parses minRating, inStockOnly, and sort from the initial URL params', () => {
    render(<TestConsumer initialSearch="minRating=4&inStockOnly=true&sort=price_asc" />);
    expect(screen.getByTestId('min-rating').textContent).toBe('4');
    expect(screen.getByTestId('in-stock-only').textContent).toBe('true');
    expect(screen.getByTestId('sort').textContent).toBe('price_asc');
  });

  it('[FE-30] setMinRating(null) clears the param entirely rather than setting minRating=null', () => {
    function RatingConsumer({ initialSearch }: { initialSearch: string }) {
      const params = new URLSearchParams(initialSearch);
      const { setMinRating } = useProductFilters(params);
      return <span data-testid="cleared">{setMinRating(null).has('minRating') ? 'has-rating' : 'no-rating'}</span>;
    }
    render(<RatingConsumer initialSearch="minRating=4" />);
    expect(screen.getByTestId('cleared').textContent).toBe('no-rating');
  });

  it("[FE-30] setSort(relevance) clears the sort param since relevance is the default, and a real sort sets it", () => {
    function SortConsumer({ initialSearch }: { initialSearch: string }) {
      const params = new URLSearchParams(initialSearch);
      const { setSort } = useProductFilters(params);
      return (
        <div>
          <span data-testid="cleared">{setSort('relevance').has('sort') ? 'has-sort' : 'no-sort'}</span>
          <span data-testid="set">{setSort('price_asc').get('sort')}</span>
        </div>
      );
    }
    render(<SortConsumer initialSearch="sort=newest" />);
    expect(screen.getByTestId('cleared').textContent).toBe('no-sort');
    expect(screen.getByTestId('set').textContent).toBe('price_asc');
  });

  it('[FE-30] every filter setter resets page back to none/1, never keeping a stale page number', () => {
    render(<PageResetConsumer initialSearch="page=3" />);
    expect(screen.getByTestId('after-toggle-size').textContent).toBe('none');
    expect(screen.getByTestId('after-min-rating').textContent).toBe('none');
    expect(screen.getByTestId('after-in-stock').textContent).toBe('none');
    expect(screen.getByTestId('after-sort').textContent).toBe('none');
  });
});
