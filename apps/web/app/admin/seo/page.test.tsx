import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeoAdminPage from './page';

vi.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ user: { getIdToken: () => Promise.resolve('mock-token') }, loading: false, signOut: vi.fn() }),
}));

const status = (over: Record<string, unknown> = {}) => ({
  googleVerified: false,
  businessMissing: ['Shop address'],
  businessName: 'KarthysGallery',
  legalPages: [
    { slug: 'about', live: true },
    { slug: 'privacy', live: false },
  ],
  products: { published: 3, indexable: 3, weak: [{ id: 'p1', title: 'Heart Collage', score: 60 }], weakCount: 1 },
  landingPages: [
    { slug: 'photo-collage-frames', title: 'Photo Collage Frames', keyword: 'photo collage frame', products: 2, url: 'https://karthysgallery.in/photo-frames/photo-collage-frames' },
    { slug: 'calendar-photo-frames', title: 'Calendar Photo Frames', keyword: 'calendar photo frame', products: 0, url: 'https://karthysgallery.in/photo-frames/calendar-photo-frames' },
  ],
  links: { sitemap: 'https://karthysgallery.in/sitemap.xml', merchantFeed: 'https://karthysgallery.in/feeds/google-merchant.xml', site: 'https://karthysgallery.in/' },
  ...over,
});

function mockFetch(body: unknown, ok = true) {
  global.fetch = vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 403, json: () => Promise.resolve(body) })) as unknown as typeof fetch;
}

describe('Google & SEO admin page', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the owner the Search Console steps, what is missing and which pages are not live', async () => {
    mockFetch(status());
    render(<SeoAdminPage />);
    expect(await screen.findByText('1. Connect Google Search Console (10 minutes, once)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings → Google Search Console verification code' })).toHaveAttribute('href', '/admin/settings');
    expect(screen.getByText(/Shop address/)).toBeInTheDocument();
    expect(screen.getByText(/Not live yet: Privacy policy\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Heart Collage' })).toHaveAttribute('href', '/admin/products/p1');
    expect(screen.getByText(/shows on Google once a matching product is published/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/seo-status', { headers: { Authorization: 'Bearer mock-token' } });
  });

  it('marks Search Console as done once the code is saved', async () => {
    mockFetch(status({ googleVerified: true }));
    render(<SeoAdminPage />);
    expect(await screen.findByText(/Connected\./)).toBeInTheDocument();
    expect(screen.queryByText('Settings → Google Search Console verification code')).not.toBeInTheDocument();
  });

  it('explains a failed load', async () => {
    mockFetch({}, false);
    render(<SeoAdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 403');
  });
});
