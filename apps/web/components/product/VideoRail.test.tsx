import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoRail } from './VideoRail';
import type { ProductMedia } from '@bro-pics/shared';

describe('VideoRail', () => {
  it('renders nothing when there is no video media', () => {
    const { container } = render(<VideoRail media={[{ id: 'm1', productId: 'p1', variantId: null, type: 'image', url: '/a.svg', alt: '', sortOrder: 0 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a video element for each video media item', () => {
    const media: ProductMedia[] = [
      { id: 'm1', productId: 'p1', variantId: null, type: 'video', url: '/clip.mp4', alt: 'In motion', sortOrder: 0 },
    ];
    render(<VideoRail media={media} />);
    expect(screen.getByTestId('video-rail')).toBeInTheDocument();
  });
});
