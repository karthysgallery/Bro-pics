import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirebaseApp } from '../firebase-client';

export interface AuthApiResponse<T = any> {
  success?: boolean;
  error?: string;
  code?: string;
  notRegistered?: boolean;
  user?: {
    id: string;
    phone: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    role: string;
    whatsappVerified: boolean;
  };
  customToken?: string;
  maskedPhone?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  devOtp?: string;
}

/** Shown when the code was right but this browser could not finish signing in. */
export const BROWSER_SIGN_IN_FAILED =
  "Your code was correct, but this browser couldn't finish signing you in. Check your internet connection and try again. If it keeps happening, open karthysgallery.in in Chrome.";

/**
 * Signs this browser into Firebase Auth with the server-issued custom token. This browser session IS the sign-in:
 * checkout, the cart and orders all read it, so a failure here must not be reported as "signed in". It used to be
 * swallowed, and on phones where the call failed (a dropped connection, a privacy/ad blocker on Google's sign-in
 * address, storage switched off) the page said "Signed in successfully", then checkout asked to sign in again.
 * Returns whether the browser is now signed in; one retry covers a dropped connection.
 */
export async function syncFirebaseCustomToken(customToken?: string): Promise<boolean> {
  if (!customToken || typeof window === 'undefined') return false;

  // Don't attempt actual Firebase sign in for mock tokens in offline/development test harness
  if (customToken.startsWith('mock_custom_token_')) {
    return true;
  }

  const auth = getAuth(getFirebaseApp());
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await signInWithCustomToken(auth, customToken);
      return true;
    } catch (err) {
      console.warn('[auth-client] Firebase custom token sign-in failed:', err);
    }
  }
  return false;
}

export async function sendWhatsAppOtp(phone: string, purpose: 'login' | 'register' | 'quick'): Promise<AuthApiResponse> {
  try {
    const res = await fetch('/api/auth/send-whatsapp-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, purpose }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to send WhatsApp code.', notRegistered: data.notRegistered };
    }
    return { success: true, ...data };
  } catch {
    return { success: false, error: 'Something went wrong. Please check your connection and try again.' };
  }
}

export async function resendWhatsAppOtp(phone: string, purpose: 'login' | 'register' | 'quick'): Promise<AuthApiResponse> {
  try {
    const res = await fetch('/api/auth/resend-whatsapp-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, purpose }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to resend WhatsApp code.', code: data.code };
    }
    return { success: true, ...data };
  } catch {
    return { success: false, error: 'Something went wrong. Please check your connection and try again.' };
  }
}

export async function verifyWhatsAppOtp(params: {
  phone: string;
  otp: string;
  purpose: 'login' | 'register' | 'quick';
  fullName?: string;
  email?: string;
  password?: string;
}): Promise<AuthApiResponse> {
  try {
    const res = await fetch('/api/auth/verify-whatsapp-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Verification failed. Please try again.', code: data.code, notRegistered: data.notRegistered };
    }

    if (!(await syncFirebaseCustomToken(data.customToken))) {
      return { success: false, error: BROWSER_SIGN_IN_FAILED, code: 'browser_sign_in_failed' };
    }

    return { success: true, ...data };
  } catch {
    return { success: false, error: 'Something went wrong. Please check your connection and try again.' };
  }
}

export async function loginWithPassword(phone: string, password: string): Promise<AuthApiResponse> {
  try {
    const res = await fetch('/api/auth/login-with-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Invalid credentials.', notRegistered: data.notRegistered };
    }

    if (!(await syncFirebaseCustomToken(data.customToken))) {
      return { success: false, error: BROWSER_SIGN_IN_FAILED, code: 'browser_sign_in_failed' };
    }

    return { success: true, ...data };
  } catch {
    return { success: false, error: 'Something went wrong. Please check your connection and try again.' };
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Non-blocking
  }

  try {
    const auth = getAuth(getFirebaseApp());
    await auth.signOut();
  } catch {
    // Non-blocking
  }
}
