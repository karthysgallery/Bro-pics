import { describe, it, expect } from 'vitest';
import { ReviewSchema } from './review';

const validReview = {
  id: 'rev_1',
  productId: 'prod_classic_wooden_frame',
  userId: 'user_1',
  orderId: 'order_1',
  rating: 5,
  title: 'Beautiful frame',
  body: 'The print quality exceeded expectations and it arrived well packed.',
  media: [],
  isVerified: true,
  status: 'approved',
};

describe('ReviewSchema', () => {
  it('accepts a valid approved review', () => {
    expect(ReviewSchema.parse(validReview)).toEqual(validReview);
  });

  it('accepts a review with no linked order (unverified)', () => {
    const guest = { ...validReview, orderId: undefined, isVerified: false };
    expect(ReviewSchema.parse(guest)).toMatchObject({ isVerified: false });
  });

  it('rejects a rating above 5', () => {
    const invalid = { ...validReview, rating: 6 };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });

  it('rejects a rating below 1', () => {
    const invalid = { ...validReview, rating: 0 };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid status', () => {
    const invalid = { ...validReview, status: 'published' };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });
});
