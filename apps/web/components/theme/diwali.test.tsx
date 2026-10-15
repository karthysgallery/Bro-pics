import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { THEME_PRESETS } from '@bro-pics/shared';
import { DiwaliNight } from './DiwaliNight';
import { FestivePromos } from './FestivePromos';
import { OfferCode } from './OfferCode';
import { priceWithOffer } from './FestiveOfferContext';

const diwali = THEME_PRESETS.find((t) => t.id === 'diwali')!.decor;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Diwali banner', () => {
  it('shows the greeting, the framed offer, the code and how long the offer runs', () => {
    vi.useFakeTimers({ now: new Date('2026-10-15T06:00:00Z'), toFake: ['Date'] });
    render(<DiwaliNight greeting={diwali.greeting!} offer={diwali.offer!} />);
    expect(screen.getByRole('heading', { name: 'Diwali Dhamaka' })).toBeTruthy();
    expect(screen.getByText('10% off everything with code DIWALIDHAMAKA')).toBeTruthy();
    expect(screen.getByText('DIWALIDHAMAKA')).toBeTruthy();
    expect(screen.getByText('Offer ends 10 November, 26 days left.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Shop Diwali gifts' }).getAttribute('href')).toBe('/category');
  });

  it('keeps the greeting but drops the code once the offer is over', () => {
    render(<DiwaliNight greeting={diwali.greeting!} offer={null} />);
    expect(screen.getByText('Happy Deepavali')).toBeTruthy();
    expect(screen.queryByText('DIWALIDHAMAKA')).toBeNull();
  });
});

describe('festive gift banners', () => {
  it('links each banner to its part of the shop and skips unsafe links', () => {
    render(<FestivePromos festival="Diwali" promos={[...diwali.promos!, { title: 'Bad', href: 'javascript:alert(1)', tone: 'night' }]} />);
    expect(screen.getByRole('heading', { name: 'Find a Diwali gift' })).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/category/frames-wall-decor', '/category/collage-combo-sets', '/category/personalized-gifts']);
  });
});

describe('offer code', () => {
  it('copies the code and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<OfferCode code="DIWALIDHAMAKA" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy code DIWALIDHAMAKA' }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith('DIWALIDHAMAKA');
  });

  it('works out the offer price the way checkout rounds a percent coupon', () => {
    expect(priceWithOffer(129900, diwali.offer!)).toBe(116910);
    expect(priceWithOffer(99, { code: 'X10', percentOff: 10, endsOn: '2026-11-10' })).toBe(89);
  });
});
