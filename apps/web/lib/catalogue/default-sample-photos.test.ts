import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Firestore } from 'firebase-admin/firestore';
import { BUILT_IN_SAMPLE_PHOTO, getDefaultSamplePhotos, resetDefaultSamplePhotosCache } from './default-sample-photos';

const doc = (id: string, over: Record<string, unknown> = {}) => ({ id, data: () => ({ type: 'image', isActive: true, path: `public/media/${id}.jpg`, createdAt: '2026-10-12T10:00:00.000Z', ...over }) });
const dbWith = (docs: ReturnType<typeof doc>[]) => {
  const get = vi.fn().mockResolvedValue({ docs });
  const where = vi.fn().mockReturnValue({ get });
  return { db: { collection: vi.fn().mockReturnValue({ where }) } as unknown as Firestore, where, get };
};

describe('getDefaultSamplePhotos', () => {
  beforeEach(() => resetDefaultSamplePhotosCache());

  it('uses the newest sample photos in the media library, as large public pictures', async () => {
    const { db, where } = dbWith([doc('old', { createdAt: '2026-10-01T00:00:00.000Z' }), doc('new', { createdAt: '2026-10-12T12:00:00.000Z' }), doc('mid', { createdAt: '2026-10-08T00:00:00.000Z' })]);
    expect(await getDefaultSamplePhotos(db)).toEqual(['/api/media/new/image?w=2000', '/api/media/mid/image?w=2000', '/api/media/old/image?w=2000']);
    expect(where).toHaveBeenCalledWith('tags', 'array-contains', 'sample-photo');
  });
  it('keeps at most 12, and leaves out pictures that are switched off, not images, or not public', async () => {
    const many = Array.from({ length: 15 }, (_, i) => doc(`p${String(i).padStart(2, '0')}`, { createdAt: `2026-10-12T10:${String(i).padStart(2, '0')}:00.000Z` }));
    const out = await getDefaultSamplePhotos(dbWith([...many, doc('off', { isActive: false }), doc('vid', { type: 'video' }), doc('private', { path: 'uploads/x.jpg' })]).db);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe('/api/media/p14/image?w=2000');
    expect(out.join()).not.toMatch(/off|vid|private/);
  });
  it('falls back to the built-in sample photo when the library has none, or cannot be read', async () => {
    expect(await getDefaultSamplePhotos(dbWith([]).db)).toEqual([BUILT_IN_SAMPLE_PHOTO]);
    resetDefaultSamplePhotosCache();
    const broken = { collection: () => ({ where: () => ({ get: async () => { throw new Error('down'); } }) }) } as unknown as Firestore;
    expect(await getDefaultSamplePhotos(broken)).toEqual([BUILT_IN_SAMPLE_PHOTO]);
  });
  it('remembers the answer for a few minutes, so product pages do not each read the library', async () => {
    const { db, get } = dbWith([doc('a')]);
    await getDefaultSamplePhotos(db, 1_000);
    await getDefaultSamplePhotos(db, 1_000 + 60_000);
    expect(get).toHaveBeenCalledTimes(1);
    await getDefaultSamplePhotos(db, 1_000 + 6 * 60_000);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
