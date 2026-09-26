import { describe, it, expect } from 'vitest';
import { BannerSchema } from './banner';

const validBanner = {
  id: 'banner_1',
  title: 'Diwali Sale',
  subtitle: 'Up to 30% off frames',
  image: '/placeholders/banner.jpg',
  mobileImage: '/placeholders/banner-mobile.jpg',
  link: '/category/all',
  couponCode: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
  sortOrder: 0,
};

describe('BannerSchema', () => {
  it('accepts a valid banner with no coupon or schedule', () => {
    expect(BannerSchema.parse(validBanner)).toEqual(validBanner);
  });

  it('accepts a banner with a linked coupon and schedule window', () => {
    const withLinks = { ...validBanner, couponCode: 'DIWALI30', startsAt: new Date('2026-10-01'), endsAt: new Date('2026-10-31') };
    expect(BannerSchema.parse(withLinks)).toEqual(withLinks);
  });

  it('rejects a missing title', () => {
    const { title: _title, ...rest } = validBanner;
    expect(() => BannerSchema.parse(rest)).toThrow();
  });
});
