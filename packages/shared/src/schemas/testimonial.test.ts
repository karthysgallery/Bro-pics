import { describe, it, expect } from 'vitest';
import { TestimonialSchema } from './testimonial';

const validTestimonial = {
  id: 'testimonial_1',
  authorName: 'Priya S.',
  quote: 'The frame arrived beautifully packaged and looks exactly like the preview.',
  isFeatured: false,
  isActive: true,
  sortOrder: 0,
};

describe('TestimonialSchema', () => {
  it('accepts a valid testimonial with only required fields', () => {
    expect(TestimonialSchema.parse(validTestimonial)).toEqual(validTestimonial);
  });

  it('accepts an optional rating within 1-5', () => {
    expect(TestimonialSchema.parse({ ...validTestimonial, rating: 5 }).rating).toBe(5);
  });

  it('rejects a rating above 5', () => {
    expect(() => TestimonialSchema.parse({ ...validTestimonial, rating: 6 })).toThrow();
  });

  it('rejects a rating below 1', () => {
    expect(() => TestimonialSchema.parse({ ...validTestimonial, rating: 0 })).toThrow();
  });
});
