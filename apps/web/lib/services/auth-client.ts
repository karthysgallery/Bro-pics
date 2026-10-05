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

/**
 * Attempts to sign the client into Firebase Auth using the server-issued custom token.
 * This bridges the custom WhatsApp OTP backend with existing Firebase client context (Cart, Wishlist).
 */
export async function syncFirebaseCustomToken(customToken?: string): Promise<void> {
  if (!customToken || typeof window === 'undefined') return;

  // Don't attempt actual Firebase sign in for mock tokens in offline/development test harness
  if (customToken.startsWith('mock_custom_token_')) {
    return;
  }

  try {
    const auth = getAuth(getFirebaseApp());
    await signInWithCustomToken(auth, customToken);
  } catch (err) {
    console.warn('[auth-client] Firebase custom token sync warning:', err);
  }
}

export async function sendWhatsAppOtp(phone: string, purpose: 'login' | 'register'): Promise<AuthApiResponse> {
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

export async function resendWhatsAppOtp(phone: string, purpose: 'login' | 'register'): Promise<AuthApiResponse> {
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
  purpose: 'login' | 'register';
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

    if (data.customToken) {
      await syncFirebaseCustomToken(data.customToken);
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

    if (data.customToken) {
      await syncFirebaseCustomToken(data.customToken);
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
