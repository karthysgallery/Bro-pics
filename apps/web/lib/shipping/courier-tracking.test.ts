import { describe, it, expect } from 'vitest';
import { trackingUrlFromCouriers } from './courier-tracking';

const couriers = [
  { name: 'Delhivery', code: 'DELHIVERY', trackingUrlTemplate: 'https://www.delhivery.com/track/package/{awb}', isActive: true },
  { name: 'Old Courier', code: 'OLD', trackingUrlTemplate: 'https://old.example/{awb}', isActive: false },
  { name: 'Bad', code: 'BAD', trackingUrlTemplate: 'javascript:alert({awb})', isActive: true },
];

describe('trackingUrlFromCouriers', () => {
  it('builds the link from a saved courier, matching name or code loosely', () => {
    expect(trackingUrlFromCouriers(couriers, 'delhivery ', 'AB 12')).toBe('https://www.delhivery.com/track/package/AB%2012');
    expect(trackingUrlFromCouriers(couriers, 'DELHIVERY', 'X1')).toBe('https://www.delhivery.com/track/package/X1');
  });
  it('gives no link for unknown, inactive or non-https couriers', () => {
    expect(trackingUrlFromCouriers(couriers, 'DTDC', 'X1')).toBeNull();
    expect(trackingUrlFromCouriers(couriers, 'Old Courier', 'X1')).toBeNull();
    expect(trackingUrlFromCouriers(couriers, 'Bad', 'X1')).toBeNull();
    expect(trackingUrlFromCouriers(couriers, 'Delhivery', ' ')).toBeNull();
  });
});
