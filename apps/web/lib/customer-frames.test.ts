import { describe, it, expect } from 'vitest';
import { CUSTOMER_FRAME_PHOTOS, featuredComments, allCommentsOrdered, monthLabel } from './customer-frames';
import { INSTAGRAM_COMMENTS } from './customer-comments';

describe('customer photos and comments', () => {
  it('lists the processed photos with sizes and both image files', () => {
    expect(CUSTOMER_FRAME_PHOTOS.length).toBeGreaterThanOrEqual(100);
    for (const p of CUSTOMER_FRAME_PHOTOS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.src).toMatch(/^\/customer-frames\/frame-\d{3}\.webp$/);
      expect(p.thumb).toMatch(/-sm\.webp$/);
    }
  });
  it('keeps one comment per account and never adds a rating', () => {
    const handles = INSTAGRAM_COMMENTS.map((c) => c.handle);
    expect(new Set(handles).size).toBe(handles.length);
    expect(INSTAGRAM_COMMENTS.every((c) => !('rating' in c))).toBe(true);
  });
  it('puts the fuller comments first', () => {
    expect(featuredComments().every((c) => c.text.length >= 45)).toBe(true);
    const ordered = allCommentsOrdered();
    expect(ordered[0].text.length).toBeGreaterThanOrEqual(45);
    expect(ordered).toHaveLength(INSTAGRAM_COMMENTS.length);
    expect(monthLabel('2025-08')).toBe('Aug 2025');
  });
});
