import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { logAuthEvent, getRecentAuthAuditLogs } from './auth-audit';

describe('Auth Audit Logger', () => {
  it('logs security events with masked phone numbers and request headers', async () => {
    const mockReq = new Request('http://localhost:3000/api/auth/send-whatsapp-otp', {
      headers: {
        'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 TestBrowser',
      },
    });

    const entry = await logAuthEvent({
      event: 'otp_requested',
      phoneNumberMasked: '+91 XXXXX 3210',
      userId: 'usr_test_123',
      request: mockReq,
      details: { purpose: 'login' },
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(entry.event).toBe('otp_requested');
    expect(entry.phoneNumberMasked).toBe('+91 XXXXX 3210');
    expect(entry.ipAddress).toBe('192.168.1.100');
    expect(entry.userAgent).toBe('Mozilla/5.0 TestBrowser');
    expect(entry.details?.purpose).toBe('login');

    const logs = getRecentAuthAuditLogs();
    expect(logs.some((l) => l.id === entry.id)).toBe(true);
  });
});
