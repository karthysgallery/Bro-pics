import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const setCustomUserClaims = vi.fn();
vi.mock('../firebase-admin', () => ({ getAdminApp: () => ({}) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    createUser: vi.fn(async () => {
      throw Object.assign(new Error('exists'), { code: 'auth/phone-number-already-exists' });
    }),
    getUserByPhoneNumber: vi.fn(async () => ({ uid: 'staff_uid' })),
    setCustomUserClaims,
    createCustomToken: vi.fn(async () => 'token'),
  }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ set: vi.fn(), get: vi.fn(async () => ({ exists: false })) }), where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }) }),
}));

import { UserStore, ExistingSignInError } from './user-store';

describe('quick sign-up never takes over an existing sign-in', () => {
  it('refuses when the phone already has a Firebase Auth record, and changes nothing on it', async () => {
    UserStore.reset();
    await expect(UserStore.createCustomer({ phone: '9876500111', fullName: '', passwordHash: null, reuseExistingAuth: false })).rejects.toBeInstanceOf(ExistingSignInError);
    expect(setCustomUserClaims).not.toHaveBeenCalled();
  });
});
