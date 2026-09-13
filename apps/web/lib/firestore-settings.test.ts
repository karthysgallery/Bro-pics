import { describe, it, expect, vi } from 'vitest';
import { getShippingSettings } from './firestore-settings';

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
  it('returns the stored values when settings/shipping exists', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ freeShippingThreshold: 200000, flatShippingCharge: 3000 }),
    });

    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 200000, flatShippingCharge: 3000 });
  });

  it('falls back to placeholder defaults when settings/shipping does not exist', async () => {
    mockGet.mockResolvedValueOnce({
      exists: false,
    });

    const result = await getShippingSettings();
    expect(result).toEqual({ freeShippingThreshold: 150000, flatShippingCharge: 5000 });
  });
});
