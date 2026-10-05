'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  AuthLogo,
  AuthInput,
  PasswordInput,
  PasswordStrength,
  PrimaryButton,
  AuthError,
  AuthSuccess,
  OTPInput,
  ResendOTP,
  IconArrowLeft,
  IconCheck,
} from '../../../components/auth/AuthComponents';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOtpExpired, setIsOtpExpired] = useState(false);

  // Field validation touched
  const [touched, setTouched] = useState({
    email: false,
    newPassword: false,
    confirmPassword: false,
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailError =
    touched.email && email && !emailRegex.test(email.trim())
      ? 'Please enter a valid email address'
      : null;

  const passwordError =
    touched.newPassword && newPassword && newPassword.length < 8
      ? 'Password must be at least 8 characters'
      : null;

  const confirmError =
    touched.confirmPassword && confirmPassword && newPassword !== confirmPassword
      ? 'Passwords do not match'
      : null;

  /* ── STEP 1: Email ── */
  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage(`We have sent a verification code to ${email.trim()}`);
      setStep(2);
      setIsOtpExpired(false);
    }, 700);
  };

  /* ── STEP 2: Verify OTP ── */
  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits of your verification code');
      return;
    }

    // Demo check for expired or invalid code simulation
    if (code === '000000') {
      setIsOtpExpired(true);
      setError('This verification code has expired. Please click "Resend code" below.');
      return;
    }

    if (code === '111111') {
      setError('Invalid verification code. Please check and try again.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(3);
    }, 700);
  };

  const handleResendOtp = () => {
    setError(null);
    setIsOtpExpired(false);
    setOtp(['', '', '', '', '', '']);
    setSuccessMessage('A fresh verification code has been dispatched to your email.');
  };

  /* ── STEP 3: Reset Password ── */
  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter and one number');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(4);
    }, 800);
  };

  return (
    <div className="min-h-[100dvh] bg-field flex">

      {/* ── LEFT: Brand Visual Panel (Desktop lg+) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative flex-col justify-between overflow-hidden">
        {/* Lifestyle Image */}
        <Image
          src="/banners/auth-forgot-password.jpg"
          alt="Artisanal wooden photo frame on a sunny morning wooden table"
          fill
          priority
          sizes="(min-width: 1024px) 48vw, 0px"
          className="object-cover object-center"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Top: Logo */}
        <div className="relative z-10 p-8 xl:p-10">
          <AuthLogo variant="light" size="md" />
        </div>

        {/* Bottom: Brand Statement */}
        <div className="relative z-10 p-8 xl:p-10 max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60 mb-3">
            Account Recovery
          </p>
          <h2 className="font-display text-[28px] xl:text-[32px] font-bold text-white leading-[1.15] tracking-tight">
            We&apos;re here to help you get back to your memories.
          </h2>
          <p className="text-[13px] text-white/70 mt-3 leading-relaxed max-w-sm">
            Your gallery and bespoke orders are safe with us. Follow the simple steps to regain access to your account.
          </p>

          {/* Progress bar info on desktop */}
          <div className="mt-6 pt-5 border-t border-white/15 flex items-center justify-between text-xs text-white/70">
            <span>Step {step} of 4</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step ? 'w-6 bg-gold' : s < step ? 'w-2.5 bg-white' : 'w-2.5 bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form Panel ── */}
      <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 lg:px-12 xl:px-16 py-8 lg:py-12 bg-field">
        <div className="w-full max-w-[420px] mx-auto">

          {/* Back link & Mobile Logo */}
          <div className="mb-6">
            <Link
              href="/signin"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/60 hover:text-ink transition-colors mb-4"
            >
              <IconArrowLeft />
              <span>Back to Sign In</span>
            </Link>

            <div className="lg:hidden flex items-center justify-between">
              <AuthLogo variant="dark" size="sm" />
              <span className="text-xs font-semibold text-ink/50 bg-tint/60 px-2.5 py-1 rounded-full">
                Step {step} of 4
              </span>
            </div>
          </div>

          {/* Mobile step bar */}
          <div className="lg:hidden flex gap-1.5 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full flex-1 transition-all duration-300 ${
                  s === step ? 'bg-gold' : s < step ? 'bg-ink' : 'bg-line'
                }`}
              />
            ))}
          </div>

          {/* Error & Success Alerts */}
          <AuthError message={error} onDismiss={() => setError(null)} />
          <AuthSuccess message={successMessage} />

          {/* ══════════════════════════════════════════════════
              STEP 1: Forgot your password?
              ══════════════════════════════════════════════════ */}
          {step === 1 && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-ink leading-tight tracking-tight">
                  Forgot your password?
                </h1>
                <p className="text-[13px] sm:text-sm text-ink/60 mt-2 leading-relaxed">
                  Enter your email address and we&apos;ll send you a 6-digit verification code to reset your password.
                </p>
              </div>

              <form onSubmit={handleStep1Submit} className="space-y-5" noValidate>
                <AuthInput
                  id="forgot-email"
                  label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  error={emailError}
                />

                <PrimaryButton type="submit" isLoading={isLoading}>
                  Continue
                </PrimaryButton>
              </form>

              <div className="mt-8 text-center text-xs text-ink/60">
                <span>Remember your password? </span>
                <Link
                  href="/signin"
                  className="font-semibold text-ink hover:text-gold-deep transition-colors underline-offset-4 hover:underline"
                >
                  Sign In
                </Link>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 2: Check your email (OTP Verification)
              ══════════════════════════════════════════════════ */}
          {step === 2 && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-ink leading-tight tracking-tight">
                  Check your email
                </h1>
                <p className="text-[13px] sm:text-sm text-ink/60 mt-2 leading-relaxed">
                  We sent a 6-digit verification code to{' '}
                  <strong className="text-ink font-semibold">{email}</strong>. Enter it below to proceed.
                </p>
              </div>

              <form onSubmit={handleStep2Submit} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[13px] font-medium text-ink/80">
                      Verification Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMessage(null);
                        setStep(1);
                      }}
                      className="text-xs text-ink/50 hover:text-ink transition-colors underline"
                    >
                      Change email
                    </button>
                  </div>

                  <OTPInput
                    value={otp}
                    onChange={(val: string[]) => {
                      setOtp(val);
                      if (error) setError(null);
                    }}
                    error={Boolean(error) || isOtpExpired}
                  />
                </div>

                <ResendOTP onResend={handleResendOtp} countdownSeconds={30} />

                {/* Simulation Hint */}
                <div className="p-2.5 rounded-lg bg-tint/40 border border-line/60 text-[11px] text-ink/60 leading-snug">
                  <span className="font-semibold text-ink/80">Demo Hint:</span> Enter any 6 digits to proceed (use <code className="bg-white px-1 py-0.5 rounded text-ink font-mono">111111</code> to test invalid code, <code className="bg-white px-1 py-0.5 rounded text-ink font-mono">000000</code> to test expired code).
                </div>

                <PrimaryButton type="submit" isLoading={isLoading}>
                  Verify
                </PrimaryButton>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 3: Create a new password
              ══════════════════════════════════════════════════ */}
          {step === 3 && (
            <div>
              <div className="mb-7">
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-ink leading-tight tracking-tight">
                  Create a new password
                </h1>
                <p className="text-[13px] sm:text-sm text-ink/60 mt-2 leading-relaxed">
                  Choose a strong, memorable password to secure your KarthysGallery account.
                </p>
              </div>

              <form onSubmit={handleStep3Submit} className="space-y-5" noValidate>
                <div>
                  <PasswordInput
                    id="new-password"
                    label="New Password"
                    required
                    autoComplete="new-password"
                    placeholder="Create a new password"
                    value={newPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setNewPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, newPassword: true }))}
                    error={passwordError}
                  />

                  {/* Password strength & requirements */}
                  <PasswordStrength password={newPassword} showRequirements={true} />
                </div>

                <PasswordInput
                  id="confirm-password"
                  label="Confirm New Password"
                  required
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                  error={confirmError}
                />

                <PrimaryButton type="submit" isLoading={isLoading}>
                  Reset Password
                </PrimaryButton>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              STEP 4: Password updated (Success Confirmation)
              ══════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-6 shadow-sm">
                <IconCheck className="w-8 h-8" />
              </div>

              <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-ink leading-tight tracking-tight">
                Password updated
              </h1>

              <p className="text-[13px] sm:text-sm text-ink/65 mt-3 leading-relaxed max-w-sm mx-auto">
                Your password has been changed successfully. You can now securely sign in to your KarthysGallery account with your new credentials.
              </p>

              <div className="mt-8">
                <PrimaryButton
                  type="button"
                  onClick={() => router.push('/signin')}
                >
                  Continue to Sign In
                </PrimaryButton>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
