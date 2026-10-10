// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { base32Decode, base32Encode, generateSecret, hotp, otpauthUri, verifyTotp } from './totp';

// RFC 6238 appendix B (SHA-1, secret "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 reference codes', () => {
    const s = base32Decode(RFC_SECRET);
    expect(hotp(s, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(s, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(hotp(s, Math.floor(1234567890 / 30), 8)).toBe('89005924');
    expect(hotp(s, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });

  it('accepts the current code and one step of clock drift, nothing older', () => {
    const now = 1_760_000_000_000;
    const s = base32Decode(RFC_SECRET);
    const step = Math.floor(now / 30000);
    expect(verifyTotp(RFC_SECRET, hotp(s, step), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(s, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
  });

  it('refuses a code that was already used', () => {
    const now = 1_760_000_000_000;
    const step = Math.floor(now / 30000);
    const code = hotp(base32Decode(RFC_SECRET), step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
  });

  it('makes 32-character secrets and the address authenticator apps read', () => {
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri('KarthysGallery Admin', '+919999999999', 'ABC')).toBe(
      'otpauth://totp/KarthysGallery%20Admin%3A%2B919999999999?secret=ABC&issuer=KarthysGallery%20Admin&algorithm=SHA1&digits=6&period=30'
    );
    expect(base32Decode(base32Encode(Buffer.from('hello world'))).toString()).toBe('hello world');
  });
});
