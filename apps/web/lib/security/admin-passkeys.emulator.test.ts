// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { base32Decode, hotp, stepAt } from './totp';
import { confirmEnrolment, resetMfa, startEnrolment, MfaError } from './admin-mfa';
import { allowedOrigins, beginLogin, beginRegistration, finishLogin, finishRegistration, relyingParty, removePasskey } from './admin-passkeys';
import { listPasskeys } from './passkey-store';
import { softAuthenticator } from './soft-authenticator';

// Real Firestore transactions (emulator). Run:
//   firebase emulators:exec --only firestore --project demo-bropics "cd apps/web && npx vitest run lib/security"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const ORIGIN = 'http://localhost:3100';
const req = (origin: string | null = ORIGIN) => new Request('http://localhost:3100/api/x', { method: 'POST', headers: origin ? { origin } : {} });

describe.skipIf(!enabled)('fingerprint / Face ID sign-in (Firestore emulator)', { timeout: 30_000 }, () => {
  let db: Firestore;
  const uid = `staff_${Math.random().toString(36).slice(2, 8)}`;
  const other = `staff_${Math.random().toString(36).slice(2, 8)}`;

  const setUpAuthenticator = async (who: string) => {
    const started = await startEnrolment(db, who, '+919999999999', new Date());
    await confirmEnrolment(db, who, hotp(base32Decode(started.secret), stepAt(Date.now())), new Date());
  };
  const add = async (who: string, device = softAuthenticator(), name = 'My phone') => {
    const options = await beginRegistration(db, req(), who, '+919999999999');
    return { device, saved: await finishRegistration(db, who, device.register(options, ORIGIN), name) };
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'x'.repeat(40);
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
    await setUpAuthenticator(uid);
    await setUpAuthenticator(other);
  });

  it('refuses an address that is not one of the shop’s own', () => {
    expect(allowedOrigins()).toContain('https://karthysgallery.in');
    expect(() => relyingParty(req('https://evil.example'))).toThrow(MfaError);
    expect(relyingParty(req(ORIGIN))).toEqual({ rpID: 'localhost', origin: ORIGIN });
  });

  it('adds a device: only its public key is stored, and the name is cleaned', async () => {
    const { device, saved } = await add(uid, softAuthenticator(), '  <b>My iPhone</b>  ');
    expect(saved).toMatchObject({ id: device.id, uid, name: 'bMy iPhone/b', counter: 0 });
    const stored = (await listPasskeys(db, uid))[0]!;
    expect(stored.publicKey.length).toBeGreaterThan(40);
    expect(JSON.stringify(stored)).not.toMatch(/private/i);
  });

  it('signs in with the device, counts up, and one answer cannot be used twice', async () => {
    const { device } = await add(uid);
    const options = await beginLogin(db, req(), uid);
    const answer = device.authenticate(options, ORIGIN, uid);
    const ok = await finishLogin(db, uid, answer);
    expect(ok.version).toBeGreaterThan(0);
    expect((await listPasskeys(db, uid)).find((p) => p.id === device.id)).toMatchObject({ counter: 1 });
    // The same signed answer again: the challenge was used up.
    await expect(finishLogin(db, uid, answer)).rejects.toThrow(/too long or was already used/);
  });

  it('refuses a device that did not confirm the person (no fingerprint, face or screen lock)', async () => {
    const { device } = await add(uid);
    const options = await beginLogin(db, req(), uid);
    await expect(finishLogin(db, uid, device.authenticate(options, ORIGIN, uid, { userVerified: false }))).rejects.toThrow(/did not work/);
    // And a registration without confirmation is refused too.
    const reg = await beginRegistration(db, req(), uid, '+919999999999');
    await expect(finishRegistration(db, uid, softAuthenticator().register(reg, ORIGIN, { userVerified: false }), 'x')).rejects.toThrow(/could not be added/);
  });

  it('refuses a wrong challenge, a wrong website address, a replayed counter and another account’s device', async () => {
    const { device } = await add(uid);
    let options = await beginLogin(db, req(), uid);
    await expect(finishLogin(db, uid, device.authenticate(options, ORIGIN, uid, { challenge: 'AAAA' }))).rejects.toThrow(/did not work/);
    options = await beginLogin(db, req(), uid);
    await expect(finishLogin(db, uid, device.authenticate(options, 'https://evil.example', uid))).rejects.toThrow(/did not work/);
    // A good sign-in, then an older counter value is a cloned or replayed device.
    options = await beginLogin(db, req(), uid);
    await finishLogin(db, uid, device.authenticate(options, ORIGIN, uid, { counter: 50 }));
    options = await beginLogin(db, req(), uid);
    await expect(finishLogin(db, uid, device.authenticate(options, ORIGIN, uid, { counter: 10 }))).rejects.toThrow(/did not work/);
    // The other account cannot use this device.
    await add(other);
    options = await beginLogin(db, req(), other);
    await expect(finishLogin(db, other, device.authenticate(options, ORIGIN, other))).rejects.toThrow(/not set up for your account/);
  });

  it('refuses everything for an account with no authenticator app, and a sign-in when no device is added', async () => {
    const fresh = `staff_${Math.random().toString(36).slice(2, 8)}`;
    await expect(beginRegistration(db, req(), fresh, 'x')).rejects.toThrow(/authenticator app first/);
    await expect(beginLogin(db, req(), fresh)).rejects.toThrow(/authenticator app first/);
    const noDevices = `staff_${Math.random().toString(36).slice(2, 8)}`;
    await setUpAuthenticator(noDevices);
    await expect(beginLogin(db, req(), noDevices)).rejects.toThrow(/No fingerprint or Face ID is set up/);
  });

  it('will not add the same device twice, and caps the number of devices', async () => {
    const who = `staff_${Math.random().toString(36).slice(2, 8)}`;
    await setUpAuthenticator(who);
    const { device } = await add(who);
    const again = await beginRegistration(db, req(), who, 'x');
    // The browser is told to skip the device it already has; a forced second add is refused too.
    expect(again.excludeCredentials?.map((c) => c.id)).toContain(device.id);
    await expect(finishRegistration(db, who, device.register(again, ORIGIN), 'again')).rejects.toThrow(/already added/);
    for (let i = 0; i < 9; i++) await add(who);
    await expect(beginRegistration(db, req(), who, 'x')).rejects.toThrow(/up to 10 devices/);
  });

  it('removing a device works for its owner only', async () => {
    const { saved } = await add(uid);
    expect(await removePasskey(db, other, saved.id)).toBe(false);
    expect(await removePasskey(db, uid, saved.id)).toBe(true);
    expect((await listPasskeys(db, uid)).some((p) => p.id === saved.id)).toBe(false);
  });

  it('resetting the authenticator removes the account’s devices too', async () => {
    expect((await listPasskeys(db, uid)).length).toBeGreaterThan(0);
    await resetMfa(db, uid);
    expect(await listPasskeys(db, uid)).toEqual([]);
    expect((await listPasskeys(db, other)).length).toBeGreaterThan(0);
  });
});
