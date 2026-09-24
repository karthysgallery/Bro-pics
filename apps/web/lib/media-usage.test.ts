import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockArrayUnion, mockArrayRemove } = vi.hoisted(() => ({
  mockArrayUnion: vi.fn((ref: unknown) => ({ __op: 'arrayUnion', ref })),
  mockArrayRemove: vi.fn((ref: unknown) => ({ __op: 'arrayRemove', ref })),
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayUnion: mockArrayUnion, arrayRemove: mockArrayRemove },
}));

import { addMediaUsageRef, removeMediaUsageRef } from './media-usage';

describe('addMediaUsageRef / removeMediaUsageRef', () => {
  it('updates usageRefs with FieldValue.arrayUnion for the given ref', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockDb = { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: mockUpdate })) })) } as never;

    await addMediaUsageRef(mockDb, 'media_1', { resource: 'product', resourceId: 'prod_1' });

    expect(mockArrayUnion).toHaveBeenCalledWith({ resource: 'product', resourceId: 'prod_1' });
    expect(mockUpdate).toHaveBeenCalledWith({ usageRefs: { __op: 'arrayUnion', ref: { resource: 'product', resourceId: 'prod_1' } } });
  });

  it('updates usageRefs with FieldValue.arrayRemove for the given ref', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockDb = { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: mockUpdate })) })) } as never;

    await removeMediaUsageRef(mockDb, 'media_1', { resource: 'product', resourceId: 'prod_1' });

    expect(mockArrayRemove).toHaveBeenCalledWith({ resource: 'product', resourceId: 'prod_1' });
    expect(mockUpdate).toHaveBeenCalledWith({ usageRefs: { __op: 'arrayRemove', ref: { resource: 'product', resourceId: 'prod_1' } } });
  });
});
