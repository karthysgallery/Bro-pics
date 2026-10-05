import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWhatsAppOtpProvider, resetWhatsAppOtpProvider, OtpNotConfiguredError } from './provider-factory';
import { MockWhatsAppOtpProvider } from './MockWhatsAppOtpProvider';
import { CloudWhatsAppOtpProvider } from './CloudWhatsAppOtpProvider';

describe('WhatsApp OTP Provider Factory', () => {
  const originalEnv = process.env.WHATSAPP_OTP_MODE;

  beforeEach(() => {
    resetWhatsAppOtpProvider();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.WHATSAPP_OTP_MODE;
    else process.env.WHATSAPP_OTP_MODE = originalEnv;
    resetWhatsAppOtpProvider();
  });

  it('defaults to MockWhatsAppOtpProvider when WHATSAPP_OTP_MODE is mock or unset', () => {
    delete process.env.WHATSAPP_OTP_MODE;
    const provider = getWhatsAppOtpProvider();
    expect(provider).toBeInstanceOf(MockWhatsAppOtpProvider);
    expect(provider.mode).toBe('mock');
  });

  it('selects CloudWhatsAppOtpProvider when WHATSAPP_OTP_MODE is production', () => {
    process.env.WHATSAPP_OTP_MODE = 'production';
    const provider = getWhatsAppOtpProvider();
    expect(provider).toBeInstanceOf(CloudWhatsAppOtpProvider);
    expect(provider.mode).toBe('production');
  });

  it('selects the mock provider in production only when WHATSAPP_OTP_MODE=mock is explicit', () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      env.WHATSAPP_OTP_MODE = 'mock';
      expect(getWhatsAppOtpProvider().mode).toBe('mock');
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });

  it('FAILS CLOSED in production when WHATSAPP_OTP_MODE is unset or unknown', () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      delete env.WHATSAPP_OTP_MODE;
      expect(() => getWhatsAppOtpProvider()).toThrow(OtpNotConfiguredError);
      env.WHATSAPP_OTP_MODE = 'sms';
      expect(() => getWhatsAppOtpProvider()).toThrow(OtpNotConfiguredError);
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });

  it('re-uses singleton instance on subsequent calls', () => {
    delete process.env.WHATSAPP_OTP_MODE;
    const p1 = getWhatsAppOtpProvider();
    const p2 = getWhatsAppOtpProvider();
    expect(p1).toBe(p2);
  });
});
