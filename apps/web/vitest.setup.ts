import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Default cross-test mocks for the Firebase client SDK modules that
// AuthProvider / CartProvider now import unconditionally. Individual test
// files can override any of these with their own vi.mock(...) call when they
// need to exercise a signed-in or Firestore-backed scenario.
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  RecaptchaVerifier: vi.fn().mockImplementation(() => ({ clear: vi.fn() })),
  signInWithPhoneNumber: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref, callback) => {
    callback({ exists: () => false, data: () => undefined });
    return () => {};
  }),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
}));
