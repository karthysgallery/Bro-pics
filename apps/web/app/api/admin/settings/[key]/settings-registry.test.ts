import { describe, it, expect } from 'vitest';
import { SETTINGS_REGISTRY, isKnownSettingsKey } from './settings-registry';

describe('isKnownSettingsKey', () => {
  it('accepts every registered key', () => {
    for (const key of Object.keys(SETTINGS_REGISTRY)) {
      expect(isKnownSettingsKey(key)).toBe(true);
    }
  });

  it('rejects an unknown key', () => {
    expect(isKnownSettingsKey('bogus')).toBe(false);
  });

  it('rejects announcementBar (it has its own dedicated route, not this registry)', () => {
    expect(isKnownSettingsKey('announcementBar')).toBe(false);
  });
});

describe('SETTINGS_REGISTRY schemas', () => {
  it('shipping: accepts a valid body and rejects an unknown field', () => {
    const body = { freeShippingThreshold: 150000, flatShippingCharge: 5000, expressShippingCharge: 15000 };
    expect(SETTINGS_REGISTRY.shipping.safeParse(body).success).toBe(true);
    expect(SETTINGS_REGISTRY.shipping.safeParse({ ...body, notAField: 1 }).success).toBe(false);
  });

  it('gst: accepts a body with optional gstin omitted', () => {
    expect(SETTINGS_REGISTRY.gst.safeParse({ gstEnabled: true, taxRate: 18 }).success).toBe(true);
  });

  it('store: requires name and supportPhone', () => {
    expect(SETTINGS_REGISTRY.store.safeParse({ name: 'BroPics', supportPhone: '+91...', processingDays: 2 }).success).toBe(true);
    expect(SETTINGS_REGISTRY.store.safeParse({ processingDays: 2 }).success).toBe(false);
  });

  it('courier: accepts a list of couriers with an optional tracking template', () => {
    const body = { couriers: [{ code: 'DTDC', name: 'DTDC Courier', trackingUrlTemplate: 'https://dtdc.in/track/{awb}' }] };
    expect(SETTINGS_REGISTRY.courier.safeParse(body).success).toBe(true);
  });

  it('deliveryEstimates: accepts zone ranges', () => {
    const body = { zones: [{ zoneCode: 'local', minDays: 1, maxDays: 3 }] };
    expect(SETTINGS_REGISTRY.deliveryEstimates.safeParse(body).success).toBe(true);
  });

  it('payments: never accepts a secret-shaped field (rejected as unknown)', () => {
    const body = { codEnabled: true, acceptedMethods: ['upi', 'card'], apiSecret: 'sk_live_x' };
    expect(SETTINGS_REGISTRY.payments.safeParse(body).success).toBe(false);
  });

  it('notifications: requires all three channel toggles', () => {
    expect(SETTINGS_REGISTRY.notifications.safeParse({ emailEnabled: true, smsEnabled: false, whatsappEnabled: false }).success).toBe(true);
    expect(SETTINGS_REGISTRY.notifications.safeParse({ emailEnabled: true }).success).toBe(false);
  });

  it('seo: requires defaultTitle and defaultDescription', () => {
    expect(SETTINGS_REGISTRY.seo.safeParse({ defaultTitle: 'BroPics', defaultDescription: 'Personalized frames' }).success).toBe(true);
  });

  it('header: accepts a list of nav links', () => {
    expect(SETTINGS_REGISTRY.header.safeParse({ navLinks: [{ label: 'Shop', href: '/category/all' }] }).success).toBe(true);
  });

  it('footer: accepts columns and social links', () => {
    const body = { columns: [{ title: 'Help', links: [{ label: 'FAQ', href: '/faq' }] }], socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/bropics' }] };
    expect(SETTINGS_REGISTRY.footer.safeParse(body).success).toBe(true);
  });
});
