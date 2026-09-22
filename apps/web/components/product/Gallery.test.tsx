import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProductMedia } from '@bro-pics/shared';
import { Gallery } from './Gallery';

const media: ProductMedia[] = [
  { id: 'm1', productId: 'prod_1', variantId: null, type: 'image', url: '/one.jpg', alt: 'Photo one', sortOrder: 0 },
  { id: 'm2', productId: 'prod_1', variantId: null, type: 'image', url: '/two.jpg', alt: 'Photo two', sortOrder: 1 },
];

describe('Gallery', () => {
  it('renders a placeholder tile when there is no media', () => {
    const { container } = render(<Gallery media={[]} productTitle="Test Product" />);
    expect(container.querySelector('.aspect-square')).toBeInTheDocument();
  });

  it('shows the first media item by default', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    expect(screen.getByRole('img', { name: 'Photo one' })).toBeInTheDocument();
  });

  it('switches the active image when a thumbnail is clicked', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /show media 2/i }));
    expect(screen.getByRole('img', { name: 'Photo two' })).toBeInTheDocument();
  });

  it('opens a Lightbox when the active image is clicked, and closes it on backdrop click', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('img', { name: 'Photo one' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
