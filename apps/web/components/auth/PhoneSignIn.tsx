'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseApp } from '../../lib/firebase-client';

interface PhoneSignInProps {
  onSignedIn: (user: FirebaseUser) => void;
}

// A short client-side window after sending an OTP before "Send OTP" can be
// pressed again — Firebase's phone-auth backend already enforces its own
// abuse limits server-side, so this is purely UX (stops an impatient
// double-tap from spawning a second recaptcha challenge).
const RESEND_COOLDOWN_SECONDS = 30;
// After this many wrong-OTP attempts in a row, the generic "Incorrect OTP"
// message stops being helpful — surface a clearer nudge toward resending
// instead of repeating the same string forever.
const ATTEMPTS_BEFORE_RESEND_HINT = 3;

export function PhoneSignIn({ onSignedIn }: PhoneSignInProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  // Holds the current RecaptchaVerifier instance so a second "Send OTP"
  // click in the same mount (e.g. after mistyping the phone number) can
  // .clear() the prior instance before constructing a new one against the
  // same container div. Without this, a second construction against an
  // already-rendered widget throws, and that throw was being swallowed
  // into the same generic error string as every other failure — leaving
  // no way to recover except closing and reopening the sign-in modal.
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const handleSendOtp = async () => {
    setError(null);
    try {
      verifierRef.current?.clear();
      const auth = getAuth(getFirebaseApp());
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current!, { size: 'invisible' });
      verifierRef.current = verifier;
      const result = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmationResult(result);
      setFailedAttempts(0);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('Could not send OTP. Check the phone number and try again.');
    }
  };

  const handleResendOtp = async () => {
    setConfirmationResult(null);
    setOtp('');
    await handleSendOtp();
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!confirmationResult) return;
    try {
      const credential = await confirmationResult.confirm(otp);
      onSignedIn(credential.user);
    } catch {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setError(
        nextAttempts >= ATTEMPTS_BEFORE_RESEND_HINT
          ? "That code isn't working. Try resending a new one."
          : 'Incorrect OTP. Try again.'
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!confirmationResult ? (
        <>
          <label htmlFor="phone-input" className="text-sm font-medium text-ink">Phone number</label>
          <input
            id="phone-input"
            aria-label="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91XXXXXXXXXX"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink placeholder:text-ink/40"
          />
          <button onClick={handleSendOtp} className="rounded-full bg-gold text-ink px-4 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors">
            Send OTP
          </button>
        </>
      ) : (
        <>
          <label htmlFor="otp-input" className="text-sm font-medium text-ink">Enter OTP</label>
          <input
            id="otp-input"
            aria-label="Enter OTP"
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink placeholder:text-ink/40"
          />
          <button onClick={handleVerifyOtp} className="rounded-full bg-gold text-ink px-4 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors">
            Verify
          </button>
          <button
            onClick={handleResendOtp}
            disabled={resendCooldown > 0}
            className="text-sm text-accent hover:text-accent-dark disabled:text-ink/40 disabled:cursor-not-allowed w-fit"
          >
            {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
          </button>
        </>
      )}
      {error && <p className="text-sm text-alert">{error}</p>}
      <div ref={recaptchaContainerRef} />
    </div>
  );
}
