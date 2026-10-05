import { describe, it, expect } from 'vitest';
import { hashPasswordForSeed, passwordProblems } from './admin-password';
import crypto from 'node:crypto';

// The app's verifyPassword (apps/web/lib/services/password.ts) splits "<salt>:<hex>"
// and compares scrypt(password, salt, 64). Spelled out here as the format spec —
// the seed package can't import app code (rootDir), so this pins the contract.
function verifyLikeTheApp(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  return derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf);
}

describe('seed admin password helpers stay compatible with the app', () => {
  it('a hash written by the seed script verifies the way the app login route verifies it', () => {
    const hash = hashPasswordForSeed('Str0ngPassw0rd');
    expect(hash.split(':')).toHaveLength(2);
    expect(verifyLikeTheApp('Str0ngPassw0rd', hash)).toBe(true);
    expect(verifyLikeTheApp('wrong-password1A', hash)).toBe(false);
  });

  it('uses a fresh salt each time', () => {
    expect(hashPasswordForSeed('Str0ngPassw0rd')).not.toBe(hashPasswordForSeed('Str0ngPassw0rd'));
  });

  it('applies the app\'s rules: 8+ chars, an uppercase letter, a digit', () => {
    expect(passwordProblems('short1A')).toEqual(['at least 8 characters']);
    expect(passwordProblems('alllowercase1')).toEqual(['an uppercase letter']);
    expect(passwordProblems('NoDigitsHere')).toEqual(['a number']);
    expect(passwordProblems('Str0ngPassw0rd')).toEqual([]);
  });
});
