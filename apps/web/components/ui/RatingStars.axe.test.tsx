import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { RatingStars } from './RatingStars';

describe('[FE-44] RatingStars accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<RatingStars rating={4} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('exposes its rating via an accessible name (role="img" + aria-label)', () => {
    render(<RatingStars rating={4} />);
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
  });
});
