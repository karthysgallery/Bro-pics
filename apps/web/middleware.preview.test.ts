import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, isSignInBlockedInPreview } from './middleware';
import robots from './app/robots';

const req = (path: string) => new NextRequest(new URL(path, 'https://preview.example'), { method: 'POST' });

describe('SITE_PREVIEW', () => {
  afterEach(() => {
    delete process.env.SITE_PREVIEW;
  });

  it('blocks every way of signing in, but not logout or "who am I"', () => {
    for (const p of [
      '/api/auth/send-whatsapp-otp',
      '/api/auth/verify-whatsapp-otp',
      '/api/auth/resend-whatsapp-otp',
      '/api/auth/dev-admin-token',
      '/api/auth/revoke-sessions',
      '/api/staff/invite/accept',
    ]) expect(isSignInBlockedInPreview(p)).toBe(true);
    expect(isSignInBlockedInPreview('/api/auth/logout')).toBe(false);
    // Password sign-in stays reachable so staff can use the admin; the route itself refuses non-staff in preview.
    expect(isSignInBlockedInPreview('/api/auth/login-with-password')).toBe(false);
    expect(isSignInBlockedInPreview('/api/auth/me')).toBe(false);
    expect(isSignInBlockedInPreview('/api/products')).toBe(false);
  });

  it('answers 503 for sign-in and marks every page noindex while on', async () => {
    process.env.SITE_PREVIEW = '1';
    const blocked = middleware(req('/api/auth/send-whatsapp-otp'));
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toMatchObject({ code: 'auth_disabled' });
    expect(middleware(req('/product/classic-wooden-frame')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
  });

  it('changes nothing when off', () => {
    const res = middleware(req('/api/auth/send-whatsapp-otp'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
    expect(JSON.stringify(robots().rules)).toContain('/admin');
  });
});
