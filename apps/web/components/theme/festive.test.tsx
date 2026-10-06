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

import { FestiveGarland } from './FestiveGarland';
import { FestiveHanging } from './FestiveHanging';
import { FestiveGreeting } from './FestiveGreeting';
import { THEME_GARLANDS, THEME_HANGINGS, THEME_GREETING_ART } from '@bro-pics/shared';

describe('festival garlands, ornaments and greetings', () => {
  it('draws every garland and every hanging ornament, and nothing for none', () => {
    for (const g of THEME_GARLANDS) {
      const { container, unmount } = render(<FestiveGarland garland={g} />);
      expect(container.querySelector('svg') !== null, g).toBe(g !== 'none');
      unmount();
    }
    for (const h of THEME_HANGINGS) {
      const { container, unmount } = render(<FestiveHanging hanging={h} />);
      expect(container.querySelectorAll('.festive-swing').length, h).toBe(h === 'none' ? 0 : 6);
      unmount();
    }
  });

  it('shows the greeting with every picture, and only safe button links', () => {
    for (const art of THEME_GREETING_ART) {
      const { getByRole, unmount, container } = render(<FestiveGreeting greeting={{ title: 'Happy Diwali', subtitle: 'Hello', ctaLabel: 'Shop', ctaHref: '/category', art }} />);
      expect(getByRole('heading', { name: 'Happy Diwali' })).toBeTruthy();
      expect(getByRole('link', { name: 'Shop' }).getAttribute('href')).toBe('/category');
      expect(container.querySelector('[aria-hidden="true"] svg') !== null || art === 'none').toBe(true);
      unmount();
    }
    const { queryByRole } = render(<FestiveGreeting greeting={{ title: 'X', ctaLabel: 'Bad', ctaHref: 'javascript:alert(1)', art: 'none' }} />);
    expect(queryByRole('link')).toBeNull();
  });
});
