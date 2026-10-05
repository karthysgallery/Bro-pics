/**
 * KarthysGallery — WhatsApp OTP Provider Architecture
 *
 * Designed as a production-grade abstraction where DEVELOPMENT uses
 * MockWhatsAppOtpProvider and PRODUCTION uses CloudWhatsAppOtpProvider
 * (Meta WhatsApp Business Platform / Cloud API).
 */

export interface SendOtpOptions {
  phoneNumber: string; // Normalized E.164 (e.g. +919876543210)
  purpose?: 'login' | 'register' | 'verification';
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
  devOtp?: string; // Only populated when WHATSAPP_OTP_MODE=mock AND NODE_ENV !== 'production'
  expiresInSeconds: number;
  cooldownSeconds: number;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  code?: 'INVALID_OTP' | 'EXPIRED_OTP' | 'TOO_MANY_ATTEMPTS' | 'NOT_FOUND';
}

export interface ResendOtpResult {
  success: boolean;
  error?: string;
  devOtp?: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
  code?: 'COOLDOWN_ACTIVE' | 'MAX_RESENDS_EXCEEDED';
}

export interface WhatsAppOtpProvider {
  readonly mode: 'mock' | 'production';
  sendOtp(options: SendOtpOptions): Promise<SendOtpResult>;
  verifyOtp(phoneNumber: string, otp: string): Promise<VerifyOtpResult>;
  resendOtp(options: SendOtpOptions): Promise<ResendOtpResult>;
}
