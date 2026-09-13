import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneSignIn } from './PhoneSignIn';

const mockConfirm = vi.fn();
const mockSignInWithPhoneNumber = vi.fn((..._args: unknown[]) => Promise.resolve({ confirm: mockConfirm }));
const mockVerifierInstances: Array<{ clear: ReturnType<typeof vi.fn> }> = [];

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  RecaptchaVerifier: vi.fn().mockImplementation(() => {
    const instance = { clear: vi.fn() };
    mockVerifierInstances.push(instance);
    return instance;
  }),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('PhoneSignIn', () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockSignInWithPhoneNumber.mockClear();
    mockVerifierInstances.length = 0;
  });

  it('sends an OTP, then verifies it and calls onSignedIn', async () => {
    mockConfirm.mockResolvedValue({ user: { uid: 'user_1' } });
    const onSignedIn = vi.fn();
    render(<PhoneSignIn onSignedIn={onSignedIn} />);

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

    fireEvent.change(await screen.findByLabelText('Enter OTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ uid: 'user_1' }));
  });

  it('clears the prior RecaptchaVerifier before constructing a new one on a second Send OTP click (Fix 6 regression)', async () => {
    // Reviewer-found bug: clicking "Send OTP" twice in the same mount (e.g.
    // after mistyping the phone number) constructed a second
    // RecaptchaVerifier against the same container div without clearing
    // the first, which throws against the real Firebase SDK — swallowed
    // into the same generic error every other failure produces, with no
    // way to recover short of closing and reopening the sign-in modal.
    // First attempt fails (e.g. a mistyped number rejected by Firebase),
    // which keeps the component on the phone-entry screen (confirmationResult
    // stays null) — exactly the state a real mistype leaves it in, and the
    // only state from which a second "Send OTP" click against the same
    // container div is even reachable.
    mockSignInWithPhoneNumber.mockRejectedValueOnce(new Error('invalid phone')).mockResolvedValueOnce({ confirm: mockConfirm });
    const onSignedIn = vi.fn();
    render(<PhoneSignIn onSignedIn={onSignedIn} />);

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+91000000000' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledTimes(1));
    await screen.findByText('Could not send OTP. Check the phone number and try again.');

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Send OTP'));
    await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledTimes(2));

    expect(mockVerifierInstances).toHaveLength(2);
    // The FIRST verifier must have been cleared before the second was
    // constructed — the second instance's own .clear() is irrelevant here.
    expect(mockVerifierInstances[0].clear).toHaveBeenCalled();
  });
});
