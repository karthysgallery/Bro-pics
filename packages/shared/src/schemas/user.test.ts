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

  it('accepts the additive profile fields', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: null,
      displayName: 'Karthik R',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
      firstName: 'Karthik',
      lastName: 'R',
      photoPath: 'profile-pictures/user_1/photo.jpg',
      dob: '1990-05-14',
      gender: 'male',
    });
    expect(result.success).toBe(true);
  });

  it('parses an existing user doc with none of the additive profile fields present', () => {
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

  it('[ABE-26] accepts the denormalized stats fields and a disabled flag', () => {
    const result = UserSchema.safeParse({
      id: 'user_1',
      phone: '+919876543210',
      email: null,
      displayName: 'Karthik R',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
      totalSpent: 250000,
      orderCount: 3,
      lastOrderAt: '2026-09-20T00:00:00.000Z',
      disabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('[ABE-26] parses an existing user doc with none of the stats fields present', () => {
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
