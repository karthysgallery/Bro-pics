import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DpiBadge } from './DpiBadge';

describe('DpiBadge', () => {
  it('shows a green badge at or above 300 dpi', () => {
    render(<DpiBadge effectiveDpi={320} />);
    expect(screen.getByText(/good quality/i)).toBeInTheDocument();
  });

  it('shows an amber badge between 150 and 299 dpi', () => {
    render(<DpiBadge effectiveDpi={200} />);
    expect(screen.getByText(/lower quality/i)).toBeInTheDocument();
  });

  it('shows a red badge below 150 dpi', () => {
    render(<DpiBadge effectiveDpi={80} />);
    expect(screen.getByText(/too low/i)).toBeInTheDocument();
  });
});
