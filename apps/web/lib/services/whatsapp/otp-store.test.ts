import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeIndianPhoneNumber,
  maskPhoneNumber,
  generateSecureOtp,
  hashOtp,
  verifyOtpHash,
  OtpStore,
  OTP_CONFIG,
} from './otp-store';

describe('WhatsApp OTP Store & Helpers', () => {
  beforeEach(() => {
    OtpStore.reset();
  });

  describe('normalizeIndianPhoneNumber', () => {
    it('normalizes 10-digit Indian numbers starting with 6-9', () => {
      expect(normalizeIndianPhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizeIndianPhoneNumber('6123456789')).toBe('+916123456789');
      expect(normalizeIndianPhoneNumber('7987654321')).toBe('+917987654321');
      expect(normalizeIndianPhoneNumber('8012345678')).toBe('+918012345678');
    });

    it('handles +91 prefix and formatting characters', () => {
      expect(normalizeIndianPhoneNumber('+91 98765 43210')).toBe('+919876543210');
      expect(normalizeIndianPhoneNumber('+91-98765-43210')).toBe('+919876543210');
      expect(normalizeIndianPhoneNumber('919876543210')).toBe('+919876543210');
      expect(normalizeIndianPhoneNumber('09876543210')).toBe('+919876543210');
    });

    it('rejects invalid numbers and non-Indian prefixes', () => {
      expect(() => normalizeIndianPhoneNumber('')).toThrow();
      expect(() => normalizeIndianPhoneNumber('12345')).toThrow();
      expect(() => normalizeIndianPhoneNumber('5876543210')).toThrow(); // starts with 5
      expect(() => normalizeIndianPhoneNumber('+14155552671')).toThrow(); // US number
    });
  });

  describe('maskPhoneNumber', () => {
    it('masks middle digits for user privacy', () => {
      expect(maskPhoneNumber('+919876543210')).toBe('+91 XXXXX 3210');
      expect(maskPhoneNumber('9876543210')).toBe('+91 XXXXX 3210');
    });
  });

  describe('generateSecureOtp', () => {
    it('generates random 6-digit numeric strings', () => {
      const set = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const otp = generateSecureOtp();
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
        set.add(otp);
      }
      // Extremely high entropy: 20 random 6-digit codes should never collide
      expect(set.size).toBeGreaterThan(15);
    });
  });

  describe('hashOtp and verifyOtpHash', () => {
    it('hashes OTP with salt and verifies in constant time', () => {
      const phone = '+919876543210';
      const otp = '123456';
      const salt = 'random_salt_123';

      const hash = hashOtp(phone, otp, salt);
      expect(hash).toHaveLength(64); // SHA-256 hex string

      expect(verifyOtpHash(phone, '123456', salt, hash)).toBe(true);
      expect(verifyOtpHash(phone, '654321', salt, hash)).toBe(false);
      expect(verifyOtpHash('+919999999999', '123456', salt, hash)).toBe(false);
    });
  });

  describe('OtpStore session lifecycle', () => {
    const phone = '+919876543210';

    it('creates session with expiration and attempt counters', async () => {
      const record = await OtpStore.createSession(phone, '543210', 'login');
      expect(record.phoneNumber).toBe(phone);
      expect(record.attempts).toBe(0);
      expect(record.maxAttempts).toBe(5);
      expect(record.verified).toBe(false);
      expect(record.expiresAt).toBeGreaterThan(Date.now());
    });

    it('verifies correct OTP and clears the session immediately', async () => {
      await OtpStore.createSession(phone, '543210', 'login');

      const result = await OtpStore.verify(phone, '543210');
      expect(result.success).toBe(true);

      // Subsequent attempt must fail because OTP was invalidated on success
      const secondAttempt = await OtpStore.verify(phone, '543210');
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.code).toBe('NOT_FOUND');
    });

    it('tracks failed attempts and locks out after max attempts (5)', async () => {
      await OtpStore.createSession(phone, '111111', 'login');

      for (let i = 1; i <= 4; i++) {
        const attempt = await OtpStore.verify(phone, '000000');
        expect(attempt.success).toBe(false);
        expect(attempt.code).toBe('INVALID_OTP');
      }

      // 5th failed attempt triggers TOO_MANY_ATTEMPTS and invalidates session
      const fifthAttempt = await OtpStore.verify(phone, '000000');
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.code).toBe('TOO_MANY_ATTEMPTS');

      // 6th attempt returns NOT_FOUND because session was purged
      const sixthAttempt = await OtpStore.verify(phone, '111111');
      expect(sixthAttempt.success).toBe(false);
      expect(sixthAttempt.code).toBe('NOT_FOUND');
    });

    it('enforces resend cooldown', async () => {
      await OtpStore.createSession(phone, '111111', 'login');

      const cooldown = await OtpStore.checkCooldown(phone);
      expect(cooldown.canResend).toBe(false);
      expect(cooldown.remainingSeconds).toBeGreaterThan(0);
      expect(cooldown.remainingSeconds).toBeLessThanOrEqual(OTP_CONFIG.COOLDOWN_SECONDS);
    });

    it('invalidates previous OTP when a new OTP is requested', async () => {
      await OtpStore.createSession(phone, '111111', 'login');
      // New session created for the same phone
      await OtpStore.createSession(phone, '222222', 'login');

      // Old OTP must fail
      const oldVerify = await OtpStore.verify(phone, '111111');
      expect(oldVerify.success).toBe(false);
      expect(oldVerify.code).toBe('INVALID_OTP');

      // New OTP succeeds
      const newVerify = await OtpStore.verify(phone, '222222');
      expect(newVerify.success).toBe(true);
    });

    it('does not let a stale resend count lock a customer out forever (count resets after the window)', async () => {
      const first = await OtpStore.createSession(phone, '111111', 'login');
      expect(first.resendCount).toBe(0);
      const second = await OtpStore.createSession(phone, '222222', 'login');
      expect(second.resendCount).toBe(1);

      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.now() + (OTP_CONFIG.RESEND_WINDOW_SECONDS + 5) * 1000);
        const afterWindow = await OtpStore.createSession(phone, '333333', 'login');
        expect(afterWindow.resendCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects an expired code and purges the session', async () => {
      await OtpStore.createSession(phone, '123456', 'login');
      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.now() + (OTP_CONFIG.EXPIRY_SECONDS + 1) * 1000);
        const result = await OtpStore.verify(phone, '123456');
        expect(result).toMatchObject({ success: false, code: 'EXPIRED_OTP' });
      } finally {
        vi.useRealTimers();
      }
      expect((await OtpStore.verify(phone, '123456')).code).toBe('NOT_FOUND');
    });

    it('counts concurrent wrong guesses atomically — they cannot exceed maxAttempts', async () => {
      await OtpStore.createSession(phone, '111111', 'login');
      const results = await Promise.all(Array.from({ length: 12 }, () => OtpStore.verify(phone, '000000')));
      const locked = results.filter((r) => r.code === 'TOO_MANY_ATTEMPTS').length;
      const invalid = results.filter((r) => r.code === 'INVALID_OTP').length;
      expect(invalid).toBeLessThan(OTP_CONFIG.MAX_ATTEMPTS);
      expect(locked).toBeGreaterThanOrEqual(1);
      // Even the right code no longer works once locked out.
      expect((await OtpStore.verify(phone, '111111')).success).toBe(false);
    });
  });
});
