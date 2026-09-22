import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProductMedia } from '@bro-pics/shared';
import { GalleryStrip } from './GalleryStrip';

const media: ProductMedia[] = [
  { id: 'm1', productId: 'prod_1', variantId: null, type: 'image', url: '/one.jpg', alt: 'Photo one', sortOrder: 0 },
  { id: 'm2', productId: 'prod_1', variantId: null, type: 'image', url: '/two.jpg', alt: 'Photo two', sortOrder: 1 },
];

describe('GalleryStrip', () => {
  it('renders nothing when there is no media', () => {
    const { container } = render(<GalleryStrip media={[]} productTitle="Test Product" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one thumbnail button per media item', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('opens a Lightbox with the clicked item when a thumbnail is clicked', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /view product photo 2/i }));
    expect(screen.getByRole('img', { name: 'Photo two' })).toBeInTheDocument();
  });

  it('closes the Lightbox on backdrop click', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /view product photo 1/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
