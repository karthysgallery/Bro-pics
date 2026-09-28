import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ProductFilters } from './ProductFilters';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/category/frames-wall-decor',
}));

describe('[FE-44] ProductFilters accessibility', () => {
  it('has no axe violations with the desktop sidebar', async () => {
    const { container } = render(
      <ProductFilters
        availableSizes={['8x12 in', '12x18 in']}
        availableColours={['Black', 'White']}
        availableOrientations={['portrait', 'landscape']}
        initialSearch=""
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations with the mobile bottom sheet open', async () => {
    const { container } = render(
      <ProductFilters
        availableSizes={['8x12 in']}
        availableColours={['Black']}
        availableOrientations={['portrait']}
        initialSearch=""
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
