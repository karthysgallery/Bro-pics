import { describe, it, expect } from 'vitest';
import { isValidIndianPincode, classifyPincodeZone, deliveryEstimateForPincode } from './pincode-zones';

describe('isValidIndianPincode', () => {
  it('accepts a well-formed 6-digit pincode starting 1-8', () => {
    expect(isValidIndianPincode('110001')).toBe(true);
    expect(isValidIndianPincode('600028')).toBe(true);
  });

  it('rejects a pincode starting with 9 (reserved for army postal service)', () => {
    expect(isValidIndianPincode('900001')).toBe(false);
  });

  it('rejects wrong length, non-digits, and empty input', () => {
    expect(isValidIndianPincode('12345')).toBe(false);
    expect(isValidIndianPincode('1234567')).toBe(false);
    expect(isValidIndianPincode('11000a')).toBe(false);
    expect(isValidIndianPincode('')).toBe(false);
  });
});

describe('classifyPincodeZone', () => {
  it('classifies known metro prefixes as metro', () => {
    expect(classifyPincodeZone('110001')).toBe('metro'); // Delhi
    expect(classifyPincodeZone('400001')).toBe('metro'); // Mumbai
    expect(classifyPincodeZone('560001')).toBe('metro'); // Bangalore
  });

  it('classifies known remote prefixes as remote', () => {
    expect(classifyPincodeZone('744101')).toBe('remote'); // Andaman & Nicobar
    expect(classifyPincodeZone('797001')).toBe('remote'); // Nagaland
  });

  it('classifies everything else as standard', () => {
    expect(classifyPincodeZone('302001')).toBe('standard'); // Jaipur
  });

  it('returns null for an invalid pincode', () => {
    expect(classifyPincodeZone('900001')).toBeNull();
    expect(classifyPincodeZone('abc')).toBeNull();
  });
});

describe('deliveryEstimateForPincode', () => {
  it('matches the ranges published on the shipping-policy page: metro 2-4, standard 4-7, remote can take longer', () => {
    expect(deliveryEstimateForPincode('110001')).toEqual({ zone: 'metro', estimatedDaysMin: 2, estimatedDaysMax: 4 });
    expect(deliveryEstimateForPincode('302001')).toEqual({ zone: 'standard', estimatedDaysMin: 4, estimatedDaysMax: 7 });
    expect(deliveryEstimateForPincode('744101')).toEqual({ zone: 'remote', estimatedDaysMin: 7, estimatedDaysMax: 12 });
  });

  it('returns null for an invalid pincode', () => {
    expect(deliveryEstimateForPincode('900001')).toBeNull();
  });
});
