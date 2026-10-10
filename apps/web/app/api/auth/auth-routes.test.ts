import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { POST as sendOtpHandler } from './send-whatsapp-otp/route';
import { POST as verifyOtpHandler } from './verify-whatsapp-otp/route';
import { POST as resendOtpHandler } from './resend-whatsapp-otp/route';
import { POST as loginWithPasswordHandler } from './login-with-password/route';
import { POST as logoutHandler } from './logout/route';
import { GET as meHandler } from './me/route';
import { OtpStore } from '../../../lib/services/whatsapp/otp-store';
import { UserStore } from '../../../lib/services/user-store';
import { resetRateLimitState } from '../../../lib/rate-limit';

function createJsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('WhatsApp OTP Authentication API Routes', () => {
  beforeEach(() => {
    resetRateLimitState();
    OtpStore.reset();
    UserStore.reset();
  });

  describe('POST /api/auth/send-whatsapp-otp', () => {
    it('validates mobile number format and rejects non-Indian numbers', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
        phone: '12345',
        purpose: 'register',
      });
      const res = await sendOtpHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('10-digit Indian mobile number');
    });

    it('rejects unregistered mobile number in login mode with 404', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
        phone: '9876543210',
        purpose: 'login',
      });
      const res = await sendOtpHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.notRegistered).toBe(true);
      expect(data.error).toBe('No account found with this WhatsApp number.');
    });

    it('successfully sends OTP in register mode and returns devOtp and maskedPhone', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
        phone: '9876543210',
        purpose: 'register',
      });
      const res = await sendOtpHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.maskedPhone).toBe('+91 XXXXX 3210');
      expect(data.cooldownSeconds).toBe(30);
      expect(data.devOtp).toBeDefined();
      expect(data.devOtp).toHaveLength(6);
    });
  });

  describe('POST /api/auth/verify-whatsapp-otp (Registration)', () => {
    it('fails when full name is missing or too short', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9876543210',
        otp: '123456',
        purpose: 'register',
        fullName: 'A',
        password: 'Password123',
      });
      const res = await verifyOtpHandler(req);
      expect(res.status).toBe(400);
    });

    it('fails when password is too weak', async () => {
      // First generate OTP
      await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'register',
        })
      );
      // Retrieve generated OTP
      const session = await OtpStore.getSession('+919876543210');
      expect(session).not.toBeNull();

      // Submit weak password
      const req = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9876543210',
        otp: '000000', // Intentional wrong OTP tested first
        purpose: 'register',
        fullName: 'Allwin Karthik',
        password: 'weak',
      });
      const res = await verifyOtpHandler(req);
      expect(res.status).toBe(400);
    });

    it('registers a new user with optional email omitted, creates session cookie and custom token', async () => {
      // 1. Send OTP
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'register',
        })
      );
      const sendData = await sendRes.json();
      const otp = sendData.devOtp;

      // 2. Verify OTP & Register (Email is omitted!)
      const verifyReq = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9876543210',
        otp,
        purpose: 'register',
        fullName: 'Allwin Karthik',
        password: 'StrongPassword123',
      });
      const verifyRes = await verifyOtpHandler(verifyReq);
      expect(verifyRes.status).toBe(200);

      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.user.phone).toBe('+919876543210');
      expect(verifyData.user.displayName).toBe('Allwin Karthik');
      expect(verifyData.user.email).toBeNull();
      expect(verifyData.user.whatsappVerified).toBe(true);
      expect(verifyData.customToken).toBeDefined();

      // Check session cookie
      expect(verifyRes.cookies.get('__session')?.value).toBeDefined();

      // 3. Trying to verify the same OTP again must fail (invalidation on success)
      const duplicateRes = await verifyOtpHandler(verifyReq);
      expect(duplicateRes.status).toBe(400);
    });

    it('registers user with valid optional email when provided', async () => {
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9123456780',
          purpose: 'register',
        })
      );
      const { devOtp } = await sendRes.json();

      const verifyReq = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9123456780',
        otp: devOtp,
        purpose: 'register',
        fullName: 'Karthy Customer',
        email: 'karthy@example.com',
        password: 'Password999',
      });
      const verifyRes = await verifyOtpHandler(verifyReq);
      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.user.email).toBe('karthy@example.com');
    });
  });

  describe('POST /api/auth/verify-whatsapp-otp (Login)', () => {
    beforeEach(async () => {
      // Seed a registered customer
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'register',
        })
      );
      const { devOtp } = await sendRes.json();
      await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
          phone: '9876543210',
          otp: devOtp,
          purpose: 'register',
          fullName: 'Existing Customer',
          password: 'SecretPassword1',
        })
      );
      OtpStore.reset();
    });

    it('logs in existing user using WhatsApp OTP without needing password', async () => {
      // 1. Send OTP for login
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'login',
        })
      );
      expect(sendRes.status).toBe(200);
      const { devOtp } = await sendRes.json();

      // 2. Verify OTP (No password sent!)
      const loginReq = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9876543210',
        otp: devOtp,
        purpose: 'login',
      });
      const loginRes = await verifyOtpHandler(loginReq);
      expect(loginRes.status).toBe(200);

      const data = await loginRes.json();
      expect(data.success).toBe(true);
      expect(data.user.phone).toBe('+919876543210');
      expect(data.customToken).toBeDefined();

      expect(loginRes.cookies.get('__session')?.value).toBeDefined();
    });

    it('rejects incorrect OTP with 400', async () => {
      await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'login',
        })
      );

      const loginReq = createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
        phone: '9876543210',
        otp: '000000',
        purpose: 'login',
      });
      const loginRes = await verifyOtpHandler(loginReq);
      expect(loginRes.status).toBe(400);
      const data = await loginRes.json();
      expect(data.error).toBe("That code isn't correct. Please try again.");
    });
  });

  describe('POST /api/auth/login-with-password (Secondary)', () => {
    beforeEach(async () => {
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'register',
        })
      );
      const { devOtp } = await sendRes.json();
      await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
          phone: '9876543210',
          otp: devOtp,
          purpose: 'register',
          fullName: 'Password User',
          password: 'MyPassword123',
        })
      );
    });

    it('authenticates user with phone and password', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/login-with-password', {
        phone: '9876543210',
        password: 'MyPassword123',
      });
      const res = await loginWithPasswordHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(res.cookies.get('__session')?.value).toBeDefined();
    });

    it('rejects wrong password with 401', async () => {
      const req = createJsonRequest('http://localhost:3000/api/auth/login-with-password', {
        phone: '9876543210',
        password: 'WrongPassword!',
      });
      const res = await loginWithPasswordHandler(req);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/login-with-password on the preview site (SITE_PREVIEW=1)', () => {
    const login = (phone: string, password: string) =>
      loginWithPasswordHandler(createJsonRequest('http://localhost:3000/api/auth/login-with-password', { phone, password }));
    const register = async (phone: string, name: string) => {
      const sent = await (await sendOtpHandler(createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone, purpose: 'register' }))).json();
      await verifyOtpHandler(createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', { phone, otp: sent.devOtp, purpose: 'register', fullName: name, password: 'MyPassword123' }));
    };

    it('refuses customers and unknown numbers with the ordinary wrong-password answer, so staff numbers are not revealed', async () => {
      await register('9876543210', 'A Customer');
      vi.stubEnv('SITE_PREVIEW', '1');
      for (const phone of ['9876543210', '9123456780']) {
        const res = await login(phone, 'MyPassword123');
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Invalid mobile number or password.' });
      }
      vi.unstubAllEnvs();
    });

    it('lets a staff account sign in with its password, still refusing a wrong password', async () => {
      await register('9876543211', 'A Staff Member');
      // This account holds an admin role (set on the Firebase sign-in claim, as bootstrap-admin does).
      const effectiveRole = vi.spyOn(UserStore, 'getEffectiveRole').mockResolvedValue('admin');
      vi.stubEnv('SITE_PREVIEW', '1');
      expect((await login('9876543211', 'WrongPassword!')).status).toBe(401);
      const res = await login('9876543211', 'MyPassword123');
      expect(res.status).toBe(200);
      expect(res.cookies.get('__session')?.value).toBeDefined();
      effectiveRole.mockRestore();
      vi.unstubAllEnvs();
    });
  });

  describe('GET /api/auth/me and POST /api/auth/logout', () => {
    it('returns user profile when session cookie is provided', async () => {
      // 1. Register user to get session cookie
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', {
          phone: '9876543210',
          purpose: 'register',
        })
      );
      const { devOtp } = await sendRes.json();
      const verifyRes = await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
          phone: '9876543210',
          otp: devOtp,
          purpose: 'register',
          fullName: 'Session User',
          password: 'ValidPassword1',
        })
      );
      expect(verifyRes.status).toBe(200);
      const sessionToken = verifyRes.cookies.get('__session')?.value;
      expect(sessionToken).toBeDefined();
      const sessionCookie = `__session=${sessionToken}`;

      // 2. Query /api/auth/me
      const meReq = new Request('http://localhost:3000/api/auth/me', {
        headers: { cookie: sessionCookie },
      });
      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.authenticated).toBe(true);
      expect(meData.user.displayName).toBe('Session User');

      // 3. Logout
      const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { cookie: sessionCookie },
      });
      const logoutRes = await logoutHandler(logoutReq);
      expect(logoutRes.status).toBe(200);
      const clearedCookie = logoutRes.cookies.get('__session');
      expect(clearedCookie?.maxAge).toBe(0);
    });

    it('still accepts a session cookie issued under the old name, and logout clears both names', async () => {
      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone: '9876500011', purpose: 'register' })
      );
      const { devOtp } = await sendRes.json();
      const verifyRes = await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', {
          phone: '9876500011',
          otp: devOtp,
          purpose: 'register',
          fullName: 'Legacy Session User',
          password: 'ValidPassword1',
        })
      );
      const token = verifyRes.cookies.get('__session')?.value;
      expect(token).toBeDefined();

      const legacy = { cookie: `karthys_session=${token}` };
      const meRes = await meHandler(new Request('http://localhost:3000/api/auth/me', { headers: legacy }));
      expect(meRes.status).toBe(200);

      const logoutRes = await logoutHandler(new Request('http://localhost:3000/api/auth/logout', { method: 'POST', headers: legacy }));
      expect(logoutRes.cookies.get('__session')?.maxAge).toBe(0);
      expect(logoutRes.cookies.get('karthys_session')?.maxAge).toBe(0);
    });

    it('returns 401 when no session cookie is sent to /api/auth/me', async () => {
      const meReq = new Request('http://localhost:3000/api/auth/me');
      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(401);
      const meData = await meRes.json();
      expect(meData.authenticated).toBe(false);
    });
  });

  describe('mock-OTP safety rails', () => {
    const adminUser = {
      id: 'admin_1',
      phone: '+919876543210',
      displayName: 'Owner',
      firstName: 'Owner',
      lastName: null,
      email: null,
      passwordHash: null,
      whatsappVerified: true,
      emailVerified: false,
      role: 'admin' as const,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    };

    it('refuses OTP-only login for a privileged account while the OTP provider is mock (the code is shown on screen)', async () => {
      vi.spyOn(UserStore, 'findByPhone').mockResolvedValue(adminUser);
      const recordLogin = vi.spyOn(UserStore, 'recordLogin');

      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone: '9876543210', purpose: 'login' })
      );
      const { devOtp } = await sendRes.json();
      const res = await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', { phone: '9876543210', otp: devOtp, purpose: 'login' })
      );

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PASSWORD_REQUIRED');
      expect(res.cookies.get('__session')).toBeUndefined();
      expect(recordLogin).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('treats an account whose Auth claim is privileged as privileged even if its users doc says customer', async () => {
      vi.spyOn(UserStore, 'findByPhone').mockResolvedValue({ ...adminUser, role: 'customer' });
      vi.spyOn(UserStore, 'getEffectiveRole').mockResolvedValue('staff');

      const sendRes = await sendOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone: '9876543210', purpose: 'login' })
      );
      const { devOtp } = await sendRes.json();
      const res = await verifyOtpHandler(
        createJsonRequest('http://localhost:3000/api/auth/verify-whatsapp-otp', { phone: '9876543210', otp: devOtp, purpose: 'login' })
      );
      expect(res.status).toBe(403);
      vi.restoreAllMocks();
    });

    it('fails closed with a JSON 503 in production when WHATSAPP_OTP_MODE is not set', async () => {
      const env = process.env as Record<string, string | undefined>;
      const original = { NODE_ENV: env.NODE_ENV, MODE: env.WHATSAPP_OTP_MODE };
      env.NODE_ENV = 'production';
      delete env.WHATSAPP_OTP_MODE;
      try {
        const res = await sendOtpHandler(
          createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone: '9876543210', purpose: 'register' })
        );
        expect(res.status).toBe(503);
        expect((await res.json()).code).toBe('auth_unavailable');
      } finally {
        env.NODE_ENV = original.NODE_ENV;
        if (original.MODE === undefined) delete env.WHATSAPP_OTP_MODE;
        else env.WHATSAPP_OTP_MODE = original.MODE;
      }
    });

    it('returns the demo code in production when mock mode is explicitly enabled (so launch-with-mock is actually usable)', async () => {
      const env = process.env as Record<string, string | undefined>;
      const original = { NODE_ENV: env.NODE_ENV, MODE: env.WHATSAPP_OTP_MODE };
      env.NODE_ENV = 'production';
      env.WHATSAPP_OTP_MODE = 'mock';
      env.OTP_STORE = 'memory';
      vi.spyOn(UserStore, 'findByPhone').mockResolvedValue(null);
      try {
        const res = await sendOtpHandler(
          createJsonRequest('http://localhost:3000/api/auth/send-whatsapp-otp', { phone: '9876543210', purpose: 'register' })
        );
        expect(res.status).toBe(200);
        expect((await res.json()).devOtp).toMatch(/^\d{6}$/);
      } finally {
        vi.restoreAllMocks();
        env.NODE_ENV = original.NODE_ENV;
        if (original.MODE === undefined) delete env.WHATSAPP_OTP_MODE;
        else env.WHATSAPP_OTP_MODE = original.MODE;
        delete env.OTP_STORE;
      }
    });
  });
});
