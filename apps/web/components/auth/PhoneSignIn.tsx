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

export function PhoneSignIn({ onSignedIn }: PhoneSignInProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const handleSendOtp = async () => {
    setError(null);
    try {
      verifierRef.current?.clear();
      const auth = getAuth(getFirebaseApp());
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current!, { size: 'invisible' });
      verifierRef.current = verifier;
      const result = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmationResult(result);
    } catch {
      setError('Could not send OTP. Check the phone number and try again.');
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!confirmationResult) return;
    try {
      const credential = await confirmationResult.confirm(otp);
      onSignedIn(credential.user);
    } catch {
      setError('Incorrect OTP. Try again.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!confirmationResult ? (
        <>
          <label htmlFor="phone-input">Phone number</label>
          <input
            id="phone-input"
            aria-label="Phone number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91XXXXXXXXXX"
            className="rounded border border-charcoal/20 px-3 py-2"
          />
          <button onClick={handleSendOtp} className="rounded bg-charcoal text-cream px-4 py-2">
            Send OTP
          </button>
        </>
      ) : (
        <>
          <label htmlFor="otp-input">Enter OTP</label>
          <input
            id="otp-input"
            aria-label="Enter OTP"
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="rounded border border-charcoal/20 px-3 py-2"
          />
          <button onClick={handleVerifyOtp} className="rounded bg-charcoal text-cream px-4 py-2">
            Verify
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div ref={recaptchaContainerRef} />
    </div>
  );
}
