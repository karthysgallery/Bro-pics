'use client';

import { safeRedirectTarget } from '../../../lib/safe-redirect';
import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { OtpInput } from '../../../components/auth/OtpInput';
import {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  resendWhatsAppOtp,
} from '../../../lib/services/auth-client';

/* ─────────────────────────────────────────────
   Outline SVG Icons (1.5px stroke, no emojis)
   ───────────────────────────────────────────── */
const IconAlertCircle = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconCheckCircle = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconCheck = ({ className = '' }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconEye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const Spinner = () => (
  <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
);

/* ─────────────────────────────────────────────
   Password Requirements Helper
   ───────────────────────────────────────────── */
function PasswordRequirements({ password }: { password: string }) {
  const rules = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {rules.map(({ label, met }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors duration-200 ${
              met ? 'bg-emerald-500 text-white' : 'bg-[#E0DAD1] text-transparent'
            }`}
          >
            <IconCheck className="w-2 h-2" />
          </span>
          <span
            className={`text-[12px] transition-colors duration-200 ${
              met ? 'text-emerald-700 font-medium' : 'text-black/45'
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectTarget(searchParams.get('redirect'));
  const signInHref = redirectTarget !== '/account' ? `/signin?redirect=${encodeURIComponent(redirectTarget)}` : '/signin';

  // Step state: 'details' (Step 1) | 'otp' (Step 2)
  const [step, setStep] = useState<'details' | 'otp'>('details');

  // Fields
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [otp, setOtp] = useState('');

  // Pre-fill phone if passed from sign-in page
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    if (phoneParam && !mobile) {
      setMobile(phoneParam.replace(/\D/g, ''));
    }
  }, [searchParams, mobile]);

  // OTP metadata
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password rules validation
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-400' };
    if (score <= 2) return { score: 2, label: 'Medium', color: 'bg-amber-400' };
    return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
  }, [password]);

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  // Resend cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const clearError = () => {
    if (error) setError(null);
  };

  // 1. STEP 1 SUBMIT — Validate Form & Send WhatsApp OTP
  const handleProceedToOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Validate Full Name
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name (minimum 2 characters).');
      return;
    }

    // Validate Mobile
    const cleanPhone = mobile.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    // Validate Email ONLY if provided (Email is strictly OPTIONAL)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address, or leave it blank.');
        return;
      }
    }

    // Validate Password
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password.');
      return;
    }

    // Agree Terms
    if (!agreeTerms) {
      setError('Please agree to the Terms & Conditions and Privacy Policy.');
      return;
    }

    // Send WhatsApp OTP for Registration
    setIsLoading(true);
    const res = await sendWhatsAppOtp(cleanPhone, 'register');
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to send WhatsApp verification code.');
      return;
    }

    setMaskedPhone(res.maskedPhone || `+91 XXXXX ${cleanPhone.slice(-4)}`);
    setDevOtp(res.devOtp);
    setCooldownSeconds(res.cooldownSeconds || 30);
    setOtp('');
    setStep('otp');
  };

  // 2. STEP 2 SUBMIT — Verify OTP & Create Account
  const handleVerifyAndRegister = async (submittedOtp?: string) => {
    const code = submittedOtp || otp;
    clearError();

    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit WhatsApp verification code.');
      return;
    }

    setIsLoading(true);
    const res = await verifyWhatsAppOtp({
      phone: mobile.replace(/\D/g, ''),
      otp: code,
      purpose: 'register',
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      password,
    });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || "That code isn't correct. Please try again.");
      return;
    }

    setSuccessMessage('Account created! Welcome to KarthysGallery.');
    setTimeout(() => {
      router.push(redirectTarget);
      router.refresh();
    }, 700);
  };

  // 3. Resend OTP
  const handleResend = async () => {
    if (cooldownSeconds > 0 || isLoading) return;
    clearError();
    setIsLoading(true);

    const res = await resendWhatsAppOtp(mobile.replace(/\D/g, ''), 'register');
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to resend code.');
      return;
    }

    setDevOtp(res.devOtp);
    setCooldownSeconds(res.cooldownSeconds || 30);
    setSuccessMessage('A new WhatsApp code has been sent.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const inputBase =
    'w-full h-12 min-h-[48px] px-4 rounded-lg border bg-white text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 transition-all duration-150';
  const inputNormal = `${inputBase} border-[#E0DAD1] focus:ring-[#FCA311]/20 focus:border-[#FCA311]`;

  return (
    <div className="min-h-[100dvh] bg-field flex">

      {/* ── LEFT: Brand Visual Panel (Desktop lg+) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative flex-col justify-between overflow-hidden">
        <Image
          src="/banners/auth-signup.jpg"
          alt="Artisan carefully wrapping a personalized photo frame gift with kraft paper and gold ribbon"
          fill
          priority
          sizes="(min-width: 1024px) 48vw, 0px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Top: Logo */}
        <div className="relative z-10 p-8 xl:p-10">
          <Link href="/" className="inline-flex items-center gap-1.5">
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Karthys<span className="text-[#FCA311]">Gallery</span>
            </span>
          </Link>
        </div>

        {/* Bottom: Brand Statement */}
        <div className="relative z-10 p-8 xl:p-10 max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
            Personalized gifting
          </p>
          <h2 className="font-display text-[28px] xl:text-[32px] font-bold text-white leading-[1.15] tracking-tight">
            Turn your memories into something you can keep forever.
          </h2>
          <p className="text-[13px] text-white/75 mt-3 leading-relaxed max-w-sm">
            Create an account to save your designs, track orders, and start turning your favourite photos into beautiful keepsakes.
          </p>
          <div className="mt-5 pt-5 border-t border-white/15 space-y-2.5">
            {[
              'Instant high-resolution live preview',
              'Free delivery on orders above ₹999',
              'Museum-grade archival materials',
            ].map((text) => (
              <div key={text} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[#FCA311]/25 flex items-center justify-center">
                  <IconCheck className="w-2.5 h-2.5 text-[#FCA311]" />
                </span>
                <span className="text-[12px] text-white/70">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Multi-step Sign-Up Form ── */}
      <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 lg:px-12 xl:px-16 py-6 lg:py-8 bg-field overflow-y-auto">
        <div className="w-full max-w-[420px] mx-auto">

          {/* Mobile Back & Logo */}
          <div className="lg:hidden mb-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-black/50 hover:text-black transition-colors mb-4"
            >
              <IconArrowLeft />
              <span>Back to gallery</span>
            </Link>
            <div>
              <Link href="/" className="inline-block">
                <span className="font-display text-[22px] font-bold tracking-tight text-black">
                  Karthys<span className="text-[#FCA311]">Gallery</span>
                </span>
              </Link>
            </div>
          </div>

          {/* Desktop Logo */}
          <div className="hidden lg:block mb-6">
            <Link href="/" className="inline-block">
              <span className="font-display text-[22px] font-bold tracking-tight text-black">
                Karthys<span className="text-[#FCA311]">Gallery</span>
              </span>
            </Link>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200/80 flex items-start gap-2.5"
              style={{ animation: 'fadeIn 0.15s ease-out' }}
            >
              <IconAlertCircle className="shrink-0 mt-0.5 text-red-500" />
              <p className="text-[13px] text-red-800 font-medium leading-snug">{error}</p>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div
              role="status"
              className="mb-4 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center gap-2.5"
              style={{ animation: 'fadeIn 0.15s ease-out' }}
            >
              <IconCheckCircle className="shrink-0 text-emerald-600" />
              <p className="text-[13px] text-emerald-800 font-medium">{successMessage}</p>
            </div>
          )}

          {/* ========================================================
              STEP 1: ACCOUNT DETAILS
             ======================================================== */}
          {step === 'details' && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-black leading-tight tracking-tight">
                  Create your account
                </h1>
                <p className="text-[13px] sm:text-sm text-black/60 mt-1.5 leading-relaxed">
                  Start creating personalized memories with KarthysGallery.
                </p>
              </div>

              <form onSubmit={handleProceedToOtp} className="space-y-4" noValidate>
                {/* Full Name */}
                <div>
                  <label htmlFor="signup-name" className="block text-[13px] font-medium text-black/80 mb-1.5">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      clearError();
                    }}
                    placeholder="Enter your full name"
                    className={inputNormal}
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label htmlFor="signup-mobile" className="block text-[13px] font-medium text-black/80 mb-1.5">
                    Mobile number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-[#E0DAD1] bg-[#EFEBE4] text-[13px] text-black/70 font-semibold select-none min-h-[48px]">
                      +91
                    </span>
                    <input
                      id="signup-mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel"
                      required
                      value={mobile}
                      onChange={(e) => {
                        setMobile(e.target.value.replace(/\D/g, ''));
                        clearError();
                      }}
                      placeholder="Enter 10-digit mobile number"
                      className="flex-1 h-12 min-h-[48px] px-4 rounded-r-lg border border-[#E0DAD1] bg-white text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-[#FCA311]/20 focus:border-[#FCA311] transition-all duration-150"
                    />
                  </div>
                  <p className="text-[11px] text-black/45 mt-1">
                    WhatsApp verification code will be sent to this number.
                  </p>
                </div>

                {/* Email — STRICTLY OPTIONAL */}
                <div>
                  <label htmlFor="signup-email" className="block text-[13px] font-medium text-black/80 mb-1.5">
                    Email address (optional)
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearError();
                    }}
                    placeholder="Enter your email address (optional)"
                    className={inputNormal}
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="signup-password" className="block text-[13px] font-medium text-black/80">
                      Password <span className="text-red-500">*</span>
                    </label>
                    {password && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          passwordStrength.score === 1
                            ? 'bg-red-100 text-red-700'
                            : passwordStrength.score === 2
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      placeholder="Create a password"
                      className={`${inputBase} border-[#E0DAD1] focus:ring-[#FCA311]/20 focus:border-[#FCA311] pr-12`}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-black/40 hover:text-black/75 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>

                  {/* Password Requirements */}
                  <PasswordRequirements password={password} />
                </div>

                {/* Confirm Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="signup-confirm-password" className="block text-[13px] font-medium text-black/80">
                      Confirm password <span className="text-red-500">*</span>
                    </label>
                    {confirmPassword && !passwordsMatch && (
                      <span className="text-[11px] font-medium text-red-600">Passwords don&rsquo;t match</span>
                    )}
                    {confirmPassword && passwordsMatch && password.length >= 8 && (
                      <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                        <IconCheck className="w-3 h-3" />
                        Match
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearError();
                      }}
                      placeholder="Confirm your password"
                      className={`${inputBase} pr-12 ${
                        confirmPassword && !passwordsMatch
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                          : 'border-[#E0DAD1] focus:ring-[#FCA311]/20 focus:border-[#FCA311]'
                      }`}
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-black/40 hover:text-black/75 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      {showConfirmPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <label className="flex items-start gap-3 cursor-pointer select-none group pt-1">
                  <span className="relative flex items-center justify-center mt-0.5">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked);
                        clearError();
                      }}
                      className="peer sr-only"
                    />
                    <span className="w-[18px] h-[18px] rounded border border-[#E0DAD1] bg-white peer-checked:bg-black peer-checked:border-black peer-focus-visible:ring-2 peer-focus-visible:ring-[#FCA311]/30 transition-all duration-150 flex items-center justify-center">
                      {agreeTerms && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </span>
                  <span className="text-[12px] sm:text-[13px] text-black/60 leading-relaxed">
                    I agree to the{' '}
                    <Link href="/terms" className="text-black font-medium underline underline-offset-4 hover:text-[#FCA311] transition-colors">
                      Terms &amp; Conditions
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" className="text-black font-medium underline underline-offset-4 hover:text-[#FCA311] transition-colors">
                      Privacy Policy
                    </Link>
                  </span>
                </label>

                {/* Primary CTA */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 min-h-[48px] rounded-lg bg-black text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-black/85 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm mt-2"
                >
                  {isLoading ? <Spinner /> : 'Continue'}
                </button>
              </form>
            </>
          )}

          {/* ========================================================
              STEP 2: VERIFY WHATSAPP NUMBER
             ======================================================== */}
          {step === 'otp' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setStep('details');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-black/55 hover:text-black mb-3 transition-colors"
                >
                  <IconArrowLeft />
                  <span>Change details</span>
                </button>
                <h1 className="font-display text-[24px] sm:text-[26px] font-bold text-black leading-tight tracking-tight">
                  Verify your WhatsApp number
                </h1>
                <p className="text-[13px] text-black/60 mt-1 leading-relaxed">
                  We&rsquo;ve sent a verification code to WhatsApp on{' '}
                  <span className="font-semibold text-black">{maskedPhone}</span>
                </p>
              </div>

              {/* Development Mock Banner */}
              {devOtp && (
                <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-700 block">
                        Demo mode
                      </span>
                      <span>
                        Your verification code:{' '}
                        <strong className="font-mono text-sm tracking-widest text-amber-950">
                          {devOtp}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtp(devOtp);
                        handleVerifyAndRegister(devOtp);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-amber-200/80 hover:bg-amber-300 rounded text-amber-900 transition-colors"
                    >
                      Autofill &amp; Verify
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700/80 mt-1">
                    WhatsApp delivery isn't switched on yet, so the code is shown here.
                  </p>
                </div>
              )}

              {/* 6 OTP Boxes */}
              <div className="mb-4">
                <OtpInput
                  value={otp}
                  onChange={(val) => {
                    setOtp(val);
                    clearError();
                  }}
                  onComplete={(code) => handleVerifyAndRegister(code)}
                  disabled={isLoading}
                  hasError={Boolean(error)}
                />
              </div>

              {/* Resend Actions & Countdown */}
              <div className="flex items-center justify-between text-xs text-black/55 my-4">
                <span>Didn&rsquo;t receive code?</span>
                {cooldownSeconds > 0 ? (
                  <span className="text-black/45 font-medium">
                    Resend in <strong className="font-mono text-black">{cooldownSeconds}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="font-semibold text-black hover:text-[#FCA311] transition-colors underline underline-offset-2"
                  >
                    Resend code
                  </button>
                )}
              </div>

              {/* Verify & Create Account CTA */}
              <button
                type="button"
                onClick={() => handleVerifyAndRegister()}
                disabled={isLoading || otp.length !== 6}
                className="w-full h-12 min-h-[48px] rounded-lg bg-black text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-black/85 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {isLoading ? <Spinner /> : 'Verify & Create Account'}
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="mt-6 text-center text-[13px] text-black/55">
            Already have an account?{' '}
            <Link
              href={signInHref}
              className="font-semibold text-black hover:text-[#FCA311] transition-colors underline underline-offset-4 decoration-black/20 hover:decoration-[#FCA311]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-field" />}>
      <SignUpContent />
    </Suspense>
  );
}
