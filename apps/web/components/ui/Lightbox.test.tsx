import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lightbox } from './Lightbox';

describe('Lightbox', () => {
  it('renders the image with the given src and alt', () => {
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'A test photo' })).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
