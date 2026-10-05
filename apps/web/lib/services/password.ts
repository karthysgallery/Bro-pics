import crypto from 'crypto';

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates password rules:
 * - Minimum 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one number (0-9)
 */
export function validatePasswordRequirements(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must include at least one number.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Securely hashes a password using scrypt with a random 16-byte salt.
 * Output format: "<salt>:<hexHash>"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain-text password against a stored "<salt>:<hexHash>" string
 * using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;

    const [salt, expectedHash] = parts;
    const derivedKey = crypto.scryptSync(password, salt, 64);

    const a = Buffer.from(derivedKey.toString('hex'), 'hex');
    const b = Buffer.from(expectedHash, 'hex');

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
