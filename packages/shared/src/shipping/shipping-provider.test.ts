import { describe, it, expect } from 'vitest';
import { ManualShippingProvider, type ShippingProvider } from './shipping-provider';

describe('ManualShippingProvider', () => {
  it('implements ShippingProvider but returns no tracking link, since no courier API is integrated yet', () => {
    const provider: ShippingProvider = new ManualShippingProvider();
    expect(provider.trackingUrlFor('BlueDart', 'BD123456789')).toBeNull();
    expect(provider.trackingUrlFor('', '')).toBeNull();
  });
});
