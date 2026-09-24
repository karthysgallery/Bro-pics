import { describe, it, expect } from 'vitest';
import { CreateTestimonialBodySchema, UpdateTestimonialBodySchema, ReorderTestimonialsBodySchema } from './testimonial-request-schema';

describe('CreateTestimonialBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreateTestimonialBodySchema.parse({ authorName: 'Priya S.', quote: 'Great frames!' });
    expect(result).toMatchObject({ isFeatured: false, isActive: true, sortOrder: 0 });
  });

  it('rejects an unknown field', () => {
    expect(CreateTestimonialBodySchema.safeParse({ authorName: 'x', quote: 'y', notAField: 1 }).success).toBe(false);
  });

  it('rejects a rating above 5', () => {
    expect(CreateTestimonialBodySchema.safeParse({ authorName: 'x', quote: 'y', rating: 6 }).success).toBe(false);
  });
});

describe('UpdateTestimonialBodySchema', () => {
  it('accepts a partial body', () => {
    expect(UpdateTestimonialBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe('ReorderTestimonialsBodySchema', () => {
  it('rejects an empty array', () => {
    expect(ReorderTestimonialsBodySchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});
