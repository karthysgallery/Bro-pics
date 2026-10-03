import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryTiles } from './CategoryTiles';
import type { Category } from '@bro-pics/shared';

const mockCategories: Category[] = [
  {
    id: 'cat_frames',
    name: 'Frames & Wall Décor',
    slug: 'frames-wall-decor',
    sortOrder: 1,
    isActive: true,
    image: '/placeholders/products/classic-wooden-photo-frame-1.svg',
    description: 'Frames collection',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cat_canvas',
    name: 'Canvas Prints',
    slug: 'canvas-prints',
    sortOrder: 2,
    isActive: true,
    image: '/placeholders/products/classic-wooden-photo-frame-2.svg',
    description: 'Canvas collection',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('CategoryTiles', () => {
  it('renders category links, names, and taglines', () => {
    render(<CategoryTiles title="Explore Collections" categories={mockCategories} />);

    expect(screen.getByText('Explore Collections')).toBeInTheDocument();
    expect(screen.getByText('Frames & Wall Décor')).toBeInTheDocument();
    expect(screen.getByText('Make your walls vibrant')).toBeInTheDocument();
    expect(screen.getByText('Canvas Prints')).toBeInTheDocument();
    expect(screen.getByText('Art that speaks')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    const categoryLink = links.find((l) => l.getAttribute('href') === '/category/frames-wall-decor');
    expect(categoryLink).toBeDefined();
  });

  it('renders nothing when categories array is empty', () => {
    const { container } = render(<CategoryTiles title="Explore Collections" categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
