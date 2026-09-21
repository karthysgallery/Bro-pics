import { describe, it, expect } from 'vitest';
import { AddressSchema } from './address';

describe('AddressSchema', () => {
  it('accepts a full valid address', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: 'Home',
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      phone: '+919876543210',
      isDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the additive type/country/deliveryInstructions fields', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: 'Home',
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      phone: '+919876543210',
      isDefault: true,
      type: 'home',
      country: 'India',
      deliveryInstructions: 'Leave with the doorman',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a pincode that is not 6 digits', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: null,
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '6000',
      phone: '+919876543210',
      isDefault: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing pincode', () => {
    const result = AddressSchema.safeParse({
      id: 'addr_1',
      label: null,
      line1: '12 MG Road',
      line2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      phone: '+919876543210',
      isDefault: true,
    });
    expect(result.success).toBe(false);
  });
});
