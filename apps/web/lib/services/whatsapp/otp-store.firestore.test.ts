// Integration test for the production OTP backend (Firestore + transactions).
// Runs only against the Firestore emulator, e.g.:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-bropics \
//     pnpm --filter @bro-pics/web exec vitest run otp-store.firestore
// Skipped (not failed) when no emulator is configured, so plain `pnpm test` stays hermetic.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('server-only', () => ({}));

import { OtpStore, FirestoreOtpBackend, MemoryOtpBackend, setOtpBackendForTesting, OTP_CONFIG } from './otp-store';

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!emulator)('OtpStore on the Firestore backend (emulator)', () => {
  const phone = '+919812345678';

  beforeEach(async () => {
    // A fresh backend INSTANCE per test: state must live in Firestore, not in the object —
    // that is exactly what makes send/verify work across serverless instances.
    setOtpBackendForTesting(new FirestoreOtpBackend());
    await OtpStore.verify(phone, '000000'); // no-op/NOT_FOUND; just ensure the module is warm
    // clean slate for this phone
    const { getFirestore } = await import('firebase-admin/firestore');
    const { getAdminApp } = await import('../../firebase-admin');
    const crypto = await import('node:crypto');
    const id = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 40);
    await getFirestore(getAdminApp()).collection('otpSessions').doc(id).delete();
  });

  afterAll(() => setOtpBackendForTesting(null));

  it('verifies a code that was created through a DIFFERENT backend instance (cross-instance send/verify)', async () => {
    setOtpBackendForTesting(new FirestoreOtpBackend()); // "instance A" sends
    await OtpStore.createSession(phone, '123456', 'login');

    setOtpBackendForTesting(new FirestoreOtpBackend()); // "instance B" verifies
    expect(await OtpStore.verify(phone, '123456')).toEqual({ success: true });
  });

  it('is one-time use: the same code cannot be replayed', async () => {
    await OtpStore.createSession(phone, '654321', 'login');
    expect((await OtpStore.verify(phone, '654321')).success).toBe(true);
    expect((await OtpStore.verify(phone, '654321')).code).toBe('NOT_FOUND');
  });

  it('never stores the code itself, only a salted hash', async () => {
    await OtpStore.createSession(phone, '777777', 'login');
    const session = await OtpStore.getSession(phone);
    expect(JSON.stringify(session)).not.toContain('777777');
    expect(session?.otpHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('counts concurrent wrong guesses atomically across the transaction path — total attempts cannot exceed the cap', async () => {
    await OtpStore.createSession(phone, '111111', 'login');
    const results = await Promise.all(Array.from({ length: 12 }, () => OtpStore.verify(phone, '000000')));
    const invalid = results.filter((r) => r.code === 'INVALID_OTP').length;
    expect(invalid).toBeLessThan(OTP_CONFIG.MAX_ATTEMPTS);
    // The correct code no longer works once locked out.
    expect((await OtpStore.verify(phone, '111111')).success).toBe(false);
  });

  it('enforces the resend cooldown from shared state', async () => {
    await OtpStore.createSession(phone, '222222', 'login');
    setOtpBackendForTesting(new FirestoreOtpBackend());
    const cooldown = await OtpStore.checkCooldown(phone);
    expect(cooldown.canResend).toBe(false);
    expect(cooldown.remainingSeconds).toBeGreaterThan(0);
  });
});

describe('OtpStore backend selection', () => {
  it('uses the in-memory backend when OTP_STORE=memory, even in production', async () => {
    const env = process.env as Record<string, string | undefined>;
    const original = { NODE_ENV: env.NODE_ENV, OTP_STORE: env.OTP_STORE };
    setOtpBackendForTesting(null);
    env.NODE_ENV = 'production';
    env.OTP_STORE = 'memory';
    try {
      await OtpStore.createSession('+919000011111', '123456', 'login');
      expect((await OtpStore.verify('+919000011111', '123456')).success).toBe(true);
    } finally {
      env.NODE_ENV = original.NODE_ENV;
      if (original.OTP_STORE === undefined) delete env.OTP_STORE;
      else env.OTP_STORE = original.OTP_STORE;
      setOtpBackendForTesting(new MemoryOtpBackend());
    }
  });
});
