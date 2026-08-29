import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useProductFilters } from './use-product-filters';

function TestConsumer({ initialSearch }: { initialSearch: string }) {
  // Simulate the URLSearchParams a Next.js page would receive, by
  // constructing them directly rather than depending on next/navigation
  // (which requires a full router context this unit test doesn't set up).
  const params = new URLSearchParams(initialSearch);
  const { filters, toggleSize, toggleColour, setPriceRange, clearAll } = useProductFilters(params);

  return (
    <div>
      <span data-testid="sizes">{filters.sizes?.join(',') ?? ''}</span>
      <span data-testid="colours">{filters.colours?.join(',') ?? ''}</span>
      <span data-testid="min-price">{filters.minPrice ?? ''}</span>
      <button onClick={() => toggleSize('8x12 in')}>Toggle 8x12</button>
      <button onClick={() => toggleColour('Black')}>Toggle Black</button>
      <button onClick={() => setPriceRange(50000, 150000)}>Set price</button>
      <button onClick={clearAll}>Clear all</button>
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
});
