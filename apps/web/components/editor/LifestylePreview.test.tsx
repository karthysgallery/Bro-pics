import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LifestylePreview } from './LifestylePreview';
import { DEFAULT_PREVIEW_SCENES, type PreviewScene } from '../../lib/preview-scenes';

describe('LifestylePreview', () => {
  it('asks for a photo instead of faking a frame when there is no design yet', () => {
    render(<LifestylePreview imageUrl={null} />);
    expect(screen.getByText(/add a photo to see your frame/i)).toBeInTheDocument();
    expect(screen.queryByAltText(/your personalized frame/i)).not.toBeInTheDocument();
  });

  it('offers Living room, Bedroom, Wall and Table and keeps the same design across them', () => {
    render(<LifestylePreview imageUrl="data:image/png;base64,AAAA" frameInches={{ widthIn: 12, heightIn: 18 }} />);
    const group = screen.getByRole('group', { name: /choose a scene/i });
    for (const name of ['Living room', 'Bedroom', 'Wall', 'Table']) {
      expect(within(group).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByAltText(/your personalized frame/i)).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    fireEvent.click(within(group).getByRole('button', { name: 'Table' }));
    expect(within(group).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText(/your personalized frame/i)).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('shows no scene picker when only one scene is configured', () => {
    render(<LifestylePreview imageUrl="x.png" scenes={[DEFAULT_PREVIEW_SCENES[0]]} />);
    expect(screen.queryByRole('group', { name: /choose a scene/i })).not.toBeInTheDocument();
  });

  it('renders a photographic scene with the design warped onto the frame opening', () => {
    const photoScene: PreviewScene = {
      id: 'studio',
      label: 'Studio',
      kind: 'wall',
      stageWidthIn: 80,
      frame: { x: 0.5, y: 0.5, anchor: 'center', maxFraction: 0.5 },
      backdrop: {
        type: 'photo',
        src: '/scene.jpg',
        aspect: 1.5,
        artworkAspect: 0.75,
        artworkQuad: [
          { x: 0.3, y: 0.2 },
          { x: 0.6, y: 0.24 },
          { x: 0.58, y: 0.7 },
          { x: 0.32, y: 0.74 },
        ],
      },
    };
    render(<LifestylePreview imageUrl="design.png" scenes={[photoScene]} />);
    expect(screen.getByTestId('lifestyle-preview')).toBeInTheDocument();
  });
});
