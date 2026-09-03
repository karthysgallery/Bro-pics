import { describe, it, expect } from 'vitest';
import { UserSchema } from './user';

describe('UserSchema', () => {
  it('accepts a full valid user', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: 'a@example.com',
      displayName: 'Karthik',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null email and displayName', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: null,
      displayName: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing phone', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      email: null,
      displayName: null,
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
