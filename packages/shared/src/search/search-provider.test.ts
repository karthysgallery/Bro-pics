import { describe, it, expect, vi } from 'vitest';
import { FirestoreSearchProvider } from './search-provider';
import type { Category } from '../schemas/category';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: 'Wooden Frames',
    slug: 'wooden-frames',
    parentId: null,
    image: 'https://example.com/img.png',
    sortOrder: 0,
    isActive: true,
    seo: {},
    ...overrides,
  };
}

function makeFakeDb(categories: Category[]) {
  return {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: categories.map((c) => ({ data: () => c })) }),
      })),
    })),
  } as unknown as import('firebase-admin/firestore').Firestore;
}

describe('FirestoreSearchProvider.searchCategories', () => {
  it('matches a category by case-insensitive substring of its name', async () => {
    const db = makeFakeDb([makeCategory({ name: 'Wooden Frames' }), makeCategory({ id: 'cat_2', name: 'Metal Frames' })]);
    const provider = new FirestoreSearchProvider(db);
    const results = await provider.searchCategories('wooden');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Wooden Frames');
  });

  it('returns an empty array for a blank query, without querying Firestore', async () => {
    const db = makeFakeDb([makeCategory()]);
    const provider = new FirestoreSearchProvider(db);
    const results = await provider.searchCategories('   ');
    expect(results).toEqual([]);
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('returns an empty array when nothing matches', async () => {
    const db = makeFakeDb([makeCategory({ name: 'Wooden Frames' })]);
    const provider = new FirestoreSearchProvider(db);
    const results = await provider.searchCategories('nonexistent');
    expect(results).toEqual([]);
  });
});
