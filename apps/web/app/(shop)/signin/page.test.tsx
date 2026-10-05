import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SignInPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'redirect' ? '/account' : null),
  }),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

vi.mock('../../../lib/services/auth-client', () => ({
  sendWhatsAppOtp: vi.fn().mockResolvedValue({
    success: true,
    maskedPhone: '+91 XXXXX 3210',
    devOtp: '654321',
    cooldownSeconds: 30,
  }),
  verifyWhatsAppOtp: vi.fn().mockResolvedValue({
    success: true,
    user: { id: 'usr_123', phone: '+919876543210', displayName: 'Allwin' },
  }),
  resendWhatsAppOtp: vi.fn().mockResolvedValue({
    success: true,
    devOtp: '112233',
    cooldownSeconds: 30,
  }),
  loginWithPassword: vi.fn().mockResolvedValue({
    success: true,
    user: { id: 'usr_123', phone: '+919876543210', displayName: 'Allwin' },
  }),
}));

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders primary WhatsApp OTP login screen with Indian mobile input', () => {
    render(<SignInPage />);
    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/Sign in securely using WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/i)).toBeInTheDocument();
    expect(screen.getByText('+91')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with password/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create an account/i })).toBeInTheDocument();
  });

  it('toggles to secondary password sign in view when clicked', () => {
    render(<SignInPage />);
    const pwdBtn = screen.getByRole('button', { name: /Sign in with password/i });
    fireEvent.click(pwdBtn);

    expect(screen.getByRole('heading', { name: /Sign in with password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to WhatsApp login/i })).toBeInTheDocument();
  });

  it('moves to Step 2 (OTP verification) upon submitting a valid 10-digit number', async () => {
    const { sendWhatsAppOtp } = await import('../../../lib/services/auth-client');
    render(<SignInPage />);

    const phoneInput = screen.getByLabelText(/Mobile number/i);
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });

    const submitBtn = screen.getByRole('button', { name: /Continue with WhatsApp/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(sendWhatsAppOtp).toHaveBeenCalledWith('9876543210', 'login');
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Verify your WhatsApp number/i })).toBeInTheDocument();
      expect(screen.getByText(/\+91 XXXXX 3210/)).toBeInTheDocument();
      expect(screen.getByText(/Your verification code:/i)).toBeInTheDocument();
      expect(screen.getByText('654321')).toBeInTheDocument();
    });
  });
});
