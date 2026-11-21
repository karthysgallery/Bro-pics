import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithCustomToken = vi.fn();
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), signInWithCustomToken: (...a: unknown[]) => signInWithCustomToken(...a) }));
vi.mock('../firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

import { verifyWhatsAppOtp, loginWithPassword, BROWSER_SIGN_IN_FAILED } from './auth-client';

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('auth-client: the browser sign-in is part of signing in', () => {
  beforeEach(() => {
    signInWithCustomToken.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => ok({ success: true, customToken: 'real-token', user: { id: 'u1' } })));
  });

  it('reports success only once this browser is signed in', async () => {
    signInWithCustomToken.mockResolvedValue({});
    const res = await verifyWhatsAppOtp({ phone: '9876543210', otp: '123456', purpose: 'quick' });
    expect(res.success).toBe(true);
    expect(signInWithCustomToken).toHaveBeenCalledWith({}, 'real-token');
  });

  it('retries once, so a dropped connection does not fail the sign-in', async () => {
    signInWithCustomToken.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
    const res = await loginWithPassword('9876543210', 'secret');
    expect(res.success).toBe(true);
    expect(signInWithCustomToken).toHaveBeenCalledTimes(2);
  });

  it('says so when this browser cannot sign in, instead of "Signed in" followed by another sign-in request', async () => {
    signInWithCustomToken.mockRejectedValue(new Error('auth/network-request-failed'));
    const res = await verifyWhatsAppOtp({ phone: '9876543210', otp: '123456', purpose: 'quick' });
    expect(res).toMatchObject({ success: false, error: BROWSER_SIGN_IN_FAILED, code: 'browser_sign_in_failed' });
  });
});
