import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SignUpPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'phone' ? '9876543210' : null),
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
    devOtp: '889900',
    cooldownSeconds: 30,
  }),
  verifyWhatsAppOtp: vi.fn().mockResolvedValue({
    success: true,
    user: { id: 'usr_new_1', phone: '+919876543210', displayName: 'Allwin' },
  }),
  resendWhatsAppOtp: vi.fn().mockResolvedValue({
    success: true,
    devOtp: '334455',
    cooldownSeconds: 30,
  }),
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with full name, mobile (+91), optional email, password fields and pre-filled phone', () => {
    render(<SignUpPage />);
    expect(screen.getByRole('heading', { name: /Create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm password/i, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument();

    // Verify phone is pre-filled from searchParams
    const phoneInput = screen.getByLabelText(/Mobile number/i) as HTMLInputElement;
    expect(phoneInput.value).toBe('9876543210');
  });

  it('validates required fields and terms before calling sendWhatsAppOtp', async () => {
    const { sendWhatsAppOtp } = await import('../../../lib/services/auth-client');
    render(<SignUpPage />);

    // Click continue without filling name or password
    const submitBtn = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Please enter your full name/i)).toBeInTheDocument();
    expect(sendWhatsAppOtp).not.toHaveBeenCalled();
  });

  it('transitions to Step 2 (OTP verification) when valid form is submitted', async () => {
    const { sendWhatsAppOtp } = await import('../../../lib/services/auth-client');
    render(<SignUpPage />);

    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Allwin Karthik' } });
    fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input' }), { target: { value: 'SecurePass123' } });
    fireEvent.change(screen.getByLabelText(/^Confirm password/i, { selector: 'input' }), { target: { value: 'SecurePass123' } });
    fireEvent.click(screen.getByRole('checkbox')); // Agree terms

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(sendWhatsAppOtp).toHaveBeenCalledWith('9876543210', 'register');
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Verify your WhatsApp number/i })).toBeInTheDocument();
      expect(screen.getByText(/\+91 XXXXX 3210/)).toBeInTheDocument();
      expect(screen.getByText(/Your verification code:/i)).toBeInTheDocument();
      expect(screen.getByText('889900')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify & Create Account/i })).toBeInTheDocument();
    });
  });
});
