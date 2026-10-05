import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrustReels, type TrustReel } from './TrustReels';

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  // jsdom has no canvas: report no WebGL so the card rail renders.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
});

const reels: TrustReel[] = [
  { id: 'a', kind: 'making', caption: 'Mitring the frame', src: '/a.mp4', poster: null, productSlug: 'classic' },
  { id: 'b', kind: 'unboxing', caption: 'Opening day', src: '/b.mp4', poster: null, productSlug: null },
  { id: 'c', kind: 'feedback', caption: 'It looks lovely', src: '/c.mp4', poster: null, productSlug: null },
];

describe('TrustReels', () => {
  it('renders nothing without videos', () => {
    const { container } = render(<TrustReels reels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the Why us heading and one card per clip', () => {
    render(<TrustReels reels={reels} />);
    expect(screen.getByText('Why us?')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Play video/ })).toHaveLength(3);
  });

  it('filters by what the clip shows, offering only kinds that exist', () => {
    render(<TrustReels reels={reels.slice(0, 2)} />);
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Package opening' }));
    expect(screen.getAllByRole('button', { name: /^Play video/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Package opening' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a full-screen viewer, links to the product, and closes with Escape', async () => {
    render(<TrustReels reels={reels} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play video: Mitring the frame' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View this frame' })).toHaveAttribute('href', '/product/classic');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
