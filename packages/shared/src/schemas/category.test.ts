import { describe, it, expect } from 'vitest';
import { CategorySchema } from './category';

const validCategory = {
  id: 'cat_frames',
  name: 'Frames & Wall Décor',
  slug: 'frames-wall-decor',
  parentId: null,
  image: '/placeholders/categories/frames.jpg',
  sortOrder: 1,
  isActive: true,
  seo: { title: 'Frames & Wall Décor | BroPics', description: 'Shop personalized frames.' },
};

describe('CategorySchema', () => {
  it('accepts a valid top-level category', () => {
    expect(CategorySchema.parse(validCategory)).toEqual(validCategory);
  });

  it('accepts a valid child category with a parentId', () => {
    const child = { ...validCategory, id: 'cat_wall_frames', parentId: 'cat_frames' };
    expect(CategorySchema.parse(child)).toEqual(child);
  });

  it('rejects a negative sortOrder', () => {
    const invalid = { ...validCategory, sortOrder: -1 };
    expect(() => CategorySchema.parse(invalid)).toThrow();
  });

  it('rejects an empty name', () => {
    const invalid = { ...validCategory, name: '' };
    expect(() => CategorySchema.parse(invalid)).toThrow();
  });
});
