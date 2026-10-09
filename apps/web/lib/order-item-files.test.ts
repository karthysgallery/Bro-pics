import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './fake-firestore.test-util';
import { listItemOriginals } from './order-item-files';
import type { OrderItem } from '@bro-pics/shared';

const photo = (assetId: string) => ({ assetId, width: 2400, height: 3600, transform: { scale: 1, offsetX: 0, offsetY: 0 }, rotation: 0 as const, confirmedLowDpi: false });

describe('listItemOriginals', () => {
  it('lists each photo once in the design order, and a cut-out together with its untouched original', async () => {
    const fake = createFakeFirestore();
    fake.seed('uploads/cut_1', { cutoutOf: 'up_couple', status: 'ready' });
    fake.seed('uploads/up_a', { status: 'ready' });
    fake.seed('uploads/up_b', { status: 'ready' });
    const item = {
      personalizationId: 'p1',
      personalization: {
        template: { photoSlots: [{ id: 'main' }, { id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }] },
        state: { slots: { m4: photo('up_b'), main: photo('cut_1'), m1: photo('up_a'), m2: photo('up_b'), m3: photo('up_a') } },
      },
    } as unknown as Pick<OrderItem, 'personalizationId' | 'personalization'>;
    expect(await listItemOriginals(fake.db, item)).toEqual([
      { uploadId: 'cut_1', label: 'Photo 1 — background removed' },
      { uploadId: 'up_couple', label: 'Photo 1 — original, before background removal' },
      { uploadId: 'up_a', label: 'Photo 2 (used in 2 spaces)' },
      { uploadId: 'up_b', label: 'Photo 3 (used in 2 spaces)' },
    ]);
  });
});
