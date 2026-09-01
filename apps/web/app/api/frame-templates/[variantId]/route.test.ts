import { describe, it, expect, vi } from 'vitest';

const templateDoc = {
  id: 'ft_1',
  variantId: 'var_1',
  mockupUrl: '/mockup.png',
  maskUrl: null,
  overlayUrl: null,
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
  bleedMm: 2,
  matInset: 0,
};

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collectionGroup: () => ({
      where: () => ({
        get: () => Promise.resolve({ docs: [{ data: () => templateDoc }] }),
      }),
    }),
  }),
}));

import { GET } from './route';

describe('GET /api/frame-templates/:variantId', () => {
  it('returns the frame templates for a variant', async () => {
    const response = await GET(new Request('http://localhost/api/frame-templates/var_1'), {
      params: Promise.resolve({ variantId: 'var_1' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual([templateDoc]);
  });
});
