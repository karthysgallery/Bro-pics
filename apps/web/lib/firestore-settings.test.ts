import { describe, it, expect, vi } from 'vitest';
import { getShippingSettings, getAnnouncementBarSettings } from './firestore-settings';

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
  it('returns the stored values when settings/shipping exists, defaulting express if absent', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ freeShippingThreshold: 200000, flatShippingCharge: 3000 }),
    });

    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 200000, flatShippingCharge: 3000, expressShippingCharge: 15000 });
  });

  it('uses a stored express charge when present', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ freeShippingThreshold: 200000, flatShippingCharge: 3000, expressShippingCharge: 20000 }),
    });

    const result = await getShippingSettings();
    expect(result.expressShippingCharge).toBe(20000);
  });

  it('falls back to placeholder defaults when settings/shipping does not exist', async () => {
    mockGet.mockResolvedValueOnce({
      exists: false,
    });

    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 150000, flatShippingCharge: 5000, expressShippingCharge: 15000 });
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
