import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSlider } from './HeroSlider';
import type { HomepageSection } from '@bro-pics/shared';

function makeSection(overrides: Partial<HomepageSection> = {}): HomepageSection {
  return {
    id: 'sec_hero',
    type: 'hero_slider',
    title: 'Handcrafted with Love',
    subtitle: 'Personalized photo frames made just for you',
    image: '/banners/gallery-wall.png',
    mobileImage: '',
    link: '/category/all',
    sortOrder: 1,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
    ...overrides,
  };
}

describe('HeroSlider', () => {
  it('[FE-26] renders a single doc with no heroSlides as exactly one slide (unchanged behavior)', () => {
    render(<HeroSlider sections={[makeSection()]} />);
    expect(screen.getByText('Handcrafted with Love')).toBeInTheDocument();
    // aria-label on the single (only) slide group.
    expect(screen.getByLabelText('1 of 1')).toBeInTheDocument();
  });

  it('[FE-26] expands a doc with a heroSlides array into that many slides, sorted by sortOrder', () => {
    const section = makeSection({
      heroSlides: [
        { id: 'slide_b', image: '/b.jpg', mobileImage: '/b-m.jpg', title: 'Second slide', sortOrder: 1 },
        { id: 'slide_a', image: '/a.jpg', mobileImage: '/a-m.jpg', title: 'First slide', sortOrder: 0, ctaLabel: 'Shop frames', ctaLink: '/category/frames' },
      ],
    });
    render(<HeroSlider sections={[section]} />);
    expect(screen.getByLabelText('1 of 2')).toBeInTheDocument();
    expect(screen.getByLabelText('2 of 2')).toBeInTheDocument();
    // The first-by-sortOrder slide's own title/CTA are what's active initially.
    expect(screen.getByText('First slide')).toBeInTheDocument();
    expect(screen.getByText('Shop frames')).toBeInTheDocument();
  });
});
