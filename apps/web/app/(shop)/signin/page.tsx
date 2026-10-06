'use client';

import { safeRedirectTarget } from '../../../lib/safe-redirect';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { OtpInput } from '../../../components/auth/OtpInput';
import {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
  resendWhatsAppOtp,
  loginWithPassword,
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

const IconWhatsApp = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
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

const Spinner = () => (
  <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
);

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectTarget(searchParams.get('redirect'));
  // Carried across to sign-up so a new customer who came from checkout still returns there.
  const redirectQuery = redirectTarget !== '/account' ? `&redirect=${encodeURIComponent(redirectTarget)}` : '';

  // Step state: 'phone' | 'otp' | 'password'
  const [authMode, setAuthMode] = useState<'otp_phone' | 'otp_verify' | 'password'>('otp_phone');

  // Fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');

  // OTP metadata
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotRegistered, setIsNotRegistered] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resend countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Clean error on changes
  const clearError = () => {
    if (error) setError(null);
    if (isNotRegistered) setIsNotRegistered(false);
  };

  // 1. Submit Phone -> Send WhatsApp OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    clearError();

    const cleanDigits = phone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length !== 10 || !/^[6-9]/.test(cleanDigits)) {
      setError('Please enter a valid 10-digit Indian WhatsApp number.');
      return;
    }

    setIsLoading(true);
    const res = await sendWhatsAppOtp(cleanDigits, 'login');
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to send WhatsApp code.');
      if (res.notRegistered) {
        setIsNotRegistered(true);
      }
      return;
    }

    setMaskedPhone(res.maskedPhone || `+91 XXXXX ${cleanDigits.slice(-4)}`);
    setDevOtp(res.devOtp);
    setCooldownSeconds(res.cooldownSeconds || 30);
    setOtp('');
    setAuthMode('otp_verify');
  };

  // 2. Submit OTP -> Verify & Sign In
  const handleVerifyOtp = async (submittedOtp?: string) => {
    const code = submittedOtp || otp;
    clearError();

    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit WhatsApp verification code.');
      return;
    }

    setIsLoading(true);
    const res = await verifyWhatsAppOtp({
      phone: phone.replace(/\D/g, ''),
      otp: code,
      purpose: 'login',
    });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || "That code isn't correct. Please try again.");
      return;
    }

    setSuccessMessage('Signed in successfully! Redirecting...');
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

    const res = await resendWhatsAppOtp(phone.replace(/\D/g, ''), 'login');
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

  // 4. Secondary Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const cleanDigits = phone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length !== 10) {
      setError('Please enter your 10-digit registered mobile number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    const res = await loginWithPassword(cleanDigits, password);
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid mobile number or password.');
      if (res.notRegistered) {
        setIsNotRegistered(true);
      }
      return;
    }

    setSuccessMessage('Signed in successfully! Redirecting...');
    setTimeout(() => {
      router.push(redirectTarget);
      router.refresh();
    }, 700);
  };

  return (
    <div className="min-h-[100dvh] bg-field flex">

      {/* ── LEFT: Brand Visual Panel (Desktop lg+) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative flex-col justify-between overflow-hidden">
        <Image
          src="/banners/auth-signin.jpg"
          alt="Personalized family photo frames displayed on a warm living room wall"
          fill
          priority
          sizes="(min-width: 1024px) 48vw, 0px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Top: Logo */}
        <div className="relative z-10 p-8 xl:p-10">
          <Link href="/" className="inline-flex items-center gap-1.5 group">
            <span className="font-display text-xl font-bold tracking-tight text-white">
              Karthys<span className="text-gold">Gallery</span>
            </span>
          </Link>
        </div>

        {/* Bottom: Brand Statement */}
        <div className="relative z-10 p-8 xl:p-10 max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 mb-3">
            Handcrafted with love
          </p>
          <h2 className="font-display text-[28px] xl:text-[32px] font-bold text-white leading-[1.15] tracking-tight">
            Turn your memories into something you can keep forever.
          </h2>
          <p className="text-[13px] text-white/75 mt-3 leading-relaxed max-w-sm">
            Every frame is handcrafted with museum-grade materials, made to preserve your most cherished moments.
          </p>
          <div className="flex items-center gap-2.5 mt-5 pt-5 border-t border-white/15">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="#FCA311" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
            </div>
            <span className="text-[11px] text-white/70 font-medium">
              Trusted by 10,000+ homes across India
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Authentication Form ── */}
      <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 lg:px-12 xl:px-16 py-8 lg:py-12 bg-field">
        <div className="w-full max-w-[420px] mx-auto">

          {/* Mobile Back & Logo */}
          <div className="lg:hidden mb-6">
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
                  Karthys<span className="text-gold">Gallery</span>
                </span>
              </Link>
            </div>
          </div>

          {/* Desktop Logo */}
          <div className="hidden lg:block mb-8">
            <Link href="/" className="inline-block">
              <span className="font-display text-[22px] font-bold tracking-tight text-black">
                Karthys<span className="text-gold">Gallery</span>
              </span>
            </Link>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200/80 flex items-start gap-2.5"
              style={{ animation: 'fadeIn 0.15s ease-out' }}
            >
              <IconAlertCircle className="shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1">
                <p className="text-[13px] text-red-800 font-medium leading-snug">{error}</p>
                {isNotRegistered && (
                  <Link
                    href={`/signup?phone=${encodeURIComponent(phone.replace(/\D/g, ''))}${redirectQuery}`}
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-black mt-2 underline underline-offset-2 hover:text-gold"
                  >
                    Create an account with this number &rarr;
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center gap-2.5"
              style={{ animation: 'fadeIn 0.15s ease-out' }}
            >
              <IconCheckCircle className="shrink-0 text-emerald-600" />
              <p className="text-[13px] text-emerald-800 font-medium">{successMessage}</p>
            </div>
          )}

          {/* ========================================================
              STEP 1: PRIMARY LOGIN — MOBILE + WHATSAPP OTP
             ======================================================== */}
          {authMode === 'otp_phone' && (
            <>
              <div className="mb-7">
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-black leading-tight tracking-tight">
                  Welcome back
                </h1>
                <p className="text-[13px] sm:text-sm text-black/60 mt-1.5 leading-relaxed">
                  Sign in securely using WhatsApp.
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="signin-mobile"
                    className="block text-[13px] font-medium text-black/80 mb-1.5"
                  >
                    Mobile number
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-line bg-tint text-[13px] text-black/70 font-semibold select-none min-h-[48px]">
                      +91
                    </span>
                    <input
                      id="signin-mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ''));
                        clearError();
                      }}
                      placeholder="Enter 10-digit mobile number"
                      className="flex-1 h-12 min-h-[48px] px-4 rounded-r-lg border border-line bg-white text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold transition-all duration-150"
                    />
                  </div>
                  <p className="text-[11px] text-black/45 mt-1.5">
                    We will send a 6-digit verification code to your WhatsApp.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 min-h-[48px] rounded-lg bg-black text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-black/85 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  {isLoading ? (
                    <Spinner />
                  ) : (
                    <>
                      <IconWhatsApp className="text-emerald-400" />
                      <span>Continue with WhatsApp</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-field px-4 text-[11px] uppercase tracking-[0.15em] font-semibold text-black/35">
                    Or
                  </span>
                </div>
              </div>

              {/* Secondary Option: Password */}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setAuthMode('password');
                }}
                className="w-full h-12 min-h-[48px] rounded-lg border border-line bg-white hover:bg-field text-black/80 font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                Sign in with password
              </button>
            </>
          )}

          {/* ========================================================
              STEP 2: OTP VERIFICATION
             ======================================================== */}
          {authMode === 'otp_verify' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setAuthMode('otp_phone');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-black/55 hover:text-black mb-3 transition-colors"
                >
                  <IconArrowLeft />
                  <span>Change number</span>
                </button>
                <h1 className="font-display text-[24px] sm:text-[26px] font-bold text-black leading-tight tracking-tight">
                  Verify your WhatsApp number
                </h1>
                <p className="text-[13px] text-black/60 mt-1 leading-relaxed">
                  We&rsquo;ve sent a 6-digit verification code to WhatsApp on{' '}
                  <span className="font-semibold text-black">{maskedPhone}</span>
                </p>
              </div>

              {/* Development OTP Banner (Only shown in mock mode when devOtp is provided) */}
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
                        handleVerifyOtp(devOtp);
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
                  onComplete={(code) => handleVerifyOtp(code)}
                  disabled={isLoading}
                  hasError={Boolean(error)}
                />
              </div>

              {/* Resend actions & countdown */}
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
                    className="font-semibold text-black hover:text-gold transition-colors underline underline-offset-2"
                  >
                    Resend code
                  </button>
                )}
              </div>

              {/* Verify CTA */}
              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={isLoading || otp.length !== 6}
                className="w-full h-12 min-h-[48px] rounded-lg bg-black text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-black/85 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {isLoading ? <Spinner /> : 'Verify & Sign In'}
              </button>
            </div>
          )}

          {/* ========================================================
              SECONDARY: PASSWORD LOGIN
             ======================================================== */}
          {authMode === 'password' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setAuthMode('otp_phone');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-black/55 hover:text-black mb-3 transition-colors"
                >
                  <IconArrowLeft />
                  <span>Back to WhatsApp login</span>
                </button>
                <h1 className="font-display text-[26px] sm:text-[28px] font-bold text-black leading-tight tracking-tight">
                  Sign in with password
                </h1>
                <p className="text-[13px] text-black/60 mt-1 leading-relaxed">
                  Enter your registered mobile number and password.
                </p>
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-4" noValidate>
                {/* Mobile */}
                <div>
                  <label
                    htmlFor="pwd-mobile"
                    className="block text-[13px] font-medium text-black/80 mb-1.5"
                  >
                    Mobile number
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-line bg-tint text-[13px] text-black/70 font-semibold select-none min-h-[48px]">
                      +91
                    </span>
                    <input
                      id="pwd-mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ''));
                        clearError();
                      }}
                      placeholder="Enter 10-digit mobile number"
                      className="flex-1 h-12 min-h-[48px] px-4 rounded-r-lg border border-line bg-white text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="pwd-password"
                      className="block text-[13px] font-medium text-black/80"
                    >
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-[12px] font-medium text-black/60 hover:text-black transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      id="pwd-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      placeholder="Enter your password"
                      className="w-full h-12 min-h-[48px] pl-4 pr-12 rounded-lg border border-line bg-white text-sm text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold transition-all duration-150"
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
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 min-h-[48px] rounded-lg bg-black text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-black/85 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm mt-2"
                >
                  {isLoading ? <Spinner /> : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* Footer */}
          <p className="mt-8 text-center text-[13px] text-black/55">
            Don&rsquo;t have an account?{' '}
            <Link
              href={`/signup${phone || redirectQuery ? `?${[phone ? `phone=${encodeURIComponent(phone.replace(/\D/g, ''))}` : '', redirectQuery.replace(/^&/, '')].filter(Boolean).join('&')}` : ''}`}
              className="font-semibold text-black hover:text-gold transition-colors underline underline-offset-4 decoration-black/20 hover:decoration-[#FCA311]"
            >
              Create an account
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

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-field" />}>
      <SignInContent />
    </Suspense>
  );
}
