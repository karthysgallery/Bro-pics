'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────
   ICONS (Professional Outline SVG Icons, 1.5px / 2px stroke)
   ───────────────────────────────────────────────────────── */
export const IconAlertCircle = ({ className = '' }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const IconCheckCircle = ({ className = '' }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export const IconEye = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export const IconArrowLeft = ({ className = '' }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export const IconCheck = ({ className = '' }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const GoogleIcon = ({ className = '' }: { className?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.28v3.15C3.27 21.36 7.35 24 12 24z" />
    <path fill="#FBBC05" d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.28C.46 8.22 0 10.06 0 12s.46 3.78 1.28 5.41l4-3.15z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.64 1.28 6.59l4 3.15c.95-2.84 3.6-4.99 6.72-4.99z" />
  </svg>
);

export const Spinner = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <span className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} aria-hidden="true" />
);

/* ─────────────────────────────────────────────────────────
   1. AuthLogo
   ───────────────────────────────────────────────────────── */
export interface AuthLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function AuthLogo({ variant = 'dark', size = 'md', href = '/' }: AuthLogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const textClass = variant === 'light' ? 'text-white' : 'text-ink';

  return (
    <Link href={href} className="inline-block transition-opacity hover:opacity-90">
      <span className={`font-display font-bold tracking-tight ${sizeClasses[size]} ${textClass}`}>
        Karthys<span className="text-gold">Gallery</span>
      </span>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────
   2. AuthInput
   ───────────────────────────────────────────────────────── */
export interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  success?: boolean;
  helperText?: string;
}

export function AuthInput({
  label,
  id,
  error,
  success,
  helperText,
  disabled,
  className = '',
  ...props
}: AuthInputProps) {
  const hasError = Boolean(error);

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink/80 mb-1.5">
        {label} {props.required && <span className="text-red-500" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={`w-full h-12 px-4 rounded-lg border bg-white text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 transition-all duration-150 disabled:opacity-50 disabled:bg-[#FAF8F5] disabled:cursor-not-allowed ${
            hasError
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
              : success
              ? 'border-emerald-300 focus:ring-emerald-200 focus:border-emerald-400'
              : 'border-line focus:ring-gold/20 focus:border-gold'
          } ${className}`}
          {...props}
        />
        {success && !hasError && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600">
            <IconCheck className="w-4 h-4" />
          </div>
        )}
      </div>
      {hasError && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-red-600 font-medium flex items-center gap-1">
          <IconAlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!hasError && helperText && (
        <p id={`${id}-helper`} className="mt-1 text-[12px] text-ink/50">
          {helperText}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   3. PasswordInput
   ───────────────────────────────────────────────────────── */
export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string | null;
  helperText?: string;
}

export function PasswordInput({
  label,
  id,
  error,
  helperText,
  disabled,
  className = '',
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const hasError = Boolean(error);

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink/80 mb-1.5">
        {label} {props.required && <span className="text-red-500" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={`w-full h-12 pl-4 pr-12 rounded-lg border bg-white text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 transition-all duration-150 disabled:opacity-50 disabled:bg-[#FAF8F5] disabled:cursor-not-allowed ${
            hasError
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
              : 'border-line focus:ring-gold/20 focus:border-gold'
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-ink/40 hover:text-ink transition-colors rounded"
        >
          {showPassword ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
      {hasError && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-red-600 font-medium flex items-center gap-1">
          <IconAlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!hasError && helperText && (
        <p id={`${id}-helper`} className="mt-1 text-[12px] text-ink/50">
          {helperText}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   4. PhoneInput
   ───────────────────────────────────────────────────────── */
export interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
  helperText?: string;
  countryPrefix?: string;
}

export function PhoneInput({
  label,
  id,
  value,
  onChange,
  error,
  helperText,
  disabled,
  countryPrefix = '+91',
  className = '',
  ...props
}: PhoneInputProps) {
  const hasError = Boolean(error);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep only numbers and max 10 digits
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    e.target.value = cleaned;
    onChange(e);
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink/80 mb-1.5">
        {label} {props.required && <span className="text-red-500" aria-hidden="true">*</span>}
      </label>
      <div className="flex">
        <div className="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-line bg-tint/50 text-sm font-semibold text-ink/80 select-none">
          <span>{countryPrefix}</span>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={`flex-1 h-12 px-4 rounded-r-lg border bg-white text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 transition-all duration-150 disabled:opacity-50 disabled:bg-[#FAF8F5] disabled:cursor-not-allowed ${
            hasError
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
              : 'border-line focus:ring-gold/20 focus:border-gold'
          } ${className}`}
          {...props}
        />
      </div>
      {hasError && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-red-600 font-medium flex items-center gap-1">
          <IconAlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!hasError && helperText && (
        <p id={`${id}-helper`} className="mt-1 text-[12px] text-ink/50">
          {helperText}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   5. PasswordStrength
   ───────────────────────────────────────────────────────── */
export interface PasswordStrengthProps {
  password: string;
  showRequirements?: boolean;
}

export function PasswordStrength({ password, showRequirements = true }: PasswordStrengthProps) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: 'bg-transparent' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { score: 2, label: 'Medium', color: 'bg-amber-500' };
    return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
  }, [password]);

  const rules = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Bars */}
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-ink/55">Password strength:</span>
          <span className={`font-semibold ${
            strength.score === 1 ? 'text-red-600' : strength.score === 2 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {strength.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.score >= 1 ? strength.color : 'bg-tint'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.score >= 2 ? strength.color : 'bg-tint'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${strength.score >= 3 ? strength.color : 'bg-tint'}`} />
        </div>
      </div>

      {/* Requirements checklist */}
      {showRequirements && (
        <div className="space-y-1 pt-1">
          {rules.map(({ label, met }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors duration-200 ${
                met ? 'bg-emerald-500 text-white' : 'bg-line text-transparent'
              }`}>
                <IconCheck className="w-2.5 h-2.5" />
              </span>
              <span className={`text-[12px] transition-colors duration-200 ${
                met ? 'text-emerald-700 font-medium' : 'text-ink/50'
              }`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   6. Checkbox
   ───────────────────────────────────────────────────────── */
export interface CheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}

export function Checkbox({ id, checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label htmlFor={id} className={`inline-flex items-start gap-2.5 text-xs text-ink/75 cursor-pointer select-none leading-relaxed ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="relative flex items-center mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className={`w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
          checked
            ? 'bg-gold border-gold text-ink'
            : 'border-line bg-white hover:border-ink/50 peer-focus-visible:ring-2 peer-focus-visible:ring-gold/30'
        }`}>
          {checked && <IconCheck className="w-3 h-3 text-ink" />}
        </div>
      </div>
      <span>{label}</span>
    </label>
  );
}

/* ─────────────────────────────────────────────────────────
   7. PrimaryButton
   ───────────────────────────────────────────────────────── */
export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function PrimaryButton({
  children,
  isLoading,
  fullWidth = true,
  disabled,
  className = '',
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`min-h-[44px] h-12 rounded-lg bg-gold hover:bg-gold-deep text-ink font-semibold text-sm transition-all duration-150 shadow-xs hover:shadow active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer ${
        fullWidth ? 'w-full' : 'px-6'
      } ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner className="w-5 h-5 text-ink" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
   8. GoogleButton
   ───────────────────────────────────────────────────────── */
export interface GoogleButtonProps {
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  label?: string;
  fullWidth?: boolean;
}

export function GoogleButton({
  onClick,
  isLoading,
  disabled,
  label = 'Continue with Google',
  fullWidth = true,
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`min-h-[44px] h-12 rounded-lg border border-line hover:border-ink/30 bg-white hover:bg-tint/30 text-ink font-medium text-sm transition-all duration-150 flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${
        fullWidth ? 'w-full' : 'px-6'
      }`}
    >
      {isLoading ? (
        <Spinner className="w-4 h-4 text-ink/70" />
      ) : (
        <GoogleIcon />
      )}
      <span>{label}</span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────
   9. Divider
   ───────────────────────────────────────────────────────── */
export function Divider({ text = 'OR' }: { text?: string }) {
  return (
    <div className="relative my-6 text-center">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-line" />
      </div>
      <span className="relative z-10 bg-field px-3 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
        {text}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   10. AuthError & AuthSuccess
   ───────────────────────────────────────────────────────── */
export function AuthError({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200/80 flex items-start gap-2.5 transition-all duration-150"
    >
      <IconAlertCircle className="shrink-0 mt-0.5 text-red-500" />
      <p className="flex-1 text-[13px] text-red-800 font-medium leading-snug">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-400 hover:text-red-700 p-0.5 rounded"
          aria-label="Dismiss alert"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function AuthSuccess({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center gap-2.5 transition-all duration-150"
    >
      <IconCheckCircle className="shrink-0 text-emerald-600" />
      <p className="text-[13px] text-emerald-800 font-medium">{message}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   11. OTPInput
   ───────────────────────────────────────────────────────── */
export interface OTPInputProps {
  length?: number;
  value: string[];
  onChange: (value: string[]) => void;
  error?: boolean;
  disabled?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  error = false,
  disabled = false,
}: OTPInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigitChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const next = [...value];
    next[index] = char.slice(-1);
    onChange(next);

    // Auto-advance
    if (char && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    const next = [...value];
    for (let i = 0; i < length; i++) {
      next[i] = pasted[i] || '';
    }
    onChange(next);

    const focusIdx = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  return (
    <div className="flex items-center justify-between gap-2 max-w-[340px] mx-auto">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          value={value[i] || ''}
          onChange={(e) => handleDigitChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Verification code digit ${i + 1}`}
          className={`w-11 sm:w-12 h-12 sm:h-13 text-center text-xl font-bold rounded-lg border bg-white text-ink focus:outline-none transition-all duration-150 disabled:opacity-50 disabled:bg-[#FAF8F5] ${
            error
              ? 'border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400'
              : 'border-line focus:ring-2 focus:ring-gold/30 focus:border-gold'
          }`}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   12. ResendOTP
   ───────────────────────────────────────────────────────── */
export interface ResendOTPProps {
  onResend: () => void;
  countdownSeconds?: number;
  isLoading?: boolean;
}

export function ResendOTP({ onResend, countdownSeconds = 30, isLoading = false }: ResendOTPProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleTriggerResend = () => {
    if (countdown > 0 || isLoading) return;
    onResend();
    setCountdown(countdownSeconds);
  };

  return (
    <div className="flex items-center justify-between text-xs text-ink/60">
      <span>Didn&apos;t receive the code?</span>
      {countdown > 0 ? (
        <span className="font-medium text-ink/40">
          Resend in <span className="tabular-nums font-semibold text-ink/70">{countdown}s</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={handleTriggerResend}
          disabled={isLoading}
          className="font-semibold text-ink hover:text-gold-deep transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? 'Sending...' : 'Resend code'}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   13. AuthFooter
   ───────────────────────────────────────────────────────── */
export interface AuthFooterProps {
  prompt: string;
  actionText: string;
  actionHref: string;
}

export function AuthFooter({ prompt, actionText, actionHref }: AuthFooterProps) {
  return (
    <div className="mt-8 text-center text-xs text-ink/60">
      <span>{prompt} </span>
      <Link
        href={actionHref}
        className="font-semibold text-ink hover:text-gold-deep transition-colors underline-offset-4 hover:underline"
      >
        {actionText}
      </Link>
    </div>
  );
}
