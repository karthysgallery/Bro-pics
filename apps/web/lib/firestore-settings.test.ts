import { describe, it, expect, vi } from 'vitest';
import { getShippingSettings, getAnnouncementBarSettings, getSeoSettings } from './firestore-settings';

const mockGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: mockCollection })),
}));

vi.mock('./firebase-admin', () => ({
  getAdminApp: vi.fn(() => ({})),
}));

describe('getShippingSettings', () => {
  it('reads per-state charges and ignores the legacy threshold/flat fields', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ freeShippingThreshold: 200000, flatShippingCharge: 3000, stateCharges: { Kerala: 8000 } }),
    });
    const result = await getShippingSettings();
    expect(result.homeState).toBe('Tamil Nadu');
    expect(result.stateCharges).toEqual({ Kerala: 8000 });
    expect(result.otherStatesDefaultCharge).toBeNull();
    expect(result).not.toHaveProperty('freeShippingThreshold');
  });

  it('is safe by default when settings/shipping does not exist: Tamil Nadu free, nothing else configured, express off', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    const result = await getShippingSettings();
    expect(result).toEqual({ homeState: 'Tamil Nadu', stateCharges: {}, otherStatesDefaultCharge: null, expressEnabled: false, expressCharge: 0 });
  });
});

describe('getAnnouncementBarSettings', () => {
  it('returns text and link when the doc exists and is active', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ text: 'Free shipping today', link: '/sale', isActive: true }) });
    expect(await getAnnouncementBarSettings()).toEqual({ text: 'Free shipping today', link: '/sale' });
  });

  it('[ABE-20] returns null when isActive is explicitly false', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ text: 'Free shipping today', isActive: false }) });
    expect(await getAnnouncementBarSettings()).toBeNull();
  });

  it('defaults to active when isActive is absent (pre-ABE-20 doc)', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ text: 'Free shipping today' }) });
    expect(await getAnnouncementBarSettings()).toEqual({ text: 'Free shipping today' });
  });

  it('returns null when the doc does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    expect(await getAnnouncementBarSettings()).toBeNull();
  });
});

describe('[FE-42] getSeoSettings', () => {
  it('returns null when settings/seo does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    expect(await getSeoSettings()).toBeNull();
  });

  it('returns the stored defaultTitle/defaultDescription/ogImagePath', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ defaultTitle: 'KarthysGallery', defaultDescription: 'Personalized photo frames.', ogImagePath: 'seo/og.jpg' }),
    });
    expect(await getSeoSettings()).toEqual({
      defaultTitle: 'KarthysGallery',
      defaultDescription: 'Personalized photo frames.',
      ogImagePath: 'seo/og.jpg',
    });
  });

  it('omits ogImagePath when not set, rather than including an empty string', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ defaultTitle: 'KarthysGallery', defaultDescription: 'Personalized photo frames.' }),
    });
    const result = await getSeoSettings();
    expect(result).toEqual({ defaultTitle: 'KarthysGallery', defaultDescription: 'Personalized photo frames.' });
    expect('ogImagePath' in (result ?? {})).toBe(false);
  });
});
