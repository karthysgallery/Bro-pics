// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { base32Decode, hotp, stepAt } from './totp';
import { confirmEnrolment, decryptSecret, hasMfaProof, MfaError, readMfa, resetMfa, sessionWithProof, startEnrolment, verifyCode } from './admin-mfa';
import { SESSION_COOKIE_NAME } from '../services/session';

// Real Firestore transactions (emulator). Run:
//   firebase emulators:exec --only firestore --project demo-bropics "cd apps/web && npx vitest run lib/security"
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!enabled)('admin authenticator (Firestore emulator)', { timeout: 20_000 }, () => {
  let db: Firestore;
  const uid = `staff_${Math.random().toString(36).slice(2, 8)}`;
  const t0 = new Date('2026-10-10T10:00:00Z');
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
  let secret = '';
  let recovery: string[] = [];
  const codeAt = (when: Date) => hotp(base32Decode(secret), stepAt(when.getTime()));
  const requestWith = (cookie: string | null) => new Request('http://x/api/admin/products', { headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {} });

  beforeAll(() => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
  });

  it('enrols: the secret is stored only encrypted, and the first code confirms it with 10 recovery codes', async () => {
    const started = await startEnrolment(db, uid, '+919999999999', t0);
    secret = started.secret;
    expect(started.uri).toContain(`secret=${secret}`);
    const stored = await readMfa(db, uid);
    expect(stored!.pendingSecret).not.toContain(secret);
    expect(decryptSecret(stored!.pendingSecret!)).toBe(secret);
    await expect(confirmEnrolment(db, uid, '000000', at(5))).rejects.toThrow(/delete the older one/);
    // A phone running 5 minutes behind is told so, and its code is still not accepted.
    await expect(confirmEnrolment(db, uid, codeAt(at(5 - 300)), at(5))).rejects.toThrow(/clock is about 5 minutes behind/);
    const confirmed = await confirmEnrolment(db, uid, codeAt(at(5)), at(5));
    recovery = confirmed.recoveryCodes;
    expect(recovery).toHaveLength(10);
    expect((await readMfa(db, uid))!.recovery).not.toContain(recovery[0]);
  });

  it('a second set-up is refused while one is active', async () => {
    await expect(startEnrolment(db, uid, '+919999999999', at(10))).rejects.toThrow(/already set up/);
  });

  it('signs in with the next code, but the same code cannot be used twice', async () => {
    const when = at(60);
    const { version } = await verifyCode(db, uid, codeAt(when), when);
    expect(version).toBeGreaterThan(0);
    await expect(verifyCode(db, uid, codeAt(when), at(61))).rejects.toThrow(/not right/);
  });

  it('the session cookie carries the proof for this account only, and nothing proves it without the cookie', async () => {
    const { version } = await verifyCode(db, uid, codeAt(at(120)), at(120));
    const cookie = sessionWithProof(requestWith(null), { uid, phone: '+919999999999', role: 'admin' }, version);
    expect(await hasMfaProof(db, requestWith(cookie), uid)).toBe(true);
    expect(await hasMfaProof(db, requestWith(cookie), 'someone_else')).toBe(false);
    expect(await hasMfaProof(db, requestWith(null), uid)).toBe(false);
    // A tampered cookie is rejected by its signature.
    expect(await hasMfaProof(db, requestWith(cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), uid)).toBe(false);
  });

  it('a recovery code works once', async () => {
    const r = await verifyCode(db, uid, recovery[0]!.toLowerCase(), at(200));
    expect(r).toMatchObject({ usedRecovery: true, recoveryLeft: 9 });
    await expect(verifyCode(db, uid, recovery[0]!, at(201))).rejects.toThrow(MfaError);
  });

  it('locks the account for 15 minutes after 5 wrong codes, even for a right one', async () => {
    // A good sign-in clears earlier misses (the reused recovery code above counted as one).
    await verifyCode(db, uid, codeAt(at(290)), at(290));
    for (let i = 0; i < 4; i++) await expect(verifyCode(db, uid, '111111', at(300 + i))).rejects.toThrow(/tr(y|ies) left/);
    await expect(verifyCode(db, uid, '111111', at(305))).rejects.toThrow(/Try again in 15 minutes/);
    await expect(verifyCode(db, uid, codeAt(at(330)), at(330))).rejects.toThrow(/Too many wrong codes/);
    // After the lock, the right code works again.
    const later = at(305 + 15 * 60 + 30);
    await expect(verifyCode(db, uid, codeAt(later), later)).resolves.toMatchObject({ usedRecovery: false });
  });

  it('an owner reset voids every existing proof at once', async () => {
    const when = at(2000);
    const { version } = await verifyCode(db, uid, codeAt(when), when);
    const cookie = sessionWithProof(requestWith(null), { uid, phone: '+919999999999', role: 'admin' }, version);
    await resetMfa(db, uid);
    expect(await hasMfaProof(db, requestWith(cookie), uid)).toBe(false);
    expect((await readMfa(db, uid))!.secret).toBeNull();
  });
});
