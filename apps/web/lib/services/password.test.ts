import { describe, it, expect } from 'vitest';
import {
  validatePasswordRequirements,
  hashPassword,
  verifyPassword,
} from './password';

describe('Password Service', () => {
  describe('validatePasswordRequirements', () => {
    it('accepts passwords meeting all criteria', () => {
      expect(validatePasswordRequirements('SecurePass1').valid).toBe(true);
      expect(validatePasswordRequirements('Karthys2026!').valid).toBe(true);
    });

    it('rejects passwords shorter than 8 characters', () => {
      const res = validatePasswordRequirements('Pass1');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Password must be at least 8 characters long.');
    });

    it('rejects passwords missing uppercase letters', () => {
      const res = validatePasswordRequirements('lowercase123');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Password must include at least one uppercase letter.');
    });

    it('rejects passwords missing numbers', () => {
      const res = validatePasswordRequirements('NoNumbersHere');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Password must include at least one number.');
    });
  });

  describe('hashPassword and verifyPassword', () => {
    it('hashes passwords securely using scrypt with unique salts', () => {
      const pwd = 'MasterPassword123';
      const hash1 = hashPassword(pwd);
      const hash2 = hashPassword(pwd);

      expect(hash1).not.toBe(hash2); // Different salts
      expect(hash1.split(':')).toHaveLength(2);

      expect(verifyPassword(pwd, hash1)).toBe(true);
      expect(verifyPassword(pwd, hash2)).toBe(true);
      expect(verifyPassword('WrongPassword123', hash1)).toBe(false);
    });
  });
});
