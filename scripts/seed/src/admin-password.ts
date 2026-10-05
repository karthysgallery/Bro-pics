import crypto from 'node:crypto';

/**
 * Same "<salt>:<hexHash>" scrypt format as apps/web/lib/services/password.ts
 * (hashPassword/verifyPassword) — duplicated here only because the seed
 * scripts can't import app code at runtime. admin-password.test.ts proves
 * the two stay compatible.
 */
export function hashPasswordForSeed(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

/** Mirrors validatePasswordRequirements in apps/web (8+ chars, an uppercase letter, a digit). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  return problems;
}
