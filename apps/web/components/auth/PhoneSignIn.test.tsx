import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneSignIn } from './PhoneSignIn';

const mockConfirm = vi.fn();
const mockSignInWithPhoneNumber = vi.fn((..._args: unknown[]) => Promise.resolve({ confirm: mockConfirm }));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  RecaptchaVerifier: vi.fn().mockImplementation(() => ({ clear: vi.fn() })),
  signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('PhoneSignIn', () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockSignInWithPhoneNumber.mockClear();
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
});
