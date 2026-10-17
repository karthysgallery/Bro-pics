import { describe, it, expect } from 'vitest';
import { BusinessProfileSchema, formatAddress, missingBusinessDetails, parseBusinessProfile, whatsappDigits } from './business-profile';

describe('business profile', () => {
  it('accepts a minimal profile and invents nothing', () => {
    const p = BusinessProfileSchema.parse({ name: 'KarthysGallery', processingDays: 3 });
    expect(p.supportPhone).toBe('');
    expect(p.gstRegistration).toBe('unconfirmed');
    expect(p.supportEmail).toBeUndefined();
    expect(p.pincode).toBeUndefined();
    expect(p.addressLine1).toBeUndefined();
  });

  it('records "not GST registered" without any GSTIN field existing', () => {
    const p = BusinessProfileSchema.parse({ name: 'K', processingDays: 3, gstRegistration: 'not_registered' });
    expect(p.gstRegistration).toBe('not_registered');
    expect(Object.keys(p)).not.toContain('gstin');
  });

  it('rejects bad PIN codes, emails, states, WhatsApp numbers and unknown keys', () => {
    const base = { name: 'K', processingDays: 3 };
    expect(BusinessProfileSchema.safeParse({ ...base, pincode: '12345' }).success).toBe(false);
    expect(BusinessProfileSchema.safeParse({ ...base, pincode: '900001' }).success).toBe(false);
    expect(BusinessProfileSchema.safeParse({ ...base, supportEmail: 'not-an-email' }).success).toBe(false);
    expect(BusinessProfileSchema.safeParse({ ...base, state: 'Atlantis' }).success).toBe(false);
    expect(BusinessProfileSchema.safeParse({ ...base, supportWhatsapp: 'abc' }).success).toBe(false);
    expect(BusinessProfileSchema.safeParse({ ...base, gstin: '33ABCDE1234F1Z5' }).success).toBe(false); // strict: no stray fields
  });

  it('turns blank optional inputs into "not set"', () => {
    const p = BusinessProfileSchema.parse({ name: 'K', processingDays: 3, supportEmail: '', pincode: '', city: '  ' });
    expect(p.supportEmail).toBeUndefined();
    expect(p.pincode).toBeUndefined();
    expect(p.city).toBeUndefined();
  });

  it('formats the address only from what was entered', () => {
    expect(formatAddress({})).toBeNull();
    expect(formatAddress({ city: 'Srivilliputhur', state: 'Tamil Nadu' })).toBe('Srivilliputhur, Tamil Nadu');
    expect(formatAddress({ addressLine1: '1 Main Road', city: 'Srivilliputhur', district: 'Virudhunagar', state: 'Tamil Nadu', pincode: '626125', country: 'India' })).toBe('1 Main Road, Srivilliputhur, Virudhunagar, Tamil Nadu 626125, India');
    expect(formatAddress({ address: 'Older free text' })).toBe('Older free text');
  });

  it('normalises a WhatsApp number to wa.me digits', () => {
    expect(whatsappDigits('+91 63692 84351')).toBe('916369284351');
    expect(whatsappDigits('6369284351')).toBe('916369284351');
    expect(whatsappDigits('12')).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
  });

  it('lists exactly what is still missing and never makes up a value', () => {
    expect(missingBusinessDetails(null)).toHaveLength(1);
    const p = parseBusinessProfile({ name: 'KarthysGallery', city: 'Srivilliputhur', state: 'Tamil Nadu' })!;
    const missing = missingBusinessDetails(p);
    expect(missing).toEqual(expect.arrayContaining(['Legal business name', 'Support email', 'Grievance contact name', 'Grievance contact designation']));
    expect(missing.join(' ')).toMatch(/GST registration status/);
    expect(p.addressOneLine).toBe('Srivilliputhur, Tamil Nadu');
    expect(p.supportEmail).toBeUndefined();
  });

  it('drops a malformed stored value instead of showing it', () => {
    const p = parseBusinessProfile({ name: 'K', supportEmail: '<script>', pincode: 'x', supportWhatsapp: '+916369284351' })!;
    expect(p.supportEmail).toBeUndefined();
    expect(p.supportWhatsapp).toBe('+916369284351');
    expect(parseBusinessProfile({ supportEmail: 'a@b.co' })).toBeNull(); // no name => no profile
  });
});
