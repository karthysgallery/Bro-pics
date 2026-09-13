import { describe, it, expect } from 'vitest';
import { calculateRatingFields } from './denormalize-ratings';

describe('calculateRatingFields', () => {
  it('returns zeroed fields for an empty rating list', () => {
    expect(calculateRatingFields([])).toEqual({ ratingAverage: 0, ratingCount: 0 });
  });

  it('computes the average and count for a mixed set of ratings', () => {
    expect(calculateRatingFields([5, 4, 3])).toEqual({ ratingAverage: 4, ratingCount: 3 });
  });

  it('rounds the average to one decimal place', () => {
    expect(calculateRatingFields([5, 5, 4])).toEqual({ ratingAverage: 4.7, ratingCount: 3 });
  });

  it('handles a single rating', () => {
    expect(calculateRatingFields([3])).toEqual({ ratingAverage: 3, ratingCount: 1 });
  });
});
