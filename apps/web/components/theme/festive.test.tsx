import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FestiveBand } from './FestiveBand';
import { FestiveEffect } from './FestiveEffect';

describe('festive decorations', () => {
  it('draws an ornament band for a motif and nothing for none, each with its own pattern', () => {
    const { container, rerender } = render(
      <>
        <FestiveBand motif="diya" />
        <FestiveBand motif="diya" />
      </>
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    rerender(<FestiveBand motif="none" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('animates, but not for visitors who ask for reduced motion', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMedia);
    const { container, unmount } = render(<FestiveEffect effect="snow" />);
    expect(container.querySelectorAll('.festive-fall').length).toBeGreaterThan(0);
    unmount();
    matchMedia.mockReturnValue({ matches: true });
    const reduced = render(<FestiveEffect effect="snow" />);
    expect(reduced.container.querySelector('.festive-effect')).toBeNull();
    vi.unstubAllGlobals();
  });
});
